// 图标名收口测试：数据库回传的名字必须能安全落到 IconName。

import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from './icons.generated';
import { FALLBACK_ICON_NAME, isIconName, toIconName } from './iconName';

describe('iconName', () => {
    it('内置分类图标名全部认得（种子数据不会渲染出灰框）', () => {
        const items = [...DEFAULT_CATEGORIES.expense, ...DEFAULT_CATEGORIES.income];
        expect(items.length).toBeGreaterThan(0);
        for (const item of items) {
            expect(isIconName(item.iconName)).toBe(true);
            expect(toIconName(item.iconName)).toBe(item.iconName);
        }
    });

    it('未知名字落兜底，且允许自定义兜底', () => {
        expect(toIconName('mdi:not-a-real-icon')).toBe(FALLBACK_ICON_NAME);
        expect(toIconName(null)).toBe(FALLBACK_ICON_NAME);
        expect(toIconName(undefined)).toBe(FALLBACK_ICON_NAME);
        expect(toIconName('mdi:not-a-real-icon', 'mdi:tag-outline')).toBe('mdi:tag-outline');
    });

    it('拒绝非字符串输入', () => {
        expect(isIconName(42)).toBe(false);
        expect(isIconName({ name: 'mdi:noodles' })).toBe(false);
        expect(isIconName('')).toBe(false);
    });
});
