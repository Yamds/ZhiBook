// 应用壳：顶部栏 + 底部导航 + 抽屉侧栏 + 路由过渡 + 全局 InfoBar。
//
// 页面业务只放在 modules；壳只负责编排生命周期和跨页面能力。
// 底部导航承载「重要功能」，抽屉侧栏承载「全部功能」，两者共用 app/navigation 注册表。
//
// 三种导航输入统一在这里收敛：
//   点击  —— 底部导航 / 抽屉
//   横滑  —— 先问页面的嵌套消费方（页签），未消费才切顶级路由
//   返回键 —— 抽屉 → 非首页 → 退出闸门 / 退到后台

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MobileAppBar } from '../shared/components/shell/MobileAppBar';
import { BottomNav } from '../shared/components/shell/BottomNav';
import { AppDrawer } from '../shared/components/shell/AppDrawer';
import { GlobalTitleTooltip, InfoBarStack, RouteErrorBoundary, TooltipProvider } from '../shared/ui';
import { PageTransition } from '../shared/ui/motion';
import { useGlobalInfoBars } from '../hooks/ui/useGlobalInfoBars';
import { useHorizontalSwipe } from '../hooks/ui/useHorizontalSwipe';
import { useMotion } from '../hooks/preferences/useMotion';
import { preferencesStore } from '../hooks/preferences/preferencesStore';
import { APP_SETTINGS_QUERY_KEY } from '../hooks/preferences/useBackendSettings';
import { OverviewPage } from '../modules/overview/OverviewPage';
import { SettingsPage } from '../modules/settings/SettingsPage';
import {
    registerBackButtonHandler,
    registerBackgroundPolicyProvider,
    type BackgroundPolicy,
} from '../core/platform/androidBridge';
import type { AppSettings } from '../core/ipc/types';
import { AppExitGate } from './AppExitGate';
import { ROUTE_ORDER, routeTitle, type AppRoute } from './navigation';
import { SwipeProvider, neighborOf, type NestedSwipeHandler, type SwipeDirection } from './swipeNavigation';

const HOME_ROUTE: AppRoute = 'overview';
const DEFAULT_BACKGROUND_POLICY: BackgroundPolicy = { mode: 'delayed_lightweight', delaySecs: 300 };

export function AppNext() {
    const [route, setRoute] = useState<AppRoute>(HOME_ROUTE);
    const [displayedRoute, setDisplayedRoute] = useState<AppRoute>(HOME_ROUTE);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [exitGateOpen, setExitGateOpen] = useState(false);
    const [pageVisible, setPageVisible] = useState(true);
    const [direction, setDirection] = useState<-1 | 0 | 1>(0);
    const motion = useMotion();
    const queryClient = useQueryClient();
    const { bars, dismiss, remove } = useGlobalInfoBars();

    const navigate = useCallback((next: AppRoute) => {
        if (next === route) return;
        const oldIndex = ROUTE_ORDER.indexOf(route);
        const newIndex = ROUTE_ORDER.indexOf(next);
        setDirection(newIndex > oldIndex ? 1 : newIndex < oldIndex ? -1 : 0);
        setRoute(next);
        setPageVisible(false);
    }, [route]);

    useEffect(() => {
        if (route === displayedRoute && !pageVisible) setPageVisible(true);
    }, [route, displayedRoute, pageVisible]);

    const handleExited = useCallback(() => {
        setDisplayedRoute(route);
        setPageVisible(true);
    }, [route]);

    // ===== 横滑导航 =====
    const mainRef = useRef<HTMLElement | null>(null);
    const nestedSwipeRef = useRef<NestedSwipeHandler | null>(null);
    const swipeContextValue = useMemo(() => ({
        setNestedHandler: (handler: NestedSwipeHandler | null) => {
            nestedSwipeRef.current = handler;
        },
    }), []);

    const handleSwipe = useCallback((swipe: SwipeDirection) => {
        // 抽屉打开时不参与页面滑动。
        if (drawerOpen) return;
        // 页签优先：设置页会消费外观 ↔ 行为之间的滑动。
        if (nestedSwipeRef.current?.(swipe)) return;
        const next = neighborOf(ROUTE_ORDER, route, swipe);
        if (next) navigate(next);
    }, [drawerOpen, route, navigate]);

    useHorizontalSwipe(mainRef, handleSwipe);

    // ===== Android 返回键 =====
    useEffect(() => registerBackButtonHandler(() => {
        if (drawerOpen) {
            setDrawerOpen(false);
            return 'handled';
        }
        if (route !== HOME_ROUTE) {
            navigate(HOME_ROUTE);
            return 'handled';
        }
        if (preferencesStore.get().closeAction === 'tray') return 'background';
        setExitGateOpen(true);
        return 'handled';
    }), [drawerOpen, route, navigate]);

    // ===== 后台界面策略 =====
    useEffect(() => registerBackgroundPolicyProvider(() => {
        const settings = queryClient.getQueryData<AppSettings>(APP_SETTINGS_QUERY_KEY);
        if (!settings) return DEFAULT_BACKGROUND_POLICY;
        return {
            mode: settings.afterCloseUiBehavior,
            delaySecs: settings.enterLightweightDelaySecs,
        };
    }), [queryClient]);

    const body = displayedRoute === 'settings' ? <SettingsPage /> : <OverviewPage onNavigate={navigate} />;

    return (
        <SwipeProvider value={swipeContextValue}>
            <TooltipProvider>
                <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-canvas">
                    <div className={'ndf-canvas-glow' + (motion.enabled && motion.preset.feel.overshoot ? ' is-breathing' : '')} />
                    <div className={motion.enabled ? 'ndf-shell-enter-titlebar' : ''}>
                        <MobileAppBar title={routeTitle(route)} onOpenDrawer={() => setDrawerOpen(true)} />
                    </div>
                    <main ref={mainRef} className={'relative z-10 flex min-h-0 min-w-0 flex-1 overflow-hidden ' + (motion.enabled ? 'ndf-shell-enter-main' : '')}>
                        <PageTransition visible={pageVisible} onExited={handleExited} direction={direction} className="flex min-h-0 min-w-0 flex-1 flex-col">
                            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
                                <RouteErrorBoundary title="页面渲染失败">{body}</RouteErrorBoundary>
                            </div>
                        </PageTransition>
                    </main>
                    <BottomNav active={route} onChange={navigate} />
                    <AppDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} active={route} onChange={navigate} />
                    <InfoBarStack items={bars} onDismiss={dismiss} onAutoDismiss={remove} />
                    <AppExitGate open={exitGateOpen} onOpenChange={setExitGateOpen} />
                    <GlobalTitleTooltip />
                </div>
            </TooltipProvider>
        </SwipeProvider>
    );
}

export default AppNext;
