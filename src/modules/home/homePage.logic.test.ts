// 日历首页纯逻辑测试：整月网格、竖向翻月判定、格子文案与收支行。

import { describe, expect, it } from 'vitest';
import type { DaySummary } from '../../core/ipc/types';
import {
    CALENDAR_CELL_COUNT,
    CALENDAR_CELL_HEIGHT_PX,
    CALENDAR_ROWS,
    buildCalendarCells,
    calendarCellAmounts,
    calendarCellLabel,
    calendarPaneHeightPx,
    indexDaySummaries,
    monthDeltaForScroll,
    monthTitle,
} from './homePage.logic';

function summary(day: string, expenseCents: number, incomeCents: number): DaySummary {
    return {
        day,
        expenseCents,
        incomeCents,
        balanceCents: incomeCents - expenseCents,
        count: (expenseCents > 0 ? 1 : 0) + (incomeCents > 0 ? 1 : 0),
    };
}

function cellsFor(year: number, month: number, todayKey = '2025-09-08', summaries: DaySummary[] = []) {
    return buildCalendarCells({ year, month, todayKey, summaries });
}

/** 按日期取格子（网格首格不一定是 1 号，所以不能直接用下标）。 */
function cellAt(cells: ReturnType<typeof cellsFor>, dayKey: string) {
    const cell = cells.find((item) => item.dayKey === dayKey);
    if (!cell) throw new Error(`missing cell: ${dayKey}`);
    return cell;
}

describe('整月网格（buildCalendarCells）', () => {
    it('固定 42 格，从含 1 号那周的周日开始', () => {
        // 2025-09-01 是星期一 → 网格首格应为 2025-08-31（周日）
        const cells = cellsFor(2025, 9);
        expect(cells).toHaveLength(CALENDAR_CELL_COUNT);
        expect(cells[0].dayKey).toBe('2025-08-31');
        expect(cells[0].inMonth).toBe(false);
        expect(cells[1].dayKey).toBe('2025-09-01');
        expect(cells[1].inMonth).toBe(true);
        expect(cells[30].dayKey).toBe('2025-09-30');
        expect(cells[31].inMonth).toBe(false);
    });

    it('1 号就是周日时首格即 1 号', () => {
        // 2025-06-01 是星期日
        const cells = cellsFor(2025, 6);
        expect(cells[0].dayKey).toBe('2025-06-01');
        expect(cells[0].inMonth).toBe(true);
    });

    it('闰年 2 月与跨年都生成 42 格', () => {
        const leap = cellsFor(2024, 2);
        expect(leap).toHaveLength(CALENDAR_CELL_COUNT);
        expect(leap.filter((cell) => cell.inMonth)).toHaveLength(29);

        const crossed = cellsFor(2025, 12);
        // 2026-01-01 落在网格末尾（2025-12-01 是星期一 → 首格 2025-11-30）
        expect(crossed[0].dayKey).toBe('2025-11-30');
        expect(crossed.at(-1)?.dayKey).toBe('2026-01-10');
        expect(crossed.some((cell) => cell.dayKey === '2026-01-01' && !cell.inMonth)).toBe(true);
    });

    it('今天只在当月格子上生效', () => {
        // 2025-08-31 是 9 月网格里的相邻月格子，不该打「今天」标记
        const cells = cellsFor(2025, 9, '2025-08-31');
        expect(cellAt(cells, '2025-08-31').isToday).toBe(false);
        expect(cells.filter((cell) => cell.isToday)).toHaveLength(0);
    });

    it('只有当月格子吃每天的收支汇总', () => {
        const summaries = [summary('2025-09-08', 75000, 100000)];
        const map = indexDaySummaries(summaries);
        expect(map.get('2025-09-08')?.expenseCents).toBe(75000);

        const cells = cellsFor(2025, 9, '2025-09-08', summaries);
        expect(cellAt(cells, '2025-09-08').incomeCents).toBe(100000);
        expect(cellAt(cells, '2025-09-08').expenseCents).toBe(75000);
        const empty = cellAt(cells, '2025-09-09');
        expect(empty.incomeCents).toBe(0);
        expect(empty.expenseCents).toBe(0);
    });
});

describe('竖向翻月（monthDeltaForScroll）', () => {
    const pane = calendarPaneHeightPx();

    it('分页器一页 = 6 行格子高', () => {
        expect(pane).toBe(CALENDAR_ROWS * CALENDAR_CELL_HEIGHT_PX);
    });

    it('落在上月页 → -1，落回中页 → 0，落在下月页 → +1', () => {
        expect(monthDeltaForScroll(0, pane)).toBe(-1);
        expect(monthDeltaForScroll(pane, pane)).toBe(0);
        expect(monthDeltaForScroll(pane * 2, pane)).toBe(1);
    });

    it('回弹中的中间位置不翻月（一次手势最多翻一个月）', () => {
        expect(monthDeltaForScroll(pane * 0.4, pane)).toBe(0);
        expect(monthDeltaForScroll(pane * 0.6, pane)).toBe(0);
        expect(monthDeltaForScroll(pane * 1.45, pane)).toBe(0);
        expect(monthDeltaForScroll(pane * 1.8, pane)).toBe(1);
        // 异常大值只当没翻（不猜用户意图）
        expect(monthDeltaForScroll(pane * 5, pane)).toBe(0);
    });

    it('异常输入不翻月', () => {
        expect(monthDeltaForScroll(Number.NaN, pane)).toBe(0);
        expect(monthDeltaForScroll(100, 0)).toBe(0);
    });
});

describe('格子文案', () => {
    it('标题为「YYYY年M月」', () => {
        expect(monthTitle(2025, 9)).toBe('2025年9月');
        expect(monthTitle(2025, 12)).toBe('2025年12月');
    });

    it('收支两行按金额缩写、无数据留空', () => {
        const cells = cellsFor(2025, 9, '2025-09-08', [summary('2025-09-08', 75000, 1000000)]);
        expect(calendarCellAmounts(cellAt(cells, '2025-09-08'))).toEqual({ income: '+1万', expense: '-750' });
        expect(calendarCellAmounts(cellAt(cells, '2025-09-09'))).toEqual({ income: null, expense: null });
    });

    it('只有收入或只有支出时另一侧为 null', () => {
        const incomeCells = cellsFor(2025, 9, '2025-09-08', [summary('2025-09-08', 0, 50000)]);
        expect(calendarCellAmounts(cellAt(incomeCells, '2025-09-08'))).toEqual({ income: '+500', expense: null });

        const expenseCells = cellsFor(2025, 9, '2025-09-08', [summary('2025-09-08', 40, 0)]);
        expect(calendarCellAmounts(cellAt(expenseCells, '2025-09-08'))).toEqual({ income: null, expense: '-0.4' });
    });

    it('无障碍文案带日期、星期与两侧金额', () => {
        const cells = cellsFor(2025, 9, '2025-09-08', [summary('2025-09-08', 75000, 100000)]);
        expect(calendarCellLabel(cellAt(cells, '2025-09-08'))).toBe(
            '9月8日 星期一，收入 + ¥ 1,000.00，支出 - ¥ 750.00，点击记账，长按看明细',
        );
    });
});
