// 重置金额键测试：必须长按 0.8s（短按无效），按住出现进度环、松手复位。

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RESET_LONG_PRESS_MS, ResetAmountButton } from './ResetAmountButton';

describe('ResetAmountButton', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('短按不触发重置，长按 0.8s 才触发一次', () => {
        const onReset = vi.fn();
        render(<ResetAmountButton onReset={onReset} />);
        const button = screen.getByRole('button', { name: '长按重置金额' });

        fireEvent.pointerDown(button, { pointerType: 'touch', clientX: 0, clientY: 0 });
        act(() => {
            vi.advanceTimersByTime(RESET_LONG_PRESS_MS - 200);
        });
        fireEvent.pointerUp(button);
        fireEvent.click(button);
        expect(onReset).not.toHaveBeenCalled();

        fireEvent.pointerDown(button, { pointerType: 'touch', clientX: 0, clientY: 0 });
        act(() => {
            vi.advanceTimersByTime(RESET_LONG_PRESS_MS + 20);
        });
        expect(onReset).toHaveBeenCalledTimes(1);
        fireEvent.pointerUp(button);
    });

    it('按住时出现进度环，松手后消失', () => {
        const onReset = vi.fn();
        render(<ResetAmountButton onReset={onReset} />);
        const button = screen.getByRole('button', { name: '长按重置金额' });

        expect(button.querySelector('.ndf-reset-progress')).toBeNull();
        fireEvent.pointerDown(button, { pointerType: 'touch', clientX: 0, clientY: 0 });
        expect(button.querySelector('.ndf-reset-progress')).not.toBeNull();
        fireEvent.pointerUp(button);
        expect(button.querySelector('.ndf-reset-progress')).toBeNull();
    });
});
