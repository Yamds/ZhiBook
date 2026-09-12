// 应用导航注册表。
//
// 5 个底部页签就是用户可见的全部顶级页面；「设置」不是页签，只从日历页
// 重复点击进入。这里登记一次，底部导航、页面标题、横滑顺序、过渡方向
// 全部由它推导，页面侧不需要再写第二份路由表。
//
// 页签顺序固定：账单 → 明细 → 日历 → 添加 → 资产（日历为首页）。

import { CalendarDays, ListChecks, PlusCircle, Receipt, Wallet, type LucideIcon } from 'lucide-react';

/** 底部页签路由。 */
export type AppRoute = 'bills' | 'details' | 'home' | 'add' | 'assets';

/** 全部可导航页面 = 页签 + 设置。 */
export type AppScreen = AppRoute | 'settings';

export interface AppRouteDef {
    readonly id: AppRoute;
    readonly label: string;
    readonly icon: LucideIcon;
    /** 顶部栏 / 无障碍用的页面标题（默认与 label 相同）。 */
    readonly title?: string;
}

export const APP_ROUTES: ReadonlyArray<AppRouteDef> = [
    { id: 'bills', label: '账单', icon: Receipt },
    { id: 'details', label: '明细', icon: ListChecks },
    { id: 'home', label: '日历', icon: CalendarDays },
    { id: 'add', label: '添加', icon: PlusCircle },
    { id: 'assets', label: '资产', icon: Wallet },
];

/** 首页 = 日历页。App 启动、返回键兜底都回到这里。 */
export const HOME_ROUTE: AppRoute = 'home';

/** 页签顺序，决定过渡方向与横滑邻居。 */
export const ROUTE_ORDER: ReadonlyArray<AppRoute> = APP_ROUTES.map((route) => route.id);

export const SETTINGS_LABEL = '设置';

export function findRoute(id: AppRoute): AppRouteDef | undefined {
    return APP_ROUTES.find((route) => route.id === id);
}

export function routeTitle(screen: AppScreen): string {
    if (screen === 'settings') return SETTINGS_LABEL;
    const def = findRoute(screen);
    return def?.title ?? def?.label ?? '';
}
