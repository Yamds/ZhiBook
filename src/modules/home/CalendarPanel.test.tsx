// 日历面板交互测试：网格渲染、点击记账、长按看明细、标题展开年月选择器、竖向翻月。

import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DaySummary } from '../../core/ipc/types';
import { CALENDAR_CELL_HEIGHT_PX, CALENDAR_ROWS } from './homePage.logic';
import { CalendarPanel } from './CalendarPanel';

const PANE_HEIGHT = CALENDAR_ROWS * CALENDAR_CELL_HEIGHT_PX;

const baseProps = {
    year: 2025,
    month: 9,
    todayKey: '2025-09-08',
    days: [[], [], []] as readonly DaySummary[][],
    isLoading: false,
    onPeriodChange: () => {},
    onPickDay: () => {},
    onOpenDayDetails: () => {},
};

/** 取中页（本月）的 42 个格子。 */
function currentPaneCells(): HTMLButtonElement[] {
    const groups = Array.from(document.querySelectorAll<HTMLElement>('[role="group"]'));
    const middle = groups.find((group) => group.getAttribute('aria-label') === '2025年9月日历');
    if (!middle) throw new Error('missing current month pane');
    return Array.from(middle.querySelectorAll<HTMLButtonElement>('button'));
}

function cellNamed(prefix: string): HTMLButtonElement {
    const cell = currentPaneCells().find((item) => item.getAttribute('aria-label')?.startsWith(prefix));
    if (!cell) throw new Error(`missing cell: ${prefix}`);
    return cell;
}

function pager(): HTMLDivElement {
    const node = document.querySelector<HTMLDivElement>('.snap-y');
    if (!node) throw new Error('missing pager');
    return node;
}

/** 模拟用户在分页器上动手（真实场景下滚动前必然有 pointerdown）。 */
function touchPager(): HTMLDivElement {
    const node = pager();
    fireEvent.pointerDown(node, { clientX: 20, clientY: 20 });
    return node;
}

describe('CalendarPanel', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('固定渲染 42 个格子；相邻月的格子弱化但仍可点（未来日期也能记）', () => {
        render(<CalendarPanel {...baseProps} />);
        const cells = currentPaneCells();
        expect(cells).toHaveLength(42);
        // 2025-09-01 是星期一 → 首格 8/31（相邻月）
        expect(cells[0].dataset.dayKey).toBe('2025-08-31');
        expect(cells[0].disabled).toBe(false);
        expect(cellNamed('8月31日')).toBe(cells[0]);
    });

    it('点击某天 → 回调该天的日期键（进添加页），未来日期同样可以', () => {
        const onPickDay = vi.fn();
        render(<CalendarPanel {...baseProps} onPickDay={onPickDay} />);
        // 2025-10-05 是本月中页网格里的相邻月（下个月）格子
        fireEvent.click(cellNamed('10月5日'));
        expect(onPickDay).toHaveBeenCalledWith('2025-10-05');
    });

    it('长按某天 → 回调该天（进明细页），并吞掉随后的 click', () => {
        const onPickDay = vi.fn();
        const onOpenDayDetails = vi.fn();
        render(
            <CalendarPanel {...baseProps} onPickDay={onPickDay} onOpenDayDetails={onOpenDayDetails} />,
        );
        const cell = cellNamed('9月15日');
        fireEvent.pointerDown(cell, { clientX: 10, clientY: 10 });
        act(() => { vi.advanceTimersByTime(500); });
        expect(onOpenDayDetails).toHaveBeenCalledWith('2025-09-15');
        fireEvent.click(cell);
        expect(onPickDay).not.toHaveBeenCalled();
    });

    it('位移超过 8px 时取消长按（当成滚动）', () => {
        const onOpenDayDetails = vi.fn();
        render(<CalendarPanel {...baseProps} onOpenDayDetails={onOpenDayDetails} />);
        const cell = cellNamed('9月15日');
        fireEvent.pointerDown(cell, { clientX: 10, clientY: 10 });
        fireEvent.pointerMove(cell, { clientX: 10, clientY: 40 });
        act(() => { vi.advanceTimersByTime(600); });
        expect(onOpenDayDetails).not.toHaveBeenCalled();
    });

    it('点标题展开 / 收起年 · 月选择器（没有日选择器）', () => {
        const { getByText, queryByLabelText } = render(<CalendarPanel {...baseProps} />);
        const title = getByText('2025年9月').closest('button') as HTMLButtonElement;
        expect(queryByLabelText('选择年份')).toBeNull();
        expect(title.getAttribute('aria-expanded')).toBe('false');

        fireEvent.click(title);
        expect(title.getAttribute('aria-expanded')).toBe('true');
        expect(queryByLabelText('选择年份')).toBeTruthy();
        expect(queryByLabelText('选择月份')).toBeTruthy();
        expect(queryByLabelText('选择日期')).toBeNull();

        fireEvent.click(title);
        expect(title.getAttribute('aria-expanded')).toBe('false');
    });

    it('三页分页器：首帧落在中页（本月）', () => {
        render(<CalendarPanel {...baseProps} />);
        expect(pager().scrollTop).toBe(PANE_HEIGHT);
    });

    it('向下滑一页 → 翻到上一个月；向上滑一页 → 翻到下一个月', () => {
        const onPeriodChange = vi.fn();
        render(<CalendarPanel {...baseProps} onPeriodChange={onPeriodChange} />);
        // 首帧会程序化复位 scrollTop（60ms 内不响应 scroll 事件）
        act(() => { vi.advanceTimersByTime(100); });

        const node = touchPager();
        node.scrollTop = 0;
        fireEvent.scroll(node);
        act(() => { vi.advanceTimersByTime(200); });
        expect(onPeriodChange).toHaveBeenCalledWith({ year: 2025, month: 8 });

        node.scrollTop = PANE_HEIGHT * 2;
        fireEvent.scroll(node);
        act(() => { vi.advanceTimersByTime(200); });
        expect(onPeriodChange).toHaveBeenLastCalledWith({ year: 2025, month: 10 });
    });

    it('翻月跨年：12 月向上滑一页 → 次年 1 月', () => {
        const onPeriodChange = vi.fn();
        render(
            <CalendarPanel {...baseProps} year={2025} month={12} onPeriodChange={onPeriodChange} />,
        );
        act(() => { vi.advanceTimersByTime(100); });
        const node = touchPager();
        node.scrollTop = PANE_HEIGHT * 2;
        fireEvent.scroll(node);
        act(() => { vi.advanceTimersByTime(200); });
        expect(onPeriodChange).toHaveBeenCalledWith({ year: 2026, month: 1 });
    });

    it('回弹到中页（没翻过去）时不换月', () => {
        const onPeriodChange = vi.fn();
        render(<CalendarPanel {...baseProps} onPeriodChange={onPeriodChange} />);
        act(() => { vi.advanceTimersByTime(100); });
        const node = touchPager();
        node.scrollTop = PANE_HEIGHT + 40;
        fireEvent.scroll(node);
        act(() => { vi.advanceTimersByTime(200); });
        expect(onPeriodChange).not.toHaveBeenCalled();
    });

    it('用户没动过手时的 scroll（首帧 / 浏览器重吸附）不会翻月，且收回中页', () => {
        const onPeriodChange = vi.fn();
        render(<CalendarPanel {...baseProps} onPeriodChange={onPeriodChange} />);
        act(() => { vi.advanceTimersByTime(100); });

        const node = pager();
        node.scrollTop = 0;
        fireEvent.scroll(node);
        act(() => { vi.advanceTimersByTime(200); });
        expect(onPeriodChange).not.toHaveBeenCalled();
        expect(node.scrollTop).toBe(PANE_HEIGHT);
    });

    it('有数据时显示缩写后的收支两行', () => {
        const days: DaySummary[] = [
            { day: '2025-09-08', expenseCents: 75000, incomeCents: 1000000, balanceCents: 925000, count: 2 },
        ];
        const { getByText } = render(<CalendarPanel {...baseProps} days={[[], days, []]} />);
        expect(getByText('+1万')).toBeTruthy();
        expect(getByText('-750')).toBeTruthy();
    });
});
