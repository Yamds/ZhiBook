// 日历面板交互测试：网格渲染、点击记账、长按看明细、标题展开选择器、金额缩写。

import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DaySummary } from '../../core/ipc/types';
import { CalendarPanel } from './CalendarPanel';

const baseProps = {
    year: 2025,
    month: 9,
    todayKey: '2025-09-08',
    selectedDayKey: '2025-09-08',
    days: [] as DaySummary[],
    isLoading: false,
    onYearChange: () => {},
    onMonthChange: () => {},
    onDayChange: () => {},
    onPickDay: () => {},
    onOpenDayDetails: () => {},
};

function cellsOf(container: HTMLElement): HTMLButtonElement[] {
    return Array.from(container.querySelectorAll<HTMLButtonElement>('[role="group"] > button'));
}

function cellNamed(container: HTMLElement, prefix: string): HTMLButtonElement {
    const cell = cellsOf(container).find((item) => item.getAttribute('aria-label')?.startsWith(prefix));
    if (!cell) throw new Error(`missing cell: ${prefix}`);
    return cell;
}

describe('CalendarPanel', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('固定渲染 42 个格子，相邻月的格子不可交互', () => {
        const { container } = render(<CalendarPanel {...baseProps} />);
        const cells = cellsOf(container);
        expect(cells).toHaveLength(42);
        // 2025-09-01 是星期一 → 首格 8/31（相邻月，禁用）
        expect(cells[0].disabled).toBe(true);
        expect(cellNamed(container, '9月1日').disabled).toBe(false);
        expect(cells.filter((cell) => !cell.disabled)).toHaveLength(30);
    });

    it('点击某天 → 回调该天的日期键（进添加页）', () => {
        const onPickDay = vi.fn();
        const { container } = render(<CalendarPanel {...baseProps} onPickDay={onPickDay} />);
        fireEvent.click(cellNamed(container, '9月15日'));
        expect(onPickDay).toHaveBeenCalledWith('2025-09-15');
    });

    it('长按某天 → 回调该天（进明细页），并吞掉随后的 click', () => {
        const onPickDay = vi.fn();
        const onOpenDayDetails = vi.fn();
        const { container } = render(
            <CalendarPanel {...baseProps} onPickDay={onPickDay} onOpenDayDetails={onOpenDayDetails} />,
        );
        const cell = cellNamed(container, '9月15日');
        fireEvent.pointerDown(cell, { clientX: 10, clientY: 10 });
        act(() => { vi.advanceTimersByTime(500); });
        expect(onOpenDayDetails).toHaveBeenCalledWith('2025-09-15');
        fireEvent.click(cell);
        expect(onPickDay).not.toHaveBeenCalled();
    });

    it('位移超过 8px 时取消长按（当成滚动）', () => {
        const onOpenDayDetails = vi.fn();
        const { container } = render(
            <CalendarPanel {...baseProps} onOpenDayDetails={onOpenDayDetails} />,
        );
        const cell = cellNamed(container, '9月15日');
        fireEvent.pointerDown(cell, { clientX: 10, clientY: 10 });
        fireEvent.pointerMove(cell, { clientX: 10, clientY: 40 });
        act(() => { vi.advanceTimersByTime(600); });
        expect(onOpenDayDetails).not.toHaveBeenCalled();
    });

    it('点标题展开 / 收起年·月·日选择器', () => {
        const { container, getByText } = render(<CalendarPanel {...baseProps} />);
        const title = getByText('2025年9月').closest('button') as HTMLButtonElement;
        expect(container.querySelector('[aria-label="选择年份"]')).toBeNull();
        expect(title.getAttribute('aria-expanded')).toBe('false');

        fireEvent.click(title);
        expect(title.getAttribute('aria-expanded')).toBe('true');
        expect(container.querySelector('[aria-label="选择年份"]')).toBeTruthy();
        expect(container.querySelector('[aria-label="选择月份"]')).toBeTruthy();
        expect(container.querySelector('[aria-label="选择日期"]')).toBeTruthy();

        // 收起后的卸载时机由 GsapPresence 的退场动画决定（jsdom 不推进动画），
        // 这里只钉住交互状态本身。
        fireEvent.click(title);
        expect(title.getAttribute('aria-expanded')).toBe('false');
    });

    it('有数据时显示缩写后的收支两行', () => {
        const days: DaySummary[] = [
            { day: '2025-09-08', expenseCents: 75000, incomeCents: 1000000, balanceCents: 925000, count: 2 },
        ];
        const { getByText } = render(<CalendarPanel {...baseProps} days={days} />);
        expect(getByText('+1万')).toBeTruthy();
        expect(getByText('-750')).toBeTruthy();
    });
});
