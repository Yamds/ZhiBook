// 导航注册表与导航 store 的行为测试。
//
// 覆盖 P1 引入的三条关键规则：
//   1. 页签顺序固定为 账单-明细-日历-添加-资产，首页是日历
//   2. 跨页意图（金额/日期等参数）是一次性的，消费后清空
//   3. 重复点击已激活页签 = retap，只对当前页生效

import { beforeEach, describe, expect, it } from 'vitest';
import {
    APP_ROUTES,
    HOME_ROUTE,
    ROUTE_ORDER,
    SETTINGS_TAB,
    bottomNavTabs,
    routeTitle,
} from './navigation';
import {
    backActionFor,
    clearNavigationIntent,
    navigationStore,
    navigateTo,
    retapScreen,
} from './navigationStore';

beforeEach(() => {
    navigationStore._reset();
});

describe('navigation registry', () => {
    it('页签顺序为 账单 → 明细 → 日历 → 添加 → 资产', () => {
        expect(ROUTE_ORDER).toEqual(['bills', 'details', 'home', 'add', 'assets']);
        expect(APP_ROUTES.map((route) => route.label)).toEqual(['账单', '明细', '日历', '添加', '资产']);
    });

    it('首页固定是日历页', () => {
        expect(HOME_ROUTE).toBe('home');
        expect(navigationStore.getSnapshot().screen).toBe('home');
    });

    it('设置页不在页签里，但可以取到标题', () => {
        expect(ROUTE_ORDER).not.toContain('settings');
        expect(routeTitle('settings')).toBe('设置');
        expect(routeTitle('bills')).toBe('账单');
    });

    it('在设置页时，日历槽位被设置替身占用', () => {
        expect(bottomNavTabs('bills').map((tab) => tab.id))
            .toEqual(['bills', 'details', 'home', 'add', 'assets']);

        const onSettings = bottomNavTabs('settings').map((tab) => tab.id);
        expect(onSettings).toEqual(['bills', 'details', 'settings', 'add', 'assets']);
        expect(onSettings).not.toContain('home');
    });

    it('设置替身页签与普通页签同源（图标 / 文案复用注册表）', () => {
        const slot = bottomNavTabs('settings')[2];
        expect(slot).toBe(SETTINGS_TAB);
        expect(slot?.label).toBe('设置');
        expect(slot?.icon).toBeDefined();
    });
});

describe('back key actions', () => {
    it('弹层打开时优先关闭弹层', () => {
        expect(backActionFor('home', true)).toBe('close-overlay');
        expect(backActionFor('settings', true)).toBe('close-overlay');
    });

    it('设置页返回 = 回日历，绝不弹退出框', () => {
        expect(backActionFor('settings', false)).toBe('go-home');
        expect(backActionFor('bills', false)).toBe('go-home');
        expect(backActionFor('details', false)).toBe('go-home');
    });

    it('只有日历首页才弹退出确认', () => {
        expect(backActionFor('home', false)).toBe('confirm-exit');
    });
});

describe('navigation store', () => {
    it('navigateTo 切页并递增 seq', () => {
        const before = navigationStore.getSnapshot().seq;
        navigateTo('bills');
        const after = navigationStore.getSnapshot();
        expect(after.screen).toBe('bills');
        expect(after.seq).toBe(before + 1);
    });

    it('同页且无意图时不重复导航', () => {
        const before = navigationStore.getSnapshot().seq;
        navigateTo('home');
        expect(navigationStore.getSnapshot().seq).toBe(before);
    });

    it('带意图导航即使目标页相同也会推进 seq', () => {
        navigateTo('add', { date: '2025-09-08' });
        expect(navigationStore.getSnapshot().intent).toEqual({ date: '2025-09-08' });
        const seq = navigationStore.getSnapshot().seq;
        navigateTo('add', { date: '2025-09-09' });
        expect(navigationStore.getSnapshot().seq).toBe(seq + 1);
        expect(navigationStore.getSnapshot().intent).toEqual({ date: '2025-09-09' });
    });

    it('意图消费后清空，页与 seq 保留', () => {
        navigateTo('details', { date: '2025-09-08' });
        const seq = navigationStore.getSnapshot().seq;
        clearNavigationIntent('details');
        const cleared = navigationStore.getSnapshot();
        expect(cleared.intent).toBeNull();
        expect(cleared.screen).toBe('details');
        expect(cleared.seq).toBe(seq);
    });

    it('clearNavigationIntent 不会误清别的页面的意图', () => {
        navigateTo('details', { date: '2025-09-08' });
        clearNavigationIntent('add');
        expect(navigationStore.getSnapshot().intent).toEqual({ date: '2025-09-08' });
    });

    it('retapScreen 只对当前页生效', () => {
        retapScreen('home');
        expect(navigationStore.getSnapshot().intent).toEqual({ retap: true });

        clearNavigationIntent('home');
        navigateTo('bills');
        retapScreen('home');
        expect(navigationStore.getSnapshot().screen).toBe('bills');
        expect(navigationStore.getSnapshot().intent).toBeNull();
    });
});
