// 启动页签：与底部导航注册表保持一致的跨层约定。

import { describe, expect, it } from 'vitest';
import { APP_ROUTES, HOME_ROUTE } from '../../../app/navigation';
import {
    DEFAULT_STARTUP_TAB,
    STARTUP_TABS,
    isStartupTab,
    normalizeStartupTab,
} from './startupTab';

describe('启动页签契约', () => {
    it('与底部 5 个页签的 id / 顺序 / 文案完全一致', () => {
        expect(STARTUP_TABS.map((tab) => tab.value)).toEqual(APP_ROUTES.map((route) => route.id));
        expect(STARTUP_TABS.map((tab) => tab.label)).toEqual(APP_ROUTES.map((route) => route.label));
    });

    it('默认页签就是首页（日历）', () => {
        expect(DEFAULT_STARTUP_TAB).toBe(HOME_ROUTE);
    });

    it('非法值落回默认页签', () => {
        expect(normalizeStartupTab('add')).toBe('add');
        expect(normalizeStartupTab('settings')).toBe(DEFAULT_STARTUP_TAB);
        expect(normalizeStartupTab('')).toBe(DEFAULT_STARTUP_TAB);
        expect(normalizeStartupTab(undefined)).toBe(DEFAULT_STARTUP_TAB);
        expect(isStartupTab('assets')).toBe(true);
        expect(isStartupTab('settings')).toBe(false);
    });
});
