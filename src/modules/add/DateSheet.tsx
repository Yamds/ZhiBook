// 日期选择弹层（BRD FR-ADD-15）：月历 + 快捷「今天」，可跨月 / 跨年，允许未来日期。

import { useEffect, useMemo, useState } from 'react';
import {
    WEEKDAY_LABELS,
    clampDay,
    shiftMonth,
    toDayKey,
    todayDate,
    weekdayIndex,
    type CalendarDate,
} from '../../core/domain/date';
import { UI_ICONS } from '../../core/design/icons';
import { AppIcon } from '../../shared/ui/AppIcon';
import { BottomSheet } from '../../shared/ui/BottomSheet';
import { cn } from '../../shared/utils/cn';

export interface DateSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    value: CalendarDate;
    onSelect: (value: CalendarDate) => void;
}

/** 月历网格：从当月 1 号所在周的周日开始，固定 6 行 × 7 列。 */
function buildCalendarCells(year: number, month: number): CalendarDate[] {
    const firstWeekday = weekdayIndex({ year, month, day: 1 });
    const cells: CalendarDate[] = [];
    for (let index = 0; index < 42; index += 1) {
        const offset = index - firstWeekday;
        // 用 Date 做跨月偏移，避免自己写进位
        const date = new Date(year, month - 1, 1 + offset);
        cells.push({
            year: date.getFullYear(),
            month: date.getMonth() + 1,
            day: date.getDate(),
        });
    }
    return cells;
}

export function DateSheet({ open, onOpenChange, value, onSelect }: DateSheetProps) {
    const [view, setView] = useState<{ year: number; month: number }>(() => ({
        year: value.year,
        month: value.month,
    }));

    // 每次打开都回到当前选中月，避免上次翻页残留
    useEffect(() => {
        if (open) setView({ year: value.year, month: value.month });
    }, [open, value.year, value.month]);

    const today = todayDate();
    const cells = useMemo(() => buildCalendarCells(view.year, view.month), [view.year, view.month]);
    const selectedKey = toDayKey(value);

    const pick = (date: CalendarDate) => {
        onSelect({ ...date, day: clampDay(date.year, date.month, date.day) });
        onOpenChange(false);
    };

    return (
        <BottomSheet open={open} onOpenChange={onOpenChange} title="选择日期" maxHeightRatio={0.9}>
            <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-1.5">
                    <QuickChip label="今天" onClick={() => pick(today)} />
                    <QuickChip
                        label="昨天"
                        onClick={() => {
                            const date = new Date(today.year, today.month - 1, today.day - 1);
                            pick({
                                year: date.getFullYear(),
                                month: date.getMonth() + 1,
                                day: date.getDate(),
                            });
                        }}
                    />
                </div>

                <div className="flex items-center justify-between">
                    <button
                        type="button"
                        aria-label="上个月"
                        onClick={() => setView((prev) => shiftMonth(prev.year, prev.month, -1))}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-secondary active:bg-inset"
                    >
                        <AppIcon name={UI_ICONS.chevronLeft} size={16} />
                    </button>
                    <button
                        type="button"
                        onClick={() => setView({ year: today.year, month: today.month })}
                        className="rounded-md px-2 py-1 text-[13px] font-semibold text-text active:bg-inset"
                    >
                        {view.year} 年 {view.month} 月
                    </button>
                    <button
                        type="button"
                        aria-label="下个月"
                        onClick={() => setView((prev) => shiftMonth(prev.year, prev.month, 1))}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-secondary active:bg-inset"
                    >
                        <AppIcon name={UI_ICONS.chevronRight} size={16} />
                    </button>
                </div>

                <div className="grid grid-cols-7 text-center text-[11px] font-medium text-text-tertiary">
                    {WEEKDAY_LABELS.map((label) => (
                        <span key={label} className="py-1">
                            {label}
                        </span>
                    ))}
                </div>

                <div className="grid grid-cols-7 gap-0.5">
                    {cells.map((cell) => {
                        const key = toDayKey(cell);
                        const inMonth = cell.month === view.month;
                        const isToday = key === toDayKey(today);
                        const isSelected = key === selectedKey;
                        return (
                            <button
                                key={key}
                                type="button"
                                onClick={() => pick(cell)}
                                className={cn(
                                    'flex h-10 items-center justify-center rounded-sm text-[13px] tabular-nums',
                                    'active:bg-inset',
                                    !inMonth && 'text-text-disabled',
                                    inMonth && !isSelected && 'text-text-secondary',
                                    isSelected && 'bg-brand font-semibold text-white',
                                    isToday && !isSelected && 'ring-1 ring-brand/40',
                                )}
                            >
                                {cell.day}
                            </button>
                        );
                    })}
                </div>
            </div>
        </BottomSheet>
    );
}

function QuickChip({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="h-7 rounded-pill bg-inset px-3 text-[12px] font-medium text-text-secondary active:bg-muted"
        >
            {label}
        </button>
    );
}

export default DateSheet;
