// 应用导航注册表。
//
// 这是「底部导航（重要功能）」和「抽屉侧栏（全部功能）」唯一的定义来源：
// 新增业务页面时只在这里登记一次，两套导航会自动同步。
//
//   primary: true  → 出现在底部导航栏
//   pinned:  true  → 在抽屉里固定到底部，与主功能组分隔

import { LayoutDashboard, Settings, type LucideIcon } from 'lucide-react';

export type AppRoute = 'overview' | 'settings';

export interface AppRouteDef {
    readonly id: AppRoute;
    readonly label: string;
    readonly icon: LucideIcon;
    /** 出现在底部导航栏。 */
    readonly primary: boolean;
    /** 在抽屉侧栏中固定到底部。 */
    readonly pinned?: boolean;
}

export const APP_ROUTES: ReadonlyArray<AppRouteDef> = [
    { id: 'overview', label: '概览', icon: LayoutDashboard, primary: true },
    { id: 'settings', label: '设置', icon: Settings, primary: true, pinned: true },
];

/** 路由顺序，决定页面过渡方向。 */
export const ROUTE_ORDER: ReadonlyArray<AppRoute> = APP_ROUTES.map((route) => route.id);

export const BOTTOM_NAV_ROUTES: ReadonlyArray<AppRouteDef> = APP_ROUTES.filter(
    (route) => route.primary,
);

export const DRAWER_MAIN_ROUTES: ReadonlyArray<AppRouteDef> = APP_ROUTES.filter(
    (route) => !route.pinned,
);

export const DRAWER_PINNED_ROUTES: ReadonlyArray<AppRouteDef> = APP_ROUTES.filter(
    (route) => route.pinned,
);

export function findRoute(id: AppRoute): AppRouteDef | undefined {
    return APP_ROUTES.find((route) => route.id === id);
}

export function routeTitle(id: AppRoute): string {
    return findRoute(id)?.label ?? '';
}
