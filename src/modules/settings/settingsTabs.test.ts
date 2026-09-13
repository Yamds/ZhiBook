import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS_TAB, SETTINGS_TABS, SETTINGS_TAB_ORDER } from './settingsTabs';

describe('settingsTabs 注册表', () => {
    it('顺序为 功能 → 外观 → 关于，「功能」在「外观」之前', () => {
        expect(SETTINGS_TAB_ORDER).toEqual(['feature', 'appearance', 'about']);
        expect(SETTINGS_TABS.map((tab) => tab.label)).toEqual(['功能', '外观', '关于']);
    });

    it('默认打开第一个页签（功能）', () => {
        expect(DEFAULT_SETTINGS_TAB).toBe('feature');
        expect(DEFAULT_SETTINGS_TAB).toBe(SETTINGS_TAB_ORDER[0]);
    });

    it('页签 value 不重复', () => {
        expect(new Set(SETTINGS_TAB_ORDER).size).toBe(SETTINGS_TAB_ORDER.length);
    });
});
