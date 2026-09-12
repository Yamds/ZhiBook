import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLongPress } from './useLongPress';

function Harness({
    onLongPress,
    onClick,
    delayMs,
}: {
    onLongPress: () => void;
    onClick?: () => void;
    delayMs?: number;
}) {
    const bind = useLongPress({ onLongPress, onClick, delayMs });
    return (
        <button type="button" data-testid="target" {...bind}>
            目标
        </button>
    );
}

describe('useLongPress', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('按住超过阈值触发一次长按', () => {
        const onLongPress = vi.fn();
        render(<Harness onLongPress={onLongPress} />);
        const target = screen.getByTestId('target');

        fireEvent.pointerDown(target, { pointerType: 'touch', clientX: 10, clientY: 10 });
        act(() => {
            vi.advanceTimersByTime(520);
        });

        expect(onLongPress).toHaveBeenCalledTimes(1);
        fireEvent.pointerUp(target);
        act(() => {
            vi.advanceTimersByTime(300);
        });
        expect(onLongPress).toHaveBeenCalledTimes(1);
    });

    it('移动超过容差视为滑动，不触发长按', () => {
        const onLongPress = vi.fn();
        render(<Harness onLongPress={onLongPress} />);
        const target = screen.getByTestId('target');

        fireEvent.pointerDown(target, { pointerType: 'touch', clientX: 10, clientY: 10 });
        fireEvent.pointerMove(target, { pointerType: 'touch', clientX: 40, clientY: 12 });
        act(() => {
            vi.advanceTimersByTime(520);
        });

        expect(onLongPress).not.toHaveBeenCalled();
    });

    it('短按走 click，且长按后的那次 click 被吞掉', () => {
        const onLongPress = vi.fn();
        const onClick = vi.fn();
        render(<Harness onLongPress={onLongPress} onClick={onClick} />);
        const target = screen.getByTestId('target');

        fireEvent.pointerDown(target, { pointerType: 'touch', clientX: 0, clientY: 0 });
        fireEvent.pointerUp(target);
        fireEvent.click(target);
        expect(onClick).toHaveBeenCalledTimes(1);

        fireEvent.pointerDown(target, { pointerType: 'touch', clientX: 0, clientY: 0 });
        act(() => {
            vi.advanceTimersByTime(520);
        });
        fireEvent.pointerUp(target);
        fireEvent.click(target);

        expect(onLongPress).toHaveBeenCalledTimes(1);
        expect(onClick).toHaveBeenCalledTimes(1);
    });
});
