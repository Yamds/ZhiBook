// 日历面板（首页用）：标题 + 可展开的年 / 月选择器 + 固定 6×7 网格（可上下滑翻月）。
//
// 交互（BRD FR-HOME-2~6）：
//   - 点标题 → 在日历**上方**展开年 / 月选择器，再点收起（只要年月：日的定位靠点格子）；
//   - **上下滑动网格 → 翻上 / 下一个月**：网格是「上月 / 本月 / 下月」三页竖向 snap
//     分页器，松手结算后按 `monthDeltaForScroll()` 提交并复位到中页；一次手势只翻一个月；
//   - 点某天 → 添加页（带日期，未来日期同样可以记）；长按某天 → 明细页（定位到该天）；
//   - 相邻月的格子弱化显示但**可点**（下个月初的日期就在网格末尾，点不动会让人以为
//     「不能记未来日期」）。
//
// 网格几何与文案全在 `homePage.logic.ts`（纯函数 + 单测），这里只渲染。

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
    MONTH_SELECTOR_VALUES,
    YEAR_SELECTOR_SPAN,
    shiftMonth,
    yearOptions,
} from '../../core/domain/date';
import type { DaySummary } from '../../core/ipc/types';
import { useLongPress } from '../../hooks/ui/useLongPress';
import { Card, PeriodSelector } from '../../shared/ui';
import { ExpandChevron, ExpandPresence } from '../../shared/ui/motion';
import { cn } from '../../shared/utils/cn';
import {
    CALENDAR_CELL_HEIGHT_PX,
    CALENDAR_ROWS,
    CALENDAR_WEEKDAYS,
    buildCalendarCells,
    calendarCellAmounts,
    calendarCellLabel,
    calendarPaneHeightPx,
    monthDeltaForScroll,
    monthTitle,
    type CalendarCell,
} from './homePage.logic';

/** 分页器三页的含义：0 = 上月、1 = 本月、2 = 下月。 */
const PANE_INDEX_OFFSETS = [-1, 0, 1] as const;

/** 滚动停止判定（与 `PeriodSelector` 同口径：最后一帧后 140ms 视为停下）。 */
const SCROLL_SETTLE_MS = 140;

export interface CalendarPeriod {
    readonly year: number;
    readonly month: number;
}

export interface CalendarPanelProps {
    year: number;
    month: number;
    /** 今天（`YYYY-MM-DD`），由页面按设备本地时区算好。 */
    todayKey: string;
    /** 三个月的每日汇总，顺序固定为 `[上月, 本月, 下月]`（翻月时即时显示）。 */
    days: readonly (readonly DaySummary[] | undefined)[];
    /** 当前展示月份的数据是否在加载（网格整体降透明度）。 */
    isLoading: boolean;
    onPeriodChange: (next: CalendarPeriod) => void;
    /** 点击某天 → 进添加页记账。 */
    onPickDay: (dayKey: string) => void;
    /** 长按某天 → 进明细页看这一天。 */
    onOpenDayDetails: (dayKey: string) => void;
}

export function CalendarPanel({
    year,
    month,
    todayKey,
    days,
    isLoading,
    onPeriodChange,
    onPickDay,
    onOpenDayDetails,
}: CalendarPanelProps) {
    const [panelOpen, setPanelOpen] = useState(false);

    const yearValues = useMemo(() => yearOptions(undefined, YEAR_SELECTOR_SPAN), []);
    const paneHeight = calendarPaneHeightPx();

    const months = useMemo(
        () => PANE_INDEX_OFFSETS.map((offset) => shiftMonth(year, month, offset)),
        [month, year],
    );

    const pagerRef = useRef<HTMLDivElement | null>(null);
    /** 复位 scrollTop 会触发 scroll 事件：这段时间内不要当成用户翻月。 */
    const programmaticRef = useRef(false);
    const settleTimerRef = useRef<number | null>(null);
    /** 用户是否在这个分页器上动过手（首帧的程序化滚动没这个标记）。 */
    const interactedRef = useRef(false);
    const recenterTimerRef = useRef<number | null>(null);

    /** 把分页器收回中页（本月）。 */
    const recenter = useCallback(() => {
        const pager = pagerRef.current;
        if (!pager) return;
        programmaticRef.current = true;
        pager.scrollTop = calendarPaneHeightPx();
        if (recenterTimerRef.current !== null) window.clearTimeout(recenterTimerRef.current);
        recenterTimerRef.current = window.setTimeout(() => {
            programmaticRef.current = false;
            recenterTimerRef.current = null;
        }, 60);
    }, []);

    // 换月（或首帧）后必须落回中页：否则下一次手势的方向会反，或者一进来就多翻一个月。
    useLayoutEffect(() => {
        recenter();
    }, [recenter, year, month]);

    useLayoutEffect(() => () => {
        if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
        if (recenterTimerRef.current !== null) window.clearTimeout(recenterTimerRef.current);
    }, []);

    const handleScroll = useCallback(() => {
        if (programmaticRef.current) return;
        if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = window.setTimeout(() => {
            settleTimerRef.current = null;
            const pager = pagerRef.current;
            if (!pager) return;
            // 用户没动过手还收到 scroll：只可能是首帧 / 浏览器强制重吸附，
            // 这种情况下**绝不翻月**，只把位置收回中页。
            if (!interactedRef.current) {
                recenter();
                return;
            }
            const delta = monthDeltaForScroll(pager.scrollTop, paneHeight);
            if (delta !== 0) onPeriodChange(shiftMonth(year, month, delta));
        }, SCROLL_SETTLE_MS);
    }, [month, onPeriodChange, paneHeight, recenter, year]);

    return (
        <Card data-tour="home-calendar" className="flex flex-col gap-1.5 rounded-lg p-3">
            <header className="flex items-center justify-between gap-2">
                <button
                    type="button"
                    onClick={() => setPanelOpen((open) => !open)}
                    aria-expanded={panelOpen}
                    className="flex items-center gap-1.5 rounded-md px-1.5 py-1 active:bg-inset"
                >
                    <span className="text-[15px] font-semibold tabular-nums text-text">
                        {monthTitle(year, month)}
                    </span>
                    <ExpandChevron open={panelOpen} />
                </button>
            </header>

            {/* 年 / 月选择器：展开在日历上方（FR-HOME-4，只要年月） */}
            <ExpandPresence visible={panelOpen}>
                <div className="flex flex-col gap-0.5 pb-1.5">
                    <PeriodSelector
                        values={yearValues}
                        value={year}
                        onChange={(next) => onPeriodChange({ year: next, month })}
                        visible={3}
                        unit="年"
                        ariaLabel="选择年份"
                    />
                    <PeriodSelector
                        values={MONTH_SELECTOR_VALUES}
                        value={month}
                        onChange={(next) => onPeriodChange({ year, month: next })}
                        unit="月"
                        ariaLabel="选择月份"
                    />
                </div>
            </ExpandPresence>

            <div className="grid grid-cols-7" aria-hidden>
                {CALENDAR_WEEKDAYS.map((label, index) => (
                    <span
                        key={label}
                        className={cn(
                            'py-1 text-center text-[11px] font-medium',
                            index === 0 || index === 6 ? 'text-text-disabled' : 'text-text-tertiary',
                        )}
                    >
                        {label}
                    </span>
                ))}
            </div>

            {/* 竖向翻月：三页 snap 分页器，视口高度 = 一个整月网格 */}
            <div
                ref={pagerRef}
                onScroll={handleScroll}
                onPointerDown={() => {
                    interactedRef.current = true;
                }}
                data-no-swipe
                style={{ height: paneHeight }}
                className={cn(
                    'scrollbar-hide snap-y snap-mandatory overflow-y-auto overscroll-y-contain',
                    'transition-opacity duration-200',
                    isLoading && 'opacity-70',
                )}
                aria-busy={isLoading}
            >
                {months.map((pane, index) => (
                    <MonthGrid
                        key={`${pane.year}-${pane.month}`}
                        year={pane.year}
                        month={pane.month}
                        todayKey={todayKey}
                        summaries={days[index]}
                        onPickDay={onPickDay}
                        onOpenDayDetails={onOpenDayDetails}
                    />
                ))}
            </div>
        </Card>
    );
}

function MonthGrid({
    year,
    month,
    todayKey,
    summaries,
    onPickDay,
    onOpenDayDetails,
}: {
    year: number;
    month: number;
    todayKey: string;
    summaries: readonly DaySummary[] | undefined;
    onPickDay: (dayKey: string) => void;
    onOpenDayDetails: (dayKey: string) => void;
}) {
    const cells = useMemo(
        () => buildCalendarCells({ year, month, todayKey, summaries }),
        [month, summaries, todayKey, year],
    );

    return (
        <div
            className="grid snap-center snap-always grid-cols-7"
            style={{ height: CALENDAR_ROWS * CALENDAR_CELL_HEIGHT_PX }}
            role="group"
            aria-label={`${monthTitle(year, month)}日历`}
        >
            {cells.map((cell) => (
                <CalendarDayCell
                    key={cell.dayKey}
                    cell={cell}
                    onPickDay={onPickDay}
                    onOpenDayDetails={onOpenDayDetails}
                />
            ))}
        </div>
    );
}

function CalendarDayCell({
    cell,
    onPickDay,
    onOpenDayDetails,
}: {
    cell: CalendarCell;
    onPickDay: (dayKey: string) => void;
    onOpenDayDetails: (dayKey: string) => void;
}) {
    const longPress = useLongPress({
        onLongPress: () => onOpenDayDetails(cell.dayKey),
        onClick: () => onPickDay(cell.dayKey),
    });
    const amounts = calendarCellAmounts(cell);

    return (
        <button
            type="button"
            data-day-key={cell.dayKey}
            aria-label={calendarCellLabel(cell)}
            aria-current={cell.isToday ? 'date' : undefined}
            style={{ height: CALENDAR_CELL_HEIGHT_PX }}
            className="flex select-none flex-col items-center gap-0.5 overflow-hidden rounded-md pt-1 active:bg-inset"
            {...longPress}
        >
            <span
                className={cn(
                    'grid h-[22px] min-w-[22px] place-items-center rounded-full px-1 text-[13px] font-medium tabular-nums',
                    !cell.inMonth && 'text-text-disabled',
                    cell.inMonth && !cell.isToday && 'text-text',
                    cell.isToday && 'text-brand ring-[1.5px] ring-brand',
                )}
            >
                {cell.day}
            </span>
            {amounts.income ? (
                <span className="max-w-full truncate text-[9.5px] font-medium leading-none tabular-nums text-success">
                    {amounts.income}
                </span>
            ) : null}
            {amounts.expense ? (
                <span className="max-w-full truncate text-[9.5px] font-medium leading-none tabular-nums text-danger">
                    {amounts.expense}
                </span>
            ) : null}
        </button>
    );
}

export default CalendarPanel;
