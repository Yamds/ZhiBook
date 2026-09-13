// 应用导航注册表。
//
// 5 个底部页签就是用户可见的全部顶级页面；「设置」不是独立页签，而是
// **临时占用「日历」槽位**的替身页签：进入设置后该槽位显示「设置」，
// 再点一次切回日历，返回键也是回日历。
//
// 这里登记一次，底部导航、页面标题、横滑顺序、过渡方向全部由它推导，
// 页面侧不需要再写第二份路由表。
//
// 页签顺序固定：账单 → 明细 → 日历 → 添加 → 资产（日历为首页）。

import { UI_ICONS, type IconName } from '../core/design/icons';
import type { StartupTab } from '../core/domain/ui/startupTab';

/**
 * 底部页签路由。
 *
 * 值集合与「启动页签」设置共用同一份定义（`core/domain/ui/startupTab.ts`）——
 * 偏好存的是同一个字符串，用类型别名把两边钉在一起，不一致就编译不过，
 * 页面侧也不需要任何 `as AppRoute` 强转。
 */
export type AppRoute = StartupTab;

/** 全部可导航页面 = 页签 + 设置。 */
export type AppScreen = AppRoute | 'settings';

/** 底部导航的一个槽位（可能是普通页签，也可能是设置替身）。 */
export interface TabDef {
    readonly id: AppRoute | 'settings';
    readonly label: string;
    readonly icon: IconName;
}

export interface AppRouteDef extends TabDef {
    readonly id: AppRoute;
    /** 顶部栏 / 无障碍用的页面标题（默认与 label 相同）。 */
    readonly title?: string;
}

export const APP_ROUTES: ReadonlyArray<AppRouteDef> = [
    { id: 'bills', label: '账单', icon: UI_ICONS.bills },
    { id: 'details', label: '明细', icon: UI_ICONS.details },
    { id: 'home', label: '日历', icon: UI_ICONS.calendar },
    { id: 'add', label: '添加', icon: UI_ICONS.add },
    { id: 'assets', label: '资产', icon: UI_ICONS.assets },
];

/** 首页 = 日历页。App 启动、返回键兜底都回到这里。 */
export const HOME_ROUTE: AppRoute = 'home';

/** 页签顺序，决定过渡方向与横滑邻居。 */
export const ROUTE_ORDER: ReadonlyArray<AppRoute> = APP_ROUTES.map((route) => route.id);

export const SETTINGS_LABEL = '设置';

/** 设置替身页签：占用「日历」槽位，图标 / 文案与普通页签同源。 */
export const SETTINGS_TAB: TabDef = { id: 'settings', label: SETTINGS_LABEL, icon: UI_ICONS.settings };

export function findRoute(id: AppRoute): AppRouteDef | undefined {
    return APP_ROUTES.find((route) => route.id === id);
}

/**
 * 底部导航实际渲染的槽位列表。
 *
 * 非设置页：原样 5 个页签；
 * 设置页：把「日历」槽位换成「设置」——两者是同一个位置的两个状态。
 */
export function bottomNavTabs(screen: AppScreen): ReadonlyArray<TabDef> {
    if (screen !== 'settings') return APP_ROUTES;
    return APP_ROUTES.map((route) => (route.id === HOME_ROUTE ? SETTINGS_TAB : route));
}

export function routeTitle(screen: AppScreen): string {
    if (screen === 'settings') return SETTINGS_LABEL;
    const def = findRoute(screen);
    return def?.title ?? def?.label ?? '';
}

/**
 * 主内容区容器 class。
 *
 * 默认：纵向可滚动 + 常规内边距。
 * 添加页自己管整屏布局（分类宫格 + 数字键盘要贴底、不能整页滚），
 * 所以给它取消外层滚动与内边距。
 */
export function routeContentClass(screen: AppScreen): string {
    return screen === 'add'
        ? 'min-h-0 flex-1 overflow-hidden px-0 pb-0'
        : 'min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4';
}
