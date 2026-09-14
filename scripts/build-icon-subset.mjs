// 生成离线图标子集、图标类型/目录与内置分类种子数据。
//
//   node scripts/build-icon-subset.mjs          # 生成
//   node scripts/build-icon-subset.mjs --check  # 只校验（CI / 预检用，不写文件）
//
// 输入：scripts/icon-catalog.mjs（手工目录）+ node_modules/@iconify-json/{mdi,simple-icons}
// 输出：
//   src/assets/icons/mdi-subset.json                 渲染用（IconifyJSON，addCollection 直接吃）
//   src/assets/icons/si-subset.json                  同上，simple-icons 品牌图标子集
//   src/core/design/icons.generated.ts               IconName 联合类型 + 选择器目录 + 内置分类
//   crates/tk-ledger/src/seed_categories.generated.rs  内置分类种子数据（与 TS 同源）
//
// 校验失败（图标名不存在）会列出全部缺失项并以非 0 退出，绝不静默产出半个子集。
// `--check` 还会比对四份产物是否与磁盘一致，防止手改生成文件。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_CATEGORIES, PICKER_GROUPS, UI_ICONS } from './icon-catalog.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const checkOnly = process.argv.includes('--check');

/** 读取一个 @iconify-json 集合。 */
function loadCollection(packageName, subsetFile) {
    const root = resolve(repoRoot, `node_modules/@iconify-json/${packageName}`);
    const set = JSON.parse(readFileSync(resolve(root, 'icons.json'), 'utf8'));
    const metaPath = resolve(root, 'metadata.json');
    const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : null;
    return { prefix: set.prefix, set, meta, subsetFile };
}

/** 图标集合注册表：键是目录文件里 `collection` 字段的取值，省略即 `mdi`。 */
const COLLECTIONS = {
    mdi: loadCollection('mdi', 'mdi-subset.json'),
    'simple-icons': loadCollection('simple-icons', 'si-subset.json'),
};

/** 内置分类的「分类名 → 完整图标名」视图（兼容旧引用）。 */
const categoryIcons = (kind) =>
    Object.fromEntries(DEFAULT_CATEGORIES[kind].map((item) => [item.name, `mdi:${item.icon}`]));

/** 解析别名链，返回最终 body；找不到返回 null。 */
function resolveBody(collection, name) {
    const { set } = COLLECTIONS[collection];
    let current = name;
    for (let depth = 0; depth < 8; depth += 1) {
        const direct = set.icons[current];
        if (direct) return direct.body;
        const alias = set.aliases?.[current];
        if (!alias) return null;
        if (alias.parent) {
            current = alias.parent;
            continue;
        }
        return null;
    }
    return null;
}

/** 收集目录里出现的所有图标（UI + 内置分类 + 选择器分组 + 别名键）。 */
function collectEntries() {
    const map = new Map();
    const add = (collection, name) => {
        const full = `${collection}:${name}`;
        if (!map.has(full)) map.set(full, { collection, name, full });
    };
    Object.values(UI_ICONS).forEach((name) => add('mdi', name));
    for (const kind of ['expense', 'income']) {
        DEFAULT_CATEGORIES[kind].forEach((item) => add('mdi', item.icon));
    }
    for (const group of PICKER_GROUPS) {
        const collection = group.collection ?? 'mdi';
        group.icons.forEach((name) => add(collection, name));
        Object.keys(group.aliases ?? {}).forEach((name) => add(collection, name));
    }
    return [...map.values()].sort((a, b) => a.full.localeCompare(b.full));
}

const entries = collectEntries();

// ---- 校验 ----
const missing = [];
const bodies = new Map();
for (const entry of entries) {
    if (!COLLECTIONS[entry.collection]) {
        missing.push(`${entry.full}（未知集合 ${entry.collection}）`);
        continue;
    }
    const body = resolveBody(entry.collection, entry.name);
    if (!body) missing.push(entry.full);
    else bodies.set(entry.full, body);
}

// 内置分类图标必须在选择器目录里也有候选（否则用户改不回去）
const pickerNames = new Set(
    PICKER_GROUPS.flatMap((group) =>
        group.icons.map((name) => `${group.collection ?? 'mdi'}:${name}`),
    ),
);
const defaultNames = [...DEFAULT_CATEGORIES.expense, ...DEFAULT_CATEGORIES.income].map(
    (item) => `mdi:${item.icon}`,
);
const defaultsNotInPicker = [...new Set(defaultNames)].filter((name) => !pickerNames.has(name));

if (missing.length > 0) {
    console.error(`✗ 有 ${missing.length} 个图标名不存在于对应集合：`);
    for (const name of missing) console.error(`    - ${name}`);
    console.error('\n请修正 scripts/icon-catalog.mjs 后重跑。');
    process.exit(1);
}

console.log(`✓ 图标名校验通过：${entries.length} 个（其中选择器候选 ${pickerNames.size} 个）`);
if (defaultsNotInPicker.length > 0) {
    console.warn(`! 内置分类图标不在选择器候选里（用户无法重新选回）：${defaultsNotInPicker.join(', ')}`);
}

// ---- 渲染产物 ----
const catalog = [];
const seen = new Set();
for (const group of PICKER_GROUPS) {
    const collection = group.collection ?? 'mdi';
    for (const name of group.icons) {
        const full = `${collection}:${name}`;
        if (seen.has(full)) continue;
        seen.add(full);
        const aliases = Object.entries(group.aliases ?? {})
            .filter(([, aliasedIcons]) => Array.isArray(aliasedIcons) && aliasedIcons.includes(name))
            .flatMap(([aliasName]) => [aliasName]);
        // 别名键是「另一个名字」，它的中文别名统一挂到本图标上
        const chineseAliases = Object.entries(group.aliases ?? {})
            .filter(([aliasName, list]) => aliasName === name && Array.isArray(list))
            .flatMap(([, list]) => list);
        catalog.push({
            name: full,
            group: group.id,
            aliases: [...new Set([...chineseAliases, ...aliases.filter((a) => a !== name)])],
        });
    }
}

const unionLines = entries.map((entry) => `    | '${entry.full}'`).join('\n');
const iconNameListLines = entries.map((entry) => `    '${entry.full}',`).join('\n');
const groupLines = PICKER_GROUPS.map((group) => `    ${JSON.stringify(group.id)},`).join('\n');
const uiIconLines = Object.entries(UI_ICONS)
    .map(([key, name]) => `    ${key}: 'mdi:${name}',`)
    .join('\n');
const catalogLines = catalog
    .map((entry) => `    { name: ${JSON.stringify(entry.name)}, group: ${JSON.stringify(entry.group)}, aliases: ${JSON.stringify(entry.aliases)} },`)
    .join('\n');
const defaultCategoryLines = (kind) => DEFAULT_CATEGORIES[kind]
    .map((item) => `        { id: ${JSON.stringify(item.id)}, kind: '${kind}', name: ${JSON.stringify(item.name)}, iconName: 'mdi:${item.icon}' },`)
    .join('\n');
const defaultIconLines = (kind) => Object.entries(categoryIcons(kind))
    .map(([category, name]) => `        ${JSON.stringify(category)}: '${name}',`)
    .join('\n');

const generatedText = `// 由 scripts/build-icon-subset.mjs 生成，请勿手改。
// 重新生成：pnpm run icons（目录在 scripts/icon-catalog.mjs）
//
// mdi 全集有 ${Object.keys(COLLECTIONS.mdi.set.icons).length} 个图标、simple-icons 有 ${Object.keys(COLLECTIONS['simple-icons'].set.icons).length} 个，
// 这里只保留精选子集：渲染数据见 src/assets/icons/mdi-subset.json 与 si-subset.json。

/** 工程内允许使用的图标名（Iconify name，形如 mdi:noodles / simple-icons:alipay）。 */
export type IconName =
${unionLines};

/** IconName 的运行时清单（校验 IPC 传回的图标名时用）。 */
export const ICON_NAMES: readonly IconName[] = [
${iconNameListLines}
];

export interface IconCatalogEntry {
    readonly name: IconName;
    /** 选择器里的中文分组。 */
    readonly group: string;
    /** 搜索用的中文别名。 */
    readonly aliases: readonly string[];
}

/** 工程 UI 图标：语义名 → Iconify name。 */
export const UI_ICONS = {
${uiIconLines}
} as const satisfies Record<string, IconName>;

/** 选择器分组顺序。 */
export const ICON_GROUPS: readonly string[] = [
${groupLines}
];

/** 选择器候选图标。 */
export const ICON_CATALOG: readonly IconCatalogEntry[] = [
${catalogLines}
];

/** 内置分类条目（顺序即宫格顺序）。 */
export interface DefaultCategory {
    /** 稳定主键：种子数据落库后不得改名。 */
    readonly id: string;
    readonly kind: 'expense' | 'income';
    readonly name: string;
    readonly iconName: IconName;
}

/** 内置分类（与 Rust 侧 crates/tk-ledger/src/seed_categories.generated.rs 同源）。 */
export const DEFAULT_CATEGORIES: {
    readonly expense: readonly DefaultCategory[];
    readonly income: readonly DefaultCategory[];
} = {
    expense: [
${defaultCategoryLines('expense')}
    ],
    income: [
${defaultCategoryLines('income')}
    ],
};

/** 兼容视图：分类名 → 完整图标名。 */
export const DEFAULT_CATEGORY_ICONS: {
    readonly expense: Readonly<Record<string, IconName>>;
    readonly income: Readonly<Record<string, IconName>>;
} = {
    expense: {
${defaultIconLines('expense')}
    },
    income: {
${defaultIconLines('income')}
    },
};
`;

const rustLines = (kind) => DEFAULT_CATEGORIES[kind]
    .map((item) => `    SeedCategory {\n        id: ${JSON.stringify(`${kind}_${item.id}`)},\n        kind: "${kind}",\n        name: ${JSON.stringify(item.name)},\n        icon_name: ${JSON.stringify(`mdi:${item.icon}`)},\n    },`)
    .join('\n');
const generatedRustText = `// 由 scripts/build-icon-subset.mjs 生成，请勿手改。
// 重新生成：pnpm run icons（目录在 scripts/icon-catalog.mjs）
//
// 内置分类种子数据：与前端 \`DEFAULT_CATEGORIES\` 同一份目录，
// id 为「{kind}_{目录 id}」，落库后必须保持稳定。

use crate::seed::SeedCategory;

/// 内置分类（支出 ${DEFAULT_CATEGORIES.expense.length} / 收入 ${DEFAULT_CATEGORIES.income.length}），顺序即宫格顺序。
pub const SEED_CATEGORIES: &[SeedCategory] = &[
${rustLines('expense')}
${rustLines('income')}
];
`;

// ---- 集合子集文件 ----
const subsetTargets = Object.entries(COLLECTIONS)
    .map(([key, collection]) => {
        const icons = entries.filter((entry) => entry.collection === key);
        if (icons.length === 0) return null;
        const iconLines = icons
            .map((entry) => `    ${JSON.stringify(entry.name)}: { "body": ${JSON.stringify(bodies.get(entry.full))} }`)
            .join(',\n');
        const text = `{
  "prefix": ${JSON.stringify(collection.prefix)},
  "width": 24,
  "height": 24,
  "icons": {
${iconLines}
  }
}
`;
        const label = `src/assets/icons/${collection.subsetFile}`;
        return { path: resolve(repoRoot, label), text, label, count: icons.length };
    })
    .filter(Boolean);

const targets = [
    ...subsetTargets,
    { path: resolve(repoRoot, 'src/core/design/icons.generated.ts'), text: generatedText, label: 'src/core/design/icons.generated.ts' },
    { path: resolve(repoRoot, 'crates/tk-ledger/src/seed_categories.generated.rs'), text: generatedRustText, label: 'crates/tk-ledger/src/seed_categories.generated.rs' },
];

if (checkOnly) {
    const stale = targets.filter((target) => !existsSync(target.path) || readFileSync(target.path, 'utf8') !== target.text);
    if (stale.length > 0) {
        console.error(`✗ 以下生成产物与目录不一致（请运行 pnpm run icons）：`);
        for (const target of stale) console.error(`    - ${target.label}`);
        process.exit(1);
    }
    console.log(`✓ --check 模式：${targets.length} 份生成产物均与 scripts/icon-catalog.mjs 一致，未写入文件。`);
    process.exit(0);
}

for (const target of targets) {
    mkdirSync(dirname(target.path), { recursive: true });
    writeFileSync(target.path, target.text, 'utf8');
}

for (const target of subsetTargets) {
    const subsetKb = (Buffer.byteLength(target.text, 'utf8') / 1024).toFixed(1);
    console.log(`✓ 已生成 ${target.label}（${subsetKb} KB，${target.count} 图标）`);
}
console.log(`✓ 已生成 src/core/design/icons.generated.ts（${catalog.length} 个选择器候选）`);
console.log(`✓ 已生成 crates/tk-ledger/src/seed_categories.generated.rs（${DEFAULT_CATEGORIES.expense.length + DEFAULT_CATEGORIES.income.length} 个内置分类）`);
const mdiMeta = COLLECTIONS.mdi.meta;
if (mdiMeta && Object.keys(mdiMeta.categories ?? {}).length > 0) {
    console.log(`  （mdi 元数据含 ${Object.keys(mdiMeta.categories).length} 个官方分类，可作后续扩充参考）`);
}
