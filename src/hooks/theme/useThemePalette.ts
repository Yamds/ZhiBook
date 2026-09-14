// 主题分类色板：把 `tokens.css` 里当前主题的 `--palette-*` 读成 hex，并补足中性灰阶。
//
// 为什么放在 hook 里而不是写成静态常量：色板是**主题自带**的（Catppuccin / Everforest /
// Nord 都有各自的官方色），12 套主题 + follow system 无法用一个常量表达。色值仍然只写在
// `tokens.css`（design token 层），`useThemeTokens` 用 DOM 探针读 computed color，
// 手动切主题（`data-theme`）与系统明暗切换都会自动刷新。
//
// 最终色板 = 9 色相（红橙黄绿青蓝靛紫粉）+ 4 级中性灰阶，
// 覆盖饼图 Top10 + 「其它」合并桶；灰阶由当前主题的画布面与主文字混出（见 neutralRamp）。

import { useMemo } from 'react';
import {
    PALETTE_HUE_KEYS,
    neutralRamp,
    type PaletteHueKey,
} from '../../core/design/categoryColor';
import { useThemeTokens } from './useThemeTokens';

/** 各色相兜底值 = 基础浅色主题在 tokens.css 的取值（探针不可用时使用）。 */
const HUE_FALLBACKS: Record<PaletteHueKey, string> = {
    red: '#e85b57',
    orange: '#f2762f',
    yellow: '#e8a72e',
    green: '#4fb477',
    cyan: '#14a3a0',
    blue: '#3d96ed',
    indigo: '#5b6ee1',
    purple: '#a280e8',
    pink: '#f58fb6',
};

const SURFACE_FALLBACK = '#ffffff';
const TEXT_FALLBACK = '#2c1f18';

export interface ThemePalette {
    /** 9 个语义色相（红橙黄绿青蓝靛紫粉）。 */
    hues: string[];
    /** 4 级中性灰阶（淡 → 深），由主题画布面与主文字混出。 */
    ramp: string[];
    /** hues + ramp，取色按索引直接取。 */
    palette: string[];
}

export function useThemePalette(): ThemePalette {
    const tokens = useThemeTokens({
        red: { name: '--palette-red', fallback: HUE_FALLBACKS.red },
        orange: { name: '--palette-orange', fallback: HUE_FALLBACKS.orange },
        yellow: { name: '--palette-yellow', fallback: HUE_FALLBACKS.yellow },
        green: { name: '--palette-green', fallback: HUE_FALLBACKS.green },
        cyan: { name: '--palette-cyan', fallback: HUE_FALLBACKS.cyan },
        blue: { name: '--palette-blue', fallback: HUE_FALLBACKS.blue },
        indigo: { name: '--palette-indigo', fallback: HUE_FALLBACKS.indigo },
        purple: { name: '--palette-purple', fallback: HUE_FALLBACKS.purple },
        pink: { name: '--palette-pink', fallback: HUE_FALLBACKS.pink },
        surface: { name: '--surface-card', fallback: SURFACE_FALLBACK },
        text: { name: '--text-primary', fallback: TEXT_FALLBACK },
    });

    const key = `${PALETTE_HUE_KEYS.map((hue) => tokens[hue]).join(',')}|${tokens.surface}|${tokens.text}`;
    return useMemo(() => {
        const hues = PALETTE_HUE_KEYS.map((hue) => tokens[hue]);
        const ramp = neutralRamp(tokens.surface, tokens.text);
        return { hues, ramp, palette: [...hues, ...ramp] };
        // key 覆盖了上面用到的全部 token；tokens 是 useThemeTokens 的 state 快照。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
}
