// 新手引导的运行状态（模块级 store，跨页面保持）。
//
// 引导期间不允许退出：没有「跳过 / 关闭」，返回键也被宿主消费；
// 唯一的结束方式是走完最后一步（目标缺失时宿主自动跳过）。
// 完成状态写回后端 `uiPreferences.onboardingCompleted`，见 OnboardingTour。

import { useSyncExternalStore } from 'react';
import { createStore } from '../../hooks/utils/createStore';
import { TOUR_STEPS } from './tourSteps';

export interface OnboardingState {
    readonly active: boolean;
    readonly index: number;
}

export const ONBOARDING_STEP_COUNT = TOUR_STEPS.length;

const store = createStore<OnboardingState>({ active: false, index: 0 });

/** 从第一步开始（首启自动触发，或设置 / 关于里重新唤起）。 */
export function startOnboarding(): void {
    store.setState({ active: true, index: 0 });
}

/** 前进一步（越界由调用方在最后一step改用 finish）。 */
export function advanceOnboarding(): void {
    const state = store.getSnapshot();
    if (!state.active) return;
    store.setState({ active: true, index: state.index + 1 });
}

/** 结束引导。 */
export function finishOnboarding(): void {
    store.setState({ active: false, index: 0 });
}

/** 当前状态快照（非 React 场景 / 测试用）。 */
export function getOnboardingState(): OnboardingState {
    return store.getSnapshot();
}

/** 返回键 / 其它全局入口用：当前是否有引导在跑。 */
export function isOnboardingActive(): boolean {
    return getOnboardingState().active;
}

export function useOnboarding(): OnboardingState {
    return useSyncExternalStore(
        store.subscribe,
        store.getSnapshot,
        () => store.getSnapshot(),
    );
}
