// 日历首页纯逻辑（FR-HOME，BRD v1.5）。
//
// 页面只负责状态与接线，网格生成 / 竖向翻月判定 / 格子文案这些可测的部分都放这里：
//   - 固定 **6 行 × 7 列 = 42 格**：无论大小月、无论 1 号是星期几，网格高度恒定，
//     翻月时下面的内容不会上下跳动（验收标准：切月无整页重排跳动）。
//   - 每格只显示「有数据的那一侧」：收入 `+1.2万`、支出 `-500`，无数据留空。
//     金额省略 `¥` 与符号间距：格子宽约 42px，`+ ¥ 1,000` 放不下。
//   - 上下滑翻月：网格是「上月 / 本月 / 下月」三页竖向 snap 分页器，
//     松手落点用 `monthDeltaForScroll()` 换算成月份增量（一次只翻一个月）。

import {
    WEEKDAY_LABELS,
    parseDayKey,
    shiftDayKey,
    toDayKey,
    weekdayIndex,
    weekdayLabel,
} from '../../core/domain/date';
import { formatCompactAmount, formatSignedMoney } from '../../core/domain/money';
import type { DaySummary } from '../../core/ipc/types';

/** 周标题（日 → 六）。 */
export const CALENDAR_WEEKDAYS = WEEKDAY_LABELS;

/** 固定 6 行：日历高度恒定，切月不跳动。 */
export const CALENDAR_ROWS = 6;
export const CALENDAR_COLUMNS = 7;
export const CALENDAR_CELL_COUNT = CALENDAR_ROWS * CALENDAR_COLUMNS;
/** 单个日期格子的高度（px）：竖向分页器的一页高度 = 行数 × 此值。 */
export const CALENDAR_CELL_HEIGHT_PX = 52;

/** 竖向分页器一页（= 一个整月网格）的高度。 */
export function calendarPaneHeightPx(): number {
    return CALENDAR_ROWS * CALENDAR_CELL_HEIGHT_PX;
}

export interface CalendarCell {
    /** `YYYY-MM-DD`。 */
    readonly dayKey: string;
    /** 日号（1~31），相邻月的格子显示各自月份里的日号。 */
    readonly day: number;
    /** 是否属于当前展示的月份：相邻月的格子弱化显示（但仍可点，未来日期也能记）。 */
    readonly inMonth: boolean;
    readonly isToday: boolean;
    readonly incomeCents: number;
    readonly expenseCents: number;
}

export interface CalendarCellAmounts {
    /** 收入行（`+1.2万`）；无收入为 null。 */
    readonly income: string | null;
    /** 支出行（`-500`）；无支出为 null。 */
    readonly expense: string | null;
}

/** 日历标题：`2025年9月`（点它展开年 / 月选择器）。 */
export function monthTitle(year: number, month: number): string {
    return `${year}年${month}月`;
}

/** 把某月每天的汇总按 `day` 建索引（日历只拉当月数据，最多 31 条）。 */
export function indexDaySummaries(
    summaries: readonly DaySummary[] | undefined,
): Map<string, DaySummary> {
    const map = new Map<string, DaySummary>();
    for (const summary of summaries ?? []) map.set(summary.day, summary);
    return map;
}

/**
 * 生成整月网格（含前后补齐的相邻月日期）。
 *
 * 起点是含 1 号那一周的周日；`isToday` 只在当月格子上生效 ——
 * 相邻月的今天不在这里显示日期数据（数据按展示月份拉取），
 * 打上「今天」标记反而会被误解成「今天没有记录」。
 */
export function buildCalendarCells(params: {
    year: number;
    month: number;
    todayKey: string;
    summaries?: readonly DaySummary[];
}): CalendarCell[] {
    const { year, month, todayKey } = params;
    const byDay = indexDaySummaries(params.summaries);
    const firstKey = toDayKey({ year, month, day: 1 });
    const leading = weekdayIndex({ year, month, day: 1 });
    const cells: CalendarCell[] = [];

    for (let index = 0; index < CALENDAR_CELL_COUNT; index += 1) {
        const dayKey = shiftDayKey(firstKey, index - leading);
        const parts = parseDayKey(dayKey);
        const inMonth = parts?.year === year && parts?.month === month;
        const summary = byDay.get(dayKey);
        cells.push({
            dayKey,
            day: parts?.day ?? 0,
            inMonth,
            isToday: inMonth && dayKey === todayKey,
            incomeCents: inMonth ? summary?.incomeCents ?? 0 : 0,
            expenseCents: inMonth ? summary?.expenseCents ?? 0 : 0,
        });
    }
    return cells;
}

/**
 * 竖向分页器落点 → 月份增量。
 *
 * 分页器固定三页（0 = 上月、1 = 本月、2 = 下月），`snap-mandatory` 保证松手后停在
 * 整页位置，所以这里只看落点是不是**贴在上页 / 下页**（允许 1/4 页误差）：
 * 贴上页 → 翻上一月，贴下页 → 翻下一月，其余（含回弹到中页、异常值）不翻月。
 * **一次手势最多翻一个月**。
 */
export function monthDeltaForScroll(scrollTop: number, paneHeight: number): -1 | 0 | 1 {
    if (!Number.isFinite(scrollTop) || paneHeight <= 0) return 0;
    const tolerance = paneHeight / 4;
    if (Math.abs(scrollTop) <= tolerance) return -1;
    if (Math.abs(scrollTop - paneHeight * 2) <= tolerance) return 1;
    return 0;
}

/** 格子里的收支两行（无数据留空，只显示有数据的那一侧）。 */
export function calendarCellAmounts(cell: CalendarCell): CalendarCellAmounts {
    return {
        income: cell.incomeCents > 0 ? `+${formatCompactAmount(cell.incomeCents)}` : null,
        expense: cell.expenseCents > 0 ? `-${formatCompactAmount(cell.expenseCents)}` : null,
    };
}

/** 格子的无障碍文案（点记账 / 长按看明细的提示一并给出）。 */
export function calendarCellLabel(cell: CalendarCell): string {
    const parts = parseDayKey(cell.dayKey);
    if (!parts) return cell.dayKey;
    const bits = [`${parts.month}月${parts.day}日 ${weekdayLabel(parts)}`];
    if (cell.incomeCents > 0) bits.push(`收入 ${formatSignedMoney(cell.incomeCents, 'income')}`);
    if (cell.expenseCents > 0) bits.push(`支出 ${formatSignedMoney(cell.expenseCents, 'expense')}`);
    bits.push('点击记账，长按看明细');
    return bits.join('，');
}
