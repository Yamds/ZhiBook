// 壳层导航状态：一个模块级 store，底部导航与页面都从这里读写。
//
// 之所以从 AppNext 的局部 state 提出来：日历点某天要跳「添加」并带日期、
// 长按要跳「明细」并带日期，这类跨页意图需要全局入口；「重复点击已激活页签」
// 也需要让目标页面能收到一次事件。
//
// seq 每次导航 +1：即使目标页与意图内容相同，页面也能识别「这是新的一次意图」。
// 意图是「一次性」的：页面消费后调 clearNavigationIntent，避免下次进入被旧参数污染。

import { useEffect, useRef, useSyncExternalStore } from 'react';

import { createStore } from '../hooks/utils/createStore';
import { HOME_ROUTE, type AppScreen } from './navigation';

export interface NavigationIntent {
    /** 目标日期（YYYY-MM-DD）：日历 → 添加 / 明细 携带。 */
    date?: string;
    /** 目标账本 id：账本切换后的回跳场景使用。 */
    bookId?: string;
    /** 重复点击已激活页签：页面收到后回到顶部 / 重置到默认视图。 */
    retap?: boolean;
}

export interface NavigationState {
    readonly screen: AppScreen;
    readonly intent: NavigationIntent | null;
    readonly seq: number;
}

const initialState: NavigationState = {
    screen: HOME_ROUTE,
    intent: null,
    seq: 0,
};

export const navigationStore = createStore<NavigationState>(initialState);

/** 顶层导航。目标页相同且没有新意图时不重渲染。 */
export function navigateTo(screen: AppScreen, intent?: NavigationIntent): void {
    const state = navigationStore.getSnapshot();
    if (state.screen === screen && !intent) return;
    navigationStore.setState({ screen, intent: intent ?? null, seq: state.seq + 1 });
}

/** 回到首页（返回键与页面内跳转共用）。 */
export function goHome(): void {
    navigateTo(HOME_ROUTE);
}

/** 重复点击已激活页签：只对当前页生效，带上 retap 意图。 */
export function retapScreen(screen: AppScreen): void {
    const state = navigationStore.getSnapshot();
    if (state.screen !== screen) return;
    navigationStore.setState({ screen, intent: { retap: true }, seq: state.seq + 1 });
}

/** 清掉一次性意图。screen 参数用于防止跨页误清。 */
export function clearNavigationIntent(screen: AppScreen): void {
    const state = navigationStore.getSnapshot();
    if (state.screen !== screen || state.intent === null) return;
    navigationStore.setState({ ...state, intent: null });
}

export function useNavigation(): NavigationState {
    return useSyncExternalStore(
        navigationStore.subscribe,
        navigationStore.getSnapshot,
        () => initialState,
    );
}

/**
 * 订阅「重复点击当前页签」事件。
 *
 * 页面拿它做「回到顶部 / 重置默认视图」；同一次 retap 只触发一次
 *（按 seq 去重），触发后清空意图，避免后续渲染重复执行。
 */
export function useRetapHandler(screen: AppScreen, handler: () => void): void {
    const navigation = useNavigation();
    const handlerRef = useRef(handler);
    handlerRef.current = handler;
    const handledSeqRef = useRef(0);

    const isRetap = navigation.screen === screen && navigation.intent?.retap === true;
    const seq = navigation.seq;

    useEffect(() => {
        if (!isRetap || handledSeqRef.current === seq) return;
        handledSeqRef.current = seq;
        handlerRef.current();
        clearNavigationIntent(screen);
    }, [isRetap, seq, screen]);
}
