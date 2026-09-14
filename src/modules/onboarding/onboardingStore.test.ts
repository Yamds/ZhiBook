// 新手引导状态机测试：开始 / 前进 / 结束 / 未激活不响应，以及脚本覆盖的页面。

import { beforeEach, describe, expect, it } from 'vitest';
import {
    ONBOARDING_STEP_COUNT,
    advanceOnboarding,
    finishOnboarding,
    getOnboardingState,
    isOnboardingActive,
    startOnboarding,
} from './onboardingStore';
import { TOUR_STEPS } from './tourSteps';

describe('onboardingStore', () => {
    beforeEach(() => {
        finishOnboarding();
    });

    it('startOnboarding 从第一步开始', () => {
        startOnboarding();
        expect(getOnboardingState()).toEqual({ active: true, index: 0 });
        expect(isOnboardingActive()).toBe(true);
    });

    it('advanceOnboarding 逐步前进', () => {
        startOnboarding();
        advanceOnboarding();
        expect(getOnboardingState().index).toBe(1);
        advanceOnboarding();
        expect(getOnboardingState().index).toBe(2);
    });

    it('finishOnboarding 结束并复位', () => {
        startOnboarding();
        advanceOnboarding();
        finishOnboarding();
        expect(getOnboardingState()).toEqual({ active: false, index: 0 });
        expect(isOnboardingActive()).toBe(false);
    });

    it('未激活时 advance 不产生副作用', () => {
        advanceOnboarding();
        expect(getOnboardingState()).toEqual({ active: false, index: 0 });
    });
});

describe('TOUR_STEPS', () => {
    it('步骤数与非空校验', () => {
        expect(ONBOARDING_STEP_COUNT).toBe(TOUR_STEPS.length);
        expect(TOUR_STEPS.length).toBeGreaterThanOrEqual(6);
        for (const step of TOUR_STEPS) {
            expect(step.key.length).toBeGreaterThan(0);
            expect(step.title.length).toBeGreaterThan(0);
            expect(step.body.length).toBeGreaterThan(0);
        }
    });

    it('覆盖日历 / 添加 / 设置三个页面', () => {
        const screens = new Set(TOUR_STEPS.map((step) => step.screen));
        expect(screens.has('home')).toBe(true);
        expect(screens.has('add')).toBe(true);
        expect(screens.has('settings')).toBe(true);
    });

    it('带目标的步骤选择器都以 data-tour 开头', () => {
        for (const step of TOUR_STEPS) {
            if (!step.target) continue;
            expect(step.target.startsWith('[data-tour="')).toBe(true);
        }
    });
});
