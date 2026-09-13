// 图标名的运行时桥接。
//
// 分类 / 账户的图标名来自数据库（Rust 以 `string` 跨 IPC 传回），
// 而工程内渲染只接受 `IconName` 联合类型。这里做一次收口校验：
// 认识的直接用，不认识的（旧数据、手改的库、将来新增的图标）落到兜底图标，
// 避免 UI 里到处写 `as IconName`。

import { ICON_NAMES, type IconName } from './icons.generated';

const KNOWN: ReadonlySet<string> = new Set<string>(ICON_NAMES);

/** 兜底图标：形状模糊、语义中性，不误导用户。 */
export const FALLBACK_ICON_NAME: IconName = 'mdi:shape-outline';

/** 校验任意字符串是否是工程内可渲染的图标名。 */
export function isIconName(value: unknown): value is IconName {
    return typeof value === 'string' && KNOWN.has(value);
}

/** 把任意图标名收口成 `IconName`；不认识时返回 `fallback`。 */
export function toIconName(value: unknown, fallback: IconName = FALLBACK_ICON_NAME): IconName {
    return isIconName(value) ? value : fallback;
}
