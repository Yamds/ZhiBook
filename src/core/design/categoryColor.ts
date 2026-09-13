// 分类 / 账户颜色规则（BRD 3.5）。
//
// 每个分类有前景色与背景色：
//   - 前景色 = 主题色（`theme`，跟随主题）或用户从调色板选的固定色；
//   - 背景色 = 前景色按比例混入卡片面（浅色主题 ~14%，暗色主题 ~22%），保证对比度。
//
// 混色在 JS 里算成具体 hex：不依赖 `color-mix()` 的浏览器支持，
// 也让「前景/背景」可以被单测钉住（后端只存一个 color 字段）。

/** `color` 字段取这个值表示「跟随主题色」。 */
export const THEME_COLOR_TOKEN = 'theme';

/** 浅色主题下的背景混入比例。 */
export const TINT_RATIO_LIGHT = 0.14;
/** 暗色主题下的背景混入比例。 */
export const TINT_RATIO_DARK = 0.22;
/** 判定亮/暗面的亮度阈值（0..1，相对亮度）。 */
export const DARK_SURFACE_LUMINANCE = 0.5;

/** 可为分类挑选的固定色（前景色）。 */
export const CATEGORY_COLOR_PALETTE: readonly string[] = [
    '#ef4444',
    '#f97316',
    '#f59e0b',
    '#22c55e',
    '#14b8a6',
    '#06b6d4',
    '#3b82f6',
    '#6366f1',
    '#8b5cf6',
    '#ec4899',
    '#78716c',
    '#0ea5e9',
];

/** `#RGB` / `#RRGGBB` → [r, g, b]；非法返回 null。 */
export function parseHexColor(value: string): [number, number, number] | null {
    const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
    if (!match) return null;
    const raw = match[1] ?? '';
    const full =
        raw.length === 3
            ? raw
                  .split('')
                  .map((char) => char + char)
                  .join('')
            : raw;
    return [
        Number.parseInt(full.slice(0, 2), 16),
        Number.parseInt(full.slice(2, 4), 16),
        Number.parseInt(full.slice(4, 6), 16),
    ];
}

function toHex(value: number): string {
    return Math.round(Math.min(255, Math.max(0, value)))
        .toString(16)
        .padStart(2, '0');
}

/** 两个 hex 颜色按 `ratio`（0..1）线性混合，返回 `#rrggbb`。 */
export function mixHex(foreground: string, background: string, ratio: number): string {
    const fg = parseHexColor(foreground);
    const bg = parseHexColor(background);
    if (!fg || !bg) return background;
    const clamped = Math.min(1, Math.max(0, ratio));
    const channel = (index: 0 | 1 | 2): string =>
        toHex(fg[index] * clamped + bg[index] * (1 - clamped));
    return `#${channel(0)}${channel(1)}${channel(2)}`;
}

/** sRGB 相对亮度（0..1），用来判断卡片面是亮面还是暗面。 */
export function relativeLuminance(color: string): number {
    const rgb = parseHexColor(color);
    if (!rgb) return 1;
    const linear = rgb.map((channel) => {
        const value = channel / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/** 背景混入比例：暗面用 22%，亮面用 14%。 */
export function tintRatioFor(surfaceColor: string): number {
    return relativeLuminance(surfaceColor) < DARK_SURFACE_LUMINANCE
        ? TINT_RATIO_DARK
        : TINT_RATIO_LIGHT;
}

/** `color` 字段是否为固定色（可编辑）；`theme` 表示跟随主题。 */
export function isFixedColor(color: string): boolean {
    return color !== THEME_COLOR_TOKEN && parseHexColor(color) !== null;
}

/**
 * 解析前景色：`theme` 用主题色，其余按固定 hex；非法值回落到主题色。
 */
export function resolveCategoryForeground(color: string, brandColor: string): string {
    if (color === THEME_COLOR_TOKEN) return brandColor;
    return parseHexColor(color) ? color : brandColor;
}

/**
 * 分类背景色 = 前景色混入卡片面。
 *
 * @param color  分类的 `color` 字段（`theme` 或 `#RRGGBB`）
 * @param brandColor 主题色（`--brand-500`，由 `useThemeTokens` 解析）
 * @param surfaceColor 卡片面（`--surface-card`，由 `useThemeTokens` 解析）
 */
export function categoryColors(
    color: string,
    brandColor: string,
    surfaceColor: string,
): { foreground: string; background: string } {
    const foreground = resolveCategoryForeground(color, brandColor);
    return {
        foreground,
        background: mixHex(foreground, surfaceColor, tintRatioFor(surfaceColor)),
    };
}
