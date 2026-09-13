// 应用元信息（设置页「关于」用）。
//
// 值来自 `tauri.conf.json`（productName / version / identifier），由 Tauri 的 app
// 插件读取，不需要自己加 Rust 命令。浏览器预览下没有原生运行时 → 返回 null，
// 界面显示占位而不是假版本号（避免与真实包版本脱节）。

import { getIdentifier, getName, getVersion } from '@tauri-apps/api/app';
import { isTauri } from '../ipc/transport';

export interface AppInfo {
    readonly name: string;
    readonly version: string;
    readonly identifier: string;
}

export async function readAppInfo(): Promise<AppInfo | null> {
    if (!isTauri) return null;
    const [name, version, identifier] = await Promise.all([
        getName(),
        getVersion(),
        getIdentifier(),
    ]);
    return { name, version, identifier };
}
