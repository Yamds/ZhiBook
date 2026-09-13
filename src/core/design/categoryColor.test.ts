// 分类颜色规则测试（BRD 3.5）。

import { describe, expect, it } from 'vitest';
import {
    CATEGORY_COLOR_PALETTE,
    THEME_COLOR_TOKEN,
    TINT_RATIO_DARK,
    TINT_RATIO_LIGHT,
    categoryColors,
    isFixedColor,
    mixHex,
    parseHexColor,
    relativeLuminance,
    resolveCategoryForeground,
    tintRatioFor,
} from './categoryColor';

describe('parseHexColor', () => {
    it('支持 3 位与 6 位、带不带 #', () => {
        expect(parseHexColor('#fff')).toEqual([255, 255, 255]);
        expect(parseHexColor('ff6b3d')).toEqual([255, 107, 61]);
        expect(parseHexColor('#FF6B3D')).toEqual([255, 107, 61]);
    });

    it('非法输入返回 null', () => {
        expect(parseHexColor('theme')).toBeNull();
        expect(parseHexColor('#12345')).toBeNull();
        expect(parseHexColor('rgb(1,2,3)')).toBeNull();
    });
});

describe('mixHex', () => {
    it('比例 0 = 背景色，1 = 前景色', () => {
        expect(mixHex('#ffffff', '#000000', 0)).toBe('#000000');
        expect(mixHex('#ffffff', '#000000', 1)).toBe('#ffffff');
    });

    it('按比例线性混合', () => {
        // 黑底混白 50% → 灰 128（0x80）
        expect(mixHex('#ffffff', '#000000', 0.5)).toBe('#808080');
        // 14% 白混入黑 → 36
        expect(mixHex('#ffffff', '#000000', 0.14)).toBe('#242424');
    });

    it('非法颜色退回背景色', () => {
        expect(mixHex('brand', '#123456', 0.5)).toBe('#123456');
    });
});

describe('tintRatioFor', () => {
    it('亮面用 14%、暗面用 22%', () => {
        expect(tintRatioFor('#ffffff')).toBe(TINT_RATIO_LIGHT);
        expect(tintRatioFor('#f7f3ef')).toBe(TINT_RATIO_LIGHT);
        expect(tintRatioFor('#1e1e2e')).toBe(TINT_RATIO_DARK);
        expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
        expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    });
});

describe('resolveCategoryForeground', () => {
    it('theme 用主题色，固定色原样返回，非法值回落主题色', () => {
        expect(resolveCategoryForeground(THEME_COLOR_TOKEN, '#ff6b3d')).toBe('#ff6b3d');
        expect(resolveCategoryForeground('#22c55e', '#ff6b3d')).toBe('#22c55e');
        expect(resolveCategoryForeground('红色', '#ff6b3d')).toBe('#ff6b3d');
    });

    it('isFixedColor 只认固定色', () => {
        expect(isFixedColor('#22c55e')).toBe(true);
        expect(isFixedColor(THEME_COLOR_TOKEN)).toBe(false);
        expect(isFixedColor('nope')).toBe(false);
    });
});

describe('categoryColors', () => {
    it('背景 = 前景混入卡片面，且比前景更浅（浅色主题）', () => {
        const { foreground, background } = categoryColors('#3b82f6', '#ff6b3d', '#ffffff');
        expect(foreground).toBe('#3b82f6');
        expect(background).not.toBe(foreground);
        expect(relativeLuminance(background)).toBeGreaterThan(relativeLuminance(foreground));
    });

    it('theme 分类跟随主题色', () => {
        const { foreground } = categoryColors(THEME_COLOR_TOKEN, '#ff6b3d', '#ffffff');
        expect(foreground).toBe('#ff6b3d');
    });

    it('调色板里的颜色都能算出一组色', () => {
        expect(CATEGORY_COLOR_PALETTE.length).toBeGreaterThanOrEqual(8);
        for (const color of CATEGORY_COLOR_PALETTE) {
            const { foreground, background } = categoryColors(color, '#ff6b3d', '#1e1e2e');
            expect(parseHexColor(foreground)).not.toBeNull();
            expect(parseHexColor(background)).not.toBeNull();
        }
    });
});
