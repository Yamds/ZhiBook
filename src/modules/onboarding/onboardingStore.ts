// 新手引导的运行状态（模块级 store，跨页面保持）。
//
// 分两段（chapter）：
//   main —— 首启自动运行：欢迎 → 日历 → 设置 → 外观 → 主题；
//   add  —— 用户第一次进入添加页时触发一次。
//
// 引导期间不允许退出：没有「跳过 / 关闭」，返回键也被宿主消费；
// 唯一的结束方式是走完最后一步（目标缺失时宿主自动跳过）。
// 完成状态分别写回后端 `onboardingCompleted` / `addTourCompleted`，见 OnboardingTour。

import { useSyncExternalStore } from 'react';
import { createStore } from '../../hooks/utils/createStore';
import { TOUR_STEPS, type TourChapter } from './tourSteps';

export interface OnboardingState {
    /** null = 当前没有引导在跑。 */
    readonly chapter: TourChapter | null;
    readonly index: number;
}

const store = createStore<OnboardingState>({ chapter: null, index: 0 });

/** 某一段的步骤数。 */
export function tourStepCount(chapter: TourChapter): number {
    return TOUR_STEPS[chapter].length;
}

/** 从某一段的第一步开始。 */
export function startOnboarding(chapter: TourChapter = 'main'): void {
    store.setState({ chapter, index: 0 });
}

/** 前进一步（越界由调用方改用 finishOnboarding）。 */
export function advanceOnboarding(): void {
    const state = store.getSnapshot();
    if (!state.chapter) return;
    store.setState({ chapter: state.chapter, index: state.index + 1 });
}

/** 结束引导。 */
export function finishOnboarding(): void {
    store.setState({ chapter: null, index: 0 });
}

/** 当前状态快照（非 React 场景 / 测试用）。 */
export function getOnboardingState(): OnboardingState {
    return store.getSnapshot();
}

/** 返回键 / 其它全局入口用：当前是否有引导在跑。 */
export function isOnboardingActive(): boolean {
    return getOnboardingState().chapter !== null;
}

export function useOnboarding(): OnboardingState {
    return useSyncExternalStore(
        store.subscribe,
        store.getSnapshot,
        () => store.getSnapshot(),
    );
}
