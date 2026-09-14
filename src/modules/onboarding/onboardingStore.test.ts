// 新手引导状态机测试：分段开始 / 前进 / 结束 / 未激活不响应，以及脚本结构。

import { beforeEach, describe, expect, it } from 'vitest';
import {
    advanceOnboarding,
    finishOnboarding,
    getOnboardingState,
    isOnboardingActive,
    startOnboarding,
    tourStepCount,
} from './onboardingStore';
import { ADD_TOUR_STEPS, MAIN_TOUR_STEPS, TOUR_STEPS } from './tourSteps';

describe('onboardingStore', () => {
    beforeEach(() => {
        finishOnboarding();
    });

    it('startOnboarding 默认从主引导第一步开始', () => {
        startOnboarding();
        expect(getOnboardingState()).toEqual({ chapter: 'main', index: 0 });
        expect(isOnboardingActive()).toBe(true);
    });

    it('startOnboarding 可以指定添加页分段', () => {
        startOnboarding('add');
        expect(getOnboardingState()).toEqual({ chapter: 'add', index: 0 });
    });

    it('advanceOnboarding 逐步前进', () => {
        startOnboarding('main');
        advanceOnboarding();
        expect(getOnboardingState()).toEqual({ chapter: 'main', index: 1 });
        advanceOnboarding();
        expect(getOnboardingState().index).toBe(2);
    });

    it('finishOnboarding 结束并复位', () => {
        startOnboarding('add');
        advanceOnboarding();
        finishOnboarding();
        expect(getOnboardingState()).toEqual({ chapter: null, index: 0 });
        expect(isOnboardingActive()).toBe(false);
    });

    it('未激活时 advance 不产生副作用', () => {
        advanceOnboarding();
        expect(getOnboardingState()).toEqual({ chapter: null, index: 0 });
    });
});

describe('TOUR_STEPS', () => {
    it('两段步骤非空、字段完整', () => {
        expect(MAIN_TOUR_STEPS.length).toBeGreaterThanOrEqual(4);
        expect(ADD_TOUR_STEPS.length).toBeGreaterThanOrEqual(2);

        for (const steps of Object.values(TOUR_STEPS)) {
            for (const step of steps) {
                expect(step.key.length).toBeGreaterThan(0);
                expect(step.title.length).toBeGreaterThan(0);
                expect(step.body.length).toBeGreaterThan(0);
                if (step.target) {
                    expect(step.target.startsWith('[data-tour="')).toBe(true);
                }
            }
        }
    });

    it('主引导第一步是欢迎卡（无目标、按钮为「开始」）', () => {
        const first = MAIN_TOUR_STEPS[0]!;
        expect(first.target).toBeUndefined();
        expect(first.nextLabel).toBe('开始');
    });

    it('主引导覆盖日历与设置；添加页引导都在添加页', () => {
        const mainScreens = new Set(MAIN_TOUR_STEPS.map((step) => step.screen));
        expect(mainScreens.has('home')).toBe(true);
        expect(mainScreens.has('settings')).toBe(true);
        for (const step of ADD_TOUR_STEPS) {
            expect(step.screen).toBe('add');
        }
    });

    it('tourStepCount 与分段长度一致', () => {
        expect(tourStepCount('main')).toBe(MAIN_TOUR_STEPS.length);
        expect(tourStepCount('add')).toBe(ADD_TOUR_STEPS.length);
    });
});
