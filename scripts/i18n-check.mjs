// i18n 护栏：把「所有界面文案都从语言文件取」这件事钉成可执行的检查。
//
// 做三件事：
//   1. 反向覆盖：源码里出现的每个 `t('key')` / `xxxKey: 'key'` 都必须在 zh-CN.json 里有值；
//      键缺失直接失败（这类错误在运行时只会安静地显示成 key 本身，很难发现）。
//   2. 正向残留：源码里还剩下的中文字符串字面量 / JSX 文本报出来。
//      默认只警告，`--strict` 时失败（CI 用）。
//   3. Rust 错误码覆盖：Rust 侧产出的每个错误码都要有 `rust.<code>` 条目
//      （缺了就失败——那会让错误退回中文 message，等于文案改不动）。
//
// 排除规则（不是界面文案）：
//   - 注释行（含 Rust 文档注释里的示例）
//   - 生成文件（*.generated.*）
//   - 测试文件（测试断言中文是刻意的：默认语言就是 zh-CN）
//   - 带 `i18n-allow` 标记的行（落库数据 / 协议专有名词等）

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const srcRoot = join(repoRoot, 'src');
const localePath = join(srcRoot, 'core', 'i18n', 'locales', 'zh-CN.json');

const strict = process.argv.includes('--strict');
const CJK = /[\u4e00-\u9fff]/;

/** 递归收集待检查的源文件。 */
function collectSourceFiles(dir) {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...collectSourceFiles(full));
            continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        if (entry.name.includes('.test.')) continue;
        if (entry.name.includes('.generated.')) continue;
        out.push(full);
    }
    return out;
}

/** 展平语言文件成 `a.b.c` → value 的 Map。 */
function flatten(node, prefix = '', out = new Map()) {
    for (const [key, value] of Object.entries(node)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object') flatten(value, path, out);
        else out.set(path, value);
    }
    return out;
}

const locale = JSON.parse(readFileSync(localePath, 'utf8'));
const localeKeys = flatten(locale);

const files = collectSourceFiles(srcRoot);

// ---------------------------------------------------------------------------
// 1. 反向覆盖：源码引用的 key 必须在语言文件里
// ---------------------------------------------------------------------------

/** 源码里静态引用 key 的三种写法。 */
const KEY_PATTERNS = [
    // t('a.b') / t("a.b") / translate('a.b')
    /\b(?:t|translate)\(\s*['"]([A-Za-z][\w.-]*)['"]/g,
    // labelKey: 'a.b' / titleKey: 'a.b' / noteKey / questionKey / ...
    // 注意：不匹配裸 `key:`（InfoBar 的去重 key 也叫 key，不是 i18n key）。
    /\b\w+Key:\s*['"]([A-Za-z][\w.-]*)['"]/g,
];

/**
 * 动态前缀（`category.expense.<id>` 这类）不参与静态检查，单独放行。
 *
 * `rust.` 下的 key 是 Rust 的错误码（`code: 'ledger.book.not_found'`），
 * 前端在 `core/domain/errors.ts` 里拼成 `rust.<code>` 查表，源码里没有静态引用。
 */
const DYNAMIC_PREFIXES = ['category.', 'iconGroup.', 'help.faq.', 'unit.', 'rust.'];

const missing = [];
const used = new Set();

for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const pattern of KEY_PATTERNS) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(text)) !== null) {
            const key = match[1];
            used.add(key);
            if (!localeKeys.has(key)) {
                missing.push({ file: relative(repoRoot, file), key });
            }
        }
    }
}

// 动态前缀只校验「前缀下至少有一条」。
for (const prefix of DYNAMIC_PREFIXES) {
    const has = [...localeKeys.keys()].some((key) => key.startsWith(prefix));
    if (!has) missing.push({ file: '(dynamic)', key: `${prefix}*（前缀下没有任何条目）` });
}

// ---------------------------------------------------------------------------
// 2. 正向残留：源码里还没提取的中文字面量
// ---------------------------------------------------------------------------

const leftovers = [];
for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
        // `i18n-allow` 可以写在本行，也可以写在上一行（用注释标注某个常量是落库数据）。
        if (line.includes('i18n-allow')) return;
        if ((lines[index - 1] ?? '').includes('i18n-allow')) return;
        if (!CJK.test(line)) return;
        // 只报「引号内 / JSX 文本」出现中文的
        const inString = /['"`][^'"`]*[\u4e00-\u9fff][^'"`]*['"`]/.test(line);
        const inJsxText = />[^<>{}]*[\u4e00-\u9fff]/.test(line);
        if (!inString && !inJsxText) return;
        leftovers.push(`${relative(repoRoot, file)}:${index + 1}  ${trimmed.slice(0, 120)}`);
    });
}

// ---------------------------------------------------------------------------
// 3. 反向：语言文件里 0 引用的条目（只提示，不算错——动态 key 会命中这里）
// ---------------------------------------------------------------------------

const unused = [...localeKeys.keys()].filter(
    (key) => !used.has(key) && !DYNAMIC_PREFIXES.some((prefix) => key.startsWith(prefix)),
);

// ---------------------------------------------------------------------------
// 4. Rust 错误码：源码里产出的 code 必须能找到 `rust.<code>`
// ---------------------------------------------------------------------------
//
// 前端在 `src/core/domain/errors.ts` 里把 `ErrorPayload.code` 拼成 `rust.<code>` 查表，
// 查不到就退回 Rust 给的中文 message。那种情况下错误能显示，但**文案改不动**，
// 单看界面根本发现不了——所以这里直接扫 Rust 源码，把缺口钉死。

/** Rust 侧产出错误码的三种写法（code 都是第一个字符串字面量）。 */
const RUST_CODE_CALLS = ['error_payload!', 'ErrorPayload::new', 'map_unique_violation'];

/**
 * 不参与检查的码：
 * `app.error` 来自 `impl IntoErrorPayload for String/&str`（message 完全动态，没有模板可写）。
 */
const RUST_CODE_ALLOWLIST = new Set(['app.error']);

/** 错误码形态：`<域>.<具体错误>`（小写 + 下划线 + 数字，至少两段）。 */
const RUST_CODE_SHAPE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;

function collectRustFiles(dir) {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            // gen/ 是 Tauri 生成的 Android 工程，target/ 是构建产物
            if (['target', 'node_modules', 'gen'].includes(entry.name)) continue;
            out.push(...collectRustFiles(full));
            continue;
        }
        if (entry.name.endsWith('.rs')) out.push(full);
    }
    return out;
}

/** 从 `text[open]` 的 `(` 开始，返回配对括号内的内容（跳过字符串里的括号）。 */
function balancedArgs(text, open) {
    let depth = 0;
    let inString = false;
    for (let i = open; i < text.length; i += 1) {
        const ch = text[i];
        if (inString) {
            if (ch === '\\') i += 1;
            else if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') inString = true;
        else if (ch === ')') {
            depth -= 1;
            if (depth === 0) return text.slice(open + 1, i);
        } else if (ch === '(') depth += 1;
    }
    return text.slice(open + 1);
}

/** 该位置是否落在注释行（`//` / `///` / `//!` / `*` 开头）或标了 `i18n-allow`。 */
function isSkippableRustLine(text, index) {
    const lineStart = text.lastIndexOf('\n', index) + 1;
    const lineEnd = text.indexOf('\n', index);
    const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return true;
    return line.includes('i18n-allow');
}

/** code → 出现位置（`文件:行`）。 */
const rustCodes = new Map();

for (const dir of ['crates', 'src-tauri/src']) {
    for (const file of collectRustFiles(join(repoRoot, dir))) {
        const text = readFileSync(file, 'utf8');
        for (const call of RUST_CODE_CALLS) {
            const pattern = new RegExp(`${call}\\s*\\(`, 'g');
            let match;
            while ((match = pattern.exec(text)) !== null) {
                if (isSkippableRustLine(text, match.index)) continue;
                const open = text.indexOf('(', match.index + call.length);
                const literals = [...balancedArgs(text, open).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(
                    (item) => item[1],
                );
                const code = literals[0];
                // 首参是变量（如 `ErrorPayload::new(code, ...)`）时，第一个字面量其实
                // 是 message，形态校验会把它挡掉。
                if (!code || !RUST_CODE_SHAPE.test(code)) continue;
                if (RUST_CODE_ALLOWLIST.has(code)) continue;
                const line = text.slice(0, match.index).split('\n').length;
                if (!rustCodes.has(code)) {
                    rustCodes.set(code, `${relative(repoRoot, file)}:${line}`);
                }
            }
        }
    }
}

const rustMissing = [...rustCodes.entries()]
    .filter(([code]) => !localeKeys.has(`rust.${code}`))
    .sort((a, b) => a[0].localeCompare(b[0]));

const rustStale = [...localeKeys.keys()]
    .filter((key) => key.startsWith('rust.') && !rustCodes.has(key.slice('rust.'.length)))
    .sort();

// ---------------------------------------------------------------------------
// 报告
// ---------------------------------------------------------------------------

let failed = false;

if (missing.length > 0) {
    failed = true;
    console.error(`✗ ${missing.length} 个引用的 key 在 zh-CN.json 里不存在：`);
    for (const item of missing) console.error(`    ${item.key}   (${item.file})`);
} else {
    console.log(`✓ key 覆盖：源码引用的 key 都能在 zh-CN.json 里找到（共 ${localeKeys.size} 条）`);
}

if (unused.length > 0) {
    console.warn(`! ${unused.length} 条语言文件条目当前没有静态引用（动态 key 属正常）：`);
    for (const key of unused.slice(0, 20)) console.warn(`    ${key}`);
    if (unused.length > 20) console.warn(`    … 另有 ${unused.length - 20} 条`);
}

if (leftovers.length > 0) {
    const report = `! 源码里还有 ${leftovers.length} 处中文字面量未提取：`;
    if (strict) {
        console.error(report);
        for (const line of leftovers) console.error(`    ${line}`);
        failed = true;
    } else {
        console.warn(report);
        for (const line of leftovers.slice(0, 30)) console.warn(`    ${line}`);
        if (leftovers.length > 30) console.warn(`    … 另有 ${leftovers.length - 30} 处`);
    }
} else {
    console.log('✓ 无残留：源码里没有未提取的中文字面量');
}

if (rustMissing.length > 0) {
    failed = true;
    console.error(`✗ ${rustMissing.length} 个 Rust 错误码在语言文件里没有 rust.* 条目：`);
    for (const [code, where] of rustMissing) console.error(`    rust.${code}   (${where})`);
} else {
    console.log(`✓ Rust 错误码覆盖：${rustCodes.size} 个码都有 rust.* 条目`);
}

if (rustStale.length > 0) {
    console.warn(`! ${rustStale.length} 条 rust.* 条目已经没有对应的 Rust 错误码（可以删）：`);
    for (const key of rustStale) console.warn(`    ${key}`);
}

process.exit(failed ? 1 : 0);
