// 日历面板（首页用）：标题 + 可展开的年 / 月 / 日选择器 + 固定 6×7 网格。
//
// 交互（BRD FR-HOME-2~6 / Q6）：
//   - 点标题 → 在日历**上方**展开年 / 月 / 日选择器，再点收起；
//   - 日选择器按 Q6 只改「高亮定位」，跳转仍靠点 / 长按日期格子；
//   - 点某天 → 添加页（带日期）；长按某天 → 明细页（定位到该天）；
//   - 相邻月的格子弱化且不可点，避免误把账记到别的月份。
//
// 网格几何与文案全在 `homePage.logic.ts`（纯函数 + 单测），这里只渲染。

import { useMemo, useState } from 'react';
import {
    MONTH_SELECTOR_VALUES,
    YEAR_SELECTOR_SPAN,
    daysOfMonth,
    parseDayKey,
    yearOptions,
} from '../../core/domain/date';
import type { DaySummary } from '../../core/ipc/types';
import { useLongPress } from '../../hooks/ui/useLongPress';
import { Card, PeriodSelector } from '../../shared/ui';
import { ExpandChevron, ExpandPresence } from '../../shared/ui/motion';
import { cn } from '../../shared/utils/cn';
import {
    CALENDAR_WEEKDAYS,
    buildCalendarCells,
    calendarCellAmounts,
    calendarCellLabel,
    monthTitle,
    type CalendarCell,
} from './homePage.logic';

export interface CalendarPanelProps {
    year: number;
    month: number;
    /** 今天（`YYYY-MM-DD`），由页面按设备本地时区算好。 */
    todayKey: string;
    /** 当前高亮日（由日选择器 / 换月夹取决定）。 */
    selectedDayKey: string;
    /** 当月每日汇总（`useDaySummaries`）。 */
    days: readonly DaySummary[] | undefined;
    isLoading: boolean;
    onYearChange: (year: number) => void;
    onMonthChange: (month: number) => void;
    onDayChange: (day: number) => void;
    /** 点击某天 → 进添加页记账。 */
    onPickDay: (dayKey: string) => void;
    /** 长按某天 → 进明细页看这一天。 */
    onOpenDayDetails: (dayKey: string) => void;
}

export function CalendarPanel({
    year,
    month,
    todayKey,
    selectedDayKey,
    days,
    isLoading,
    onYearChange,
    onMonthChange,
    onDayChange,
    onPickDay,
    onOpenDayDetails,
}: CalendarPanelProps) {
    const [panelOpen, setPanelOpen] = useState(false);

    const yearValues = useMemo(() => yearOptions(undefined, YEAR_SELECTOR_SPAN), []);
    const dayValues = useMemo(() => daysOfMonth(year, month), [year, month]);
    const today = parseDayKey(todayKey);
    const selectedDay = parseDayKey(selectedDayKey)?.day ?? 1;

    const cells = useMemo(
        () => buildCalendarCells({ year, month, todayKey, selectedDayKey, summaries: days }),
        [days, month, selectedDayKey, todayKey, year],
    );

    return (
        <Card className="flex flex-col gap-1.5 rounded-lg p-3">
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

            {/* 年 / 月 / 日选择器：展开在日历上方（FR-HOME-4） */}
            <ExpandPresence visible={panelOpen}>
                <div className="flex flex-col gap-0.5 pb-1.5">
                    <PeriodSelector
                        values={yearValues}
                        value={year}
                        onChange={onYearChange}
                        visible={3}
                        unit="年"
                        ariaLabel="选择年份"
                    />
                    <PeriodSelector
                        values={MONTH_SELECTOR_VALUES}
                        value={month}
                        onChange={onMonthChange}
                        unit="月"
                        ariaLabel="选择月份"
                    />
                    <PeriodSelector
                        values={dayValues}
                        value={selectedDay}
                        onChange={onDayChange}
                        unit="日"
                        ariaLabel="选择日期"
                        isMarked={(value) =>
                            today !== null && today.year === year && today.month === month && value === today.day
                        }
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

            <div
                className={cn(
                    'grid grid-cols-7 transition-opacity duration-200',
                    isLoading && 'opacity-70',
                )}
                role="group"
                aria-label={`${monthTitle(year, month)}日历`}
                aria-busy={isLoading}
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
        </Card>
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
            disabled={!cell.inMonth}
            data-day-key={cell.dayKey}
            aria-label={cell.inMonth ? calendarCellLabel(cell) : undefined}
            aria-current={cell.isToday ? 'date' : undefined}
            className={cn(
                'flex h-[52px] select-none flex-col items-center gap-0.5 overflow-hidden rounded-md pt-1',
                cell.inMonth && 'active:bg-inset',
            )}
            {...longPress}
        >
            <span
                className={cn(
                    'grid h-[22px] min-w-[22px] place-items-center rounded-full px-1 text-[13px] font-medium tabular-nums',
                    !cell.inMonth && 'text-text-disabled',
                    cell.inMonth && !cell.isSelected && !cell.isToday && 'text-text',
                    cell.isToday && !cell.isSelected && 'text-brand ring-[1.5px] ring-brand',
                    cell.isSelected && 'bg-brand font-semibold text-white',
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
