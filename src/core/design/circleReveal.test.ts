// 圆形揭示（View Transition）通用入口的机制测试：
// 不支持时退化、支持时写变量 + 属性并在结束后清理、并发时第二个直接退化。

import { afterEach, describe, expect, it, vi } from 'vitest';
import { playCircleReveal, supportsCircleReveal } from './circleReveal';

type StartViewTransition = (update: () => void) => { ready: Promise<void>; finished: Promise<void> };

const doc = document as Document & { startViewTransition?: StartViewTransition };

afterEach(() => {
    delete doc.startViewTransition;
    delete document.documentElement.dataset.circleReveal;
    for (const name of [
        '--circle-reveal-dur',
        '--circle-reveal-r',
        '--circle-reveal-dx',
        '--circle-reveal-dy',
        '--circle-reveal-feather',
        '--circle-reveal-ease',
    ]) {
        document.documentElement.style.removeProperty(name);
    }
});

describe('circleReveal', () => {
    it('不支持 View Transition 时退化为直接执行 update，不写任何全局状态', async () => {
        expect(supportsCircleReveal()).toBe(false);

        const update = vi.fn();
        await playCircleReveal(update, { cx: 100, cy: 200, durMs: 240 });

        expect(update).toHaveBeenCalledTimes(1);
        expect(document.documentElement.dataset.circleReveal).toBeUndefined();
        expect(document.documentElement.style.getPropertyValue('--circle-reveal-dur')).toBe('');
    });

    it('走 View Transition：更新先于快照、过渡中写变量、结束后清理', async () => {
        let finish!: () => void;
        const finished = new Promise<void>((resolve) => {
            finish = resolve;
        });
        const startViewTransition = vi.fn((update: () => void) => {
            update();
            return { ready: Promise.resolve(), finished };
        });
        Object.defineProperty(document, 'startViewTransition', {
            configurable: true,
            writable: true,
            value: startViewTransition,
        });
        expect(supportsCircleReveal()).toBe(true);

        const update = vi.fn();
        const pending = playCircleReveal(update, { cx: 100, cy: 200, durMs: 240, featherPx: 18 });

        expect(startViewTransition).toHaveBeenCalledTimes(1);
        expect(update).toHaveBeenCalledTimes(1);
        expect(document.documentElement.dataset.circleReveal).toBe('on');
        expect(document.documentElement.style.getPropertyValue('--circle-reveal-dur')).toBe('240ms');
        expect(document.documentElement.style.getPropertyValue('--circle-reveal-feather')).toBe('18px');
        expect(Number.parseFloat(document.documentElement.style.getPropertyValue('--circle-reveal-r'))).toBeGreaterThan(0);

        finish();
        await pending;

        expect(document.documentElement.dataset.circleReveal).toBeUndefined();
        expect(document.documentElement.style.getPropertyValue('--circle-reveal-dur')).toBe('');
        expect(update).toHaveBeenCalledTimes(1);
    });

    it('已有揭示进行中：第二次调用直接执行 update，不再开新过渡', async () => {
        let finish!: () => void;
        const finished = new Promise<void>((resolve) => {
            finish = resolve;
        });
        const startViewTransition = vi.fn((update: () => void) => {
            update();
            return { ready: Promise.resolve(), finished };
        });
        Object.defineProperty(document, 'startViewTransition', {
            configurable: true,
            writable: true,
            value: startViewTransition,
        });

        const first = vi.fn();
        const second = vi.fn();
        const pending = playCircleReveal(first, { cx: 0, cy: 0, durMs: 100 });
        await playCircleReveal(second, { cx: 0, cy: 0, durMs: 100 });

        expect(startViewTransition).toHaveBeenCalledTimes(1);
        expect(first).toHaveBeenCalledTimes(1);
        expect(second).toHaveBeenCalledTimes(1);

        finish();
        await pending;
    });
});
