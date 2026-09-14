// 版本号一致性检查：package.json == src-tauri/tauri.conf.json == workspace Cargo.toml。
//
// 只读脚本：不写任何文件。任一不一致就以退出码 1 结束（pnpm run 会因此报错）。
//
// 用法：node scripts/check-versions.mjs

import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);

function readJson(relativePath) {
    return JSON.parse(readFileSync(new URL(relativePath, root), 'utf8'));
}

function readText(relativePath) {
    return readFileSync(new URL(relativePath, root), 'utf8');
}

/** 从 Cargo.toml 里取 `[workspace.package] version`（不引额外依赖，够用即可）。 */
function workspaceVersion(cargoToml) {
    const section = cargoToml.match(/\[workspace\.package\]([\s\S]*?)(\n\[|$)/);
    if (!section) return null;
    const version = section[1].match(/^\s*version\s*=\s*"([^"]+)"/m);
    return version ? version[1] : null;
}

const packageVersion = readJson('package.json').version;
const tauriVersion = readJson('src-tauri/tauri.conf.json').version;
const cargoVersion = workspaceVersion(readText('Cargo.toml'));

const entries = [
    ['package.json', packageVersion],
    ['src-tauri/tauri.conf.json', tauriVersion],
    ['Cargo.toml ([workspace.package])', cargoVersion],
];

const missing = entries.filter(([, value]) => !value);
if (missing.length > 0) {
    for (const [name] of missing) console.error(`✗ 读不到版本号：${name}`);
    process.exit(1);
}

const expected = packageVersion;
const mismatch = entries.filter(([, value]) => value !== expected);
if (mismatch.length > 0) {
    console.error(`✗ 版本号不一致（基准 ${expected}）：`);
    for (const [name, value] of entries) {
        console.error(`    - ${name}: ${value}`);
    }
    process.exit(1);
}

console.log(`✓ 版本号三处一致：${expected}`);
for (const [name, value] of entries) {
    console.log(`    - ${name}: ${value}`);
}
