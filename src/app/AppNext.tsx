// 应用壳：顶部栏 + 底部导航 + 路由过渡 + 全局 InfoBar + 退出闸门。
//
// 页面业务只放在 modules；壳只负责编排生命周期和跨页面能力。
// 侧边栏 / 抽屉已整体移除，所有导航入口收敛为底部 5 个页签 + 日历 / 设置槽位上方
// 从栏后露头的替身按钮（见 BottomNav / NavSlotPeek）。
//
// 三种导航输入统一在这里收敛：
//   点击  —— 底部导航：重复点日历 / 点上方探出的齿轮 = 进设置；重复点其它页签 = 回到该页顶部
//   横滑  —— 先问页面的嵌套消费方（选择器等），未消费才切顶级页签；设置页不参与
//   返回键 —— 首页弹退出确认；其它页面回首页

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MobileAppBar } from '../shared/components/shell/MobileAppBar';
import { BottomNav } from '../shared/components/shell/BottomNav';
import { GlobalTitleTooltip, InfoBarStack, RouteErrorBoundary, TooltipProvider } from '../shared/ui';
import { PageTransition } from '../shared/ui/motion';
import { useGlobalInfoBars } from '../hooks/ui/useGlobalInfoBars';
import { useHorizontalSwipe } from '../hooks/ui/useHorizontalSwipe';
import { useCurrentBook } from '../hooks/ledger/useLedgerBooks';
import { useRecurringCatchUp } from '../hooks/ledger/useRecurringCatchUp';
import { useCloudAutoBackup } from '../hooks/cloud/useCloudAutoBackup';
import { useAppLockLifecycle } from '../hooks/security/usePinLock';
import { useReminderSync } from '../hooks/preferences/useReminderSync';
import { useMotion } from '../hooks/preferences/useMotion';
import { registerBackButtonHandler } from '../core/platform/androidBridge';
import { AddPage } from '../modules/add/AddPage';
import { AssetsPage } from '../modules/assets/AssetsPage';
import { BillsPage } from '../modules/bills/BillsPage';
import { DetailsPage } from '../modules/details/DetailsPage';
import { HomePage } from '../modules/home/HomePage';
import { SettingsPage } from '../modules/settings/SettingsPage';
import { AppExitGate } from './AppExitGate';
import {
    HOME_ROUTE,
    ROUTE_ORDER,
    routeContentClass,
    routeTitle,
    type AppRoute,
    type AppScreen,
} from './navigation';
import { backActionFor, navigateTo, retapScreen, useNavigation, useRetapHandler } from './navigationStore';
import { runPageBackHandler } from './pageBackHandler';
import { closeTopOverlay } from '../shared/ui/overlayStack';
import { SwipeProvider, neighborOf, type NestedSwipeHandler, type SwipeDirection } from './swipeNavigation';

/** 顶部栏右侧的账本入口：数据未就绪时先显示占位名（正常一帧内就被真实名替换）。 */
const ACTIVE_BOOK_PLACEHOLDER = '默认账本';

/**
 * 过渡方向用的页序号。
 *
 * 设置页是「日历槽位的替身」，序号与日历相同 → 日历 ↔ 设置 是无方向的
 * 淡入淡出，不会出现「从最后一个页签飞进来」的错觉。
 */
function screenIndex(screen: AppScreen): number {
    return ROUTE_ORDER.indexOf(screen === 'settings' ? HOME_ROUTE : screen);
}

function renderScreen(screen: AppScreen) {
    switch (screen) {
        case 'bills':
            return <BillsPage />;
        case 'details':
            return <DetailsPage />;
        case 'home':
            return <HomePage />;
        case 'add':
            return <AddPage />;
        case 'assets':
            return <AssetsPage />;
        case 'settings':
            return <SettingsPage />;
    }
}

export function AppNext() {
    const navigation = useNavigation();
    const screen = navigation.screen;
    const [displayedScreen, setDisplayedScreen] = useState<AppScreen>(screen);
    const [pageVisible, setPageVisible] = useState(true);
    const [direction, setDirection] = useState<-1 | 0 | 1>(0);
    const [exitGateOpen, setExitGateOpen] = useState(false);
    const motion = useMotion();
    const { bars, dismiss, remove } = useGlobalInfoBars();
    const { currentBook } = useCurrentBook();
    // 固定收支补账：启动 / 回前台 / 前台跨 05:00 时各检查一次。
    useRecurringCatchUp();
    // 云端自动备份：同一个逻辑日（本地 05:00 起算）最多自动备份一次。
    useCloudAutoBackup();
    // 离开后台超过 30 秒回前台时重新锁定（密码锁）。
    useAppLockLifecycle();
    // 记账提醒：把配置下发给原生排闹钟。
    useReminderSync();

    const previousScreenRef = useRef<AppScreen>(screen);
    const scrollRef = useRef<HTMLDivElement | null>(null);

    // 目标页变化：先定方向并让旧页退场，退场结束后再切换内容。
    useEffect(() => {
        const previous = previousScreenRef.current;
        if (previous === screen) return;
        previousScreenRef.current = screen;
        const delta = screenIndex(screen) - screenIndex(previous);
        setDirection(delta > 0 ? 1 : delta < 0 ? -1 : 0);
        setPageVisible(false);
    }, [screen]);

    useEffect(() => {
        if (screen === displayedScreen && !pageVisible) setPageVisible(true);
    }, [screen, displayedScreen, pageVisible]);

    const handleExited = useCallback(() => {
        setDisplayedScreen(screen);
        setPageVisible(true);
    }, [screen]);

    // 重复点当前页签：回到该页顶部（日历页的重复点击在下面单独处理成进设置）。
    useRetapHandler(screen, () => {
        scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // ===== 底部导航 =====
    // 「设置」这个 id 有两个来源，语义都是「日历 ↔ 设置 互换」：
    //   1. 设置页的第 3 槽位（点它回日历）；
    //   2. 日历页上方露头的齿轮替身（点它进设置）。
    // 所以按当前屏幕决定方向，而不是写死一个方向。
    const handleTabSelect = useCallback((next: AppRoute | 'settings') => {
        if (next === 'settings') {
            navigateTo(screen === 'settings' ? HOME_ROUTE : 'settings');
            return;
        }
        if (next !== screen) {
            navigateTo(next);
            return;
        }
        if (next === HOME_ROUTE) {
            navigateTo('settings');
            return;
        }
        retapScreen(next);
    }, [screen]);

    // ===== 横滑导航 =====
    const mainRef = useRef<HTMLElement | null>(null);
    const nestedSwipeRef = useRef<NestedSwipeHandler | null>(null);
    const swipeContextValue = useMemo(() => ({
        setNestedHandler: (handler: NestedSwipeHandler | null) => {
            nestedSwipeRef.current = handler;
        },
    }), []);

    const handleSwipe = useCallback((swipe: SwipeDirection) => {
        // 页内消费优先（后续的周期选择器 / 分类宫格会注册到这里）。
        if (nestedSwipeRef.current?.(swipe)) return;
        // 设置页不参与页签横滑。
        if (screen === 'settings') return;
        const next = neighborOf(ROUTE_ORDER, screen as AppRoute, swipe);
        if (next) navigateTo(next);
    }, [screen]);

    useHorizontalSwipe(mainRef, handleSwipe);

    // ===== Android 返回键 =====
    // 优先级：最上层弹层 > 页面拦截 > 非首页回首页 > 首页退出确认。
    useEffect(() => registerBackButtonHandler(() => {
        if (closeTopOverlay()) return 'handled';
        if (runPageBackHandler()) return 'handled';
        switch (backActionFor(screen, exitGateOpen)) {
            case 'close-overlay':
                setExitGateOpen(false);
                return 'handled';
            case 'go-home':
                navigateTo(HOME_ROUTE);
                return 'handled';
            case 'confirm-exit':
                setExitGateOpen(true);
                return 'handled';
        }
    }), [exitGateOpen, screen]);

    return (
        <SwipeProvider value={swipeContextValue}>
            <TooltipProvider>
                <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-canvas">
                    <div className={'ndf-canvas-glow' + (motion.enabled && motion.preset.feel.overshoot && screen === HOME_ROUTE ? ' is-breathing' : '')} />
                    <div className={motion.enabled ? 'ndf-shell-enter-titlebar' : ''}>
                        <MobileAppBar
                            title={routeTitle(screen)}
                            bookName={currentBook?.name ?? ACTIVE_BOOK_PLACEHOLDER}
                            onOpenBook={() => navigateTo('assets')}
                        />
                    </div>
                    <main ref={mainRef} className={'relative z-10 flex min-h-0 min-w-0 flex-1 overflow-hidden ' + (motion.enabled ? 'ndf-shell-enter-main' : '')}>
                        <PageTransition visible={pageVisible} onExited={handleExited} direction={direction} className="flex min-h-0 min-w-0 flex-1 flex-col">
                            <div
                                key={displayedScreen}
                                ref={scrollRef}
                                className={routeContentClass(displayedScreen)}
                            >
                                <RouteErrorBoundary title="页面渲染失败">{renderScreen(displayedScreen)}</RouteErrorBoundary>
                            </div>
                        </PageTransition>
                    </main>
                    <BottomNav active={screen} onSelect={handleTabSelect} />
                    <InfoBarStack items={bars} onDismiss={dismiss} onAutoDismiss={remove} />
                    <AppExitGate open={exitGateOpen} onOpenChange={setExitGateOpen} />
                    <GlobalTitleTooltip />
                </div>
            </TooltipProvider>
        </SwipeProvider>
    );
}

export default AppNext;
