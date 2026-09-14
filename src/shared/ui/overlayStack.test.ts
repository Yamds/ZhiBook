// 全局弹层栈测试：后进先出、空栈返回 false、乱序 cleanup 不影响新弹层。

import { describe, expect, it } from 'vitest';
import { closeTopOverlay, overlayDepth, pushOverlay } from './overlayStack';

describe('overlayStack', () => {
    it('空栈时 closeTopOverlay 返回 false', () => {
        expect(overlayDepth()).toBe(0);
        expect(closeTopOverlay()).toBe(false);
    });

    it('后进先出：先关最上层', () => {
        const closed: string[] = [];
        const popA = pushOverlay(() => closed.push('a'));
        const popB = pushOverlay(() => closed.push('b'));
        expect(overlayDepth()).toBe(2);

        expect(closeTopOverlay()).toBe(true);
        expect(closed).toEqual(['b']);
        expect(closeTopOverlay()).toBe(true);
        expect(closed).toEqual(['b', 'a']);
        expect(closeTopOverlay()).toBe(false);

        popA();
        popB();
        expect(overlayDepth()).toBe(0);
    });

    it('乱序 cleanup 只移除自己的那一项', () => {
        const closed: string[] = [];
        const popA = pushOverlay(() => closed.push('a'));
        const popB = pushOverlay(() => closed.push('b'));
        const popC = pushOverlay(() => closed.push('c'));

        // 模拟 A 先退场（旧组件 cleanup 晚到）
        popA();
        expect(overlayDepth()).toBe(2);
        expect(closeTopOverlay()).toBe(true);
        expect(closed).toEqual(['c']);

        popB();
        popC();
        expect(overlayDepth()).toBe(0);
    });
});
