// 防抖 hook 测试：只延迟值的传播，不丢最终值。

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedValue } from './useDebouncedValue';

function Harness({ value }: { value: string }) {
    const debounced = useDebouncedValue(value, 250);
    return <span data-testid="out">{debounced}</span>;
}

describe('useDebouncedValue', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('延迟后才传播新值', () => {
        const view = render(<Harness value="a" />);
        expect(screen.getByTestId('out').textContent).toBe('a');

        view.rerender(<Harness value="ab" />);
        expect(screen.getByTestId('out').textContent).toBe('a');

        act(() => vi.advanceTimersByTime(249));
        expect(screen.getByTestId('out').textContent).toBe('a');

        act(() => vi.advanceTimersByTime(1));
        expect(screen.getByTestId('out').textContent).toBe('ab');
    });

    it('连续输入只传播最后一次', () => {
        const view = render(<Harness value="a" />);
        view.rerender(<Harness value="ab" />);
        act(() => vi.advanceTimersByTime(100));
        view.rerender(<Harness value="abc" />);
        act(() => vi.advanceTimersByTime(250));
        expect(screen.getByTestId('out').textContent).toBe('abc');
    });
});
