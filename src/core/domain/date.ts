// 日期工具（唯一入口）。
//
// 账单的「日」是本地日历日，落库用 `YYYY-MM-DD` 字符串（day key），
// 便于按月/按日聚合与字符串比较；月份用 `YYYY-MM`。
//
// 这里只做纯计算，不碰时区转换：账单的 day 是用户选中的「日历上的那一天」。

export interface CalendarDate {
    /** 4 位年份 */
    readonly year: number;
    /** 1-12 */
    readonly month: number;
    /** 1-31（按月份校验） */
    readonly day: number;
}

export const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'] as const;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export function isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** 某年某月的天数（month: 1-12）。 */
export function daysInMonth(year: number, month: number): number {
    if (month < 1 || month > 12) return 0;
    if (month === 2) return isLeapYear(year) ? 29 : 28;
    return DAYS_IN_MONTH[month - 1] ?? 30;
}

export function isValidDate({ year, month, day }: CalendarDate): boolean {
    if (!Number.isInteger(year) || year < 1900 || year > 9999) return false;
    if (!Number.isInteger(month) || month < 1 || month > 12) return false;
    if (!Number.isInteger(day) || day < 1) return false;
    return day <= daysInMonth(year, month);
}

/** 把「日」夹到该月合法范围（2 月 31 日 → 2 月 28/29 日）。 */
export function clampDay(year: number, month: number, day: number): number {
    const max = daysInMonth(year, month);
    if (max === 0) return 1;
    return Math.min(Math.max(1, Math.round(day)), max);
}

function pad2(value: number): string {
    return String(value).padStart(2, '0');
}

/** CalendarDate → 'YYYY-MM-DD' */
export function toDayKey({ year, month, day }: CalendarDate): string {
    return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
}

/** 'YYYY-MM-DD' → CalendarDate；非法输入返回 null。 */
export function parseDayKey(key: string): CalendarDate | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (!match) return null;
    const date: CalendarDate = {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
    };
    return isValidDate(date) ? date : null;
}

/** 'YYYY-MM' */
export function toMonthKey(year: number, month: number): string {
    return `${String(year).padStart(4, '0')}-${pad2(month)}`;
}

/** 月份偏移，自动处理跨年（delta 可正可负）。 */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
    const zeroBased = year * 12 + (month - 1) + delta;
    const nextYear = Math.floor(zeroBased / 12);
    const nextMonth = (zeroBased % 12 + 12) % 12 + 1;
    return { year: nextYear, month: nextMonth };
}

function todayParts(now = new Date()): CalendarDate {
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

export function todayDate(now?: Date): CalendarDate {
    return todayParts(now);
}

export function todayKey(now?: Date): string {
    return toDayKey(todayParts(now));
}

/** 0=周日 … 6=周六（本地日历）。 */
export function weekdayIndex({ year, month, day }: CalendarDate): number {
    return new Date(year, month - 1, day).getDay();
}

/** 星期文案：星期一 / 星期日。 */
export function weekdayLabel(date: CalendarDate): string {
    return `星期${WEEKDAY_LABELS[weekdayIndex(date)] ?? ''}`;
}

/** 该月的完整日期列表（1..n）。 */
export function daysOfMonth(year: number, month: number): number[] {
    const total = daysInMonth(year, month);
    return Array.from({ length: total }, (_, index) => index + 1);
}

/** 年份区间（含端点），用于年选择器的候选值。 */
export function yearRange(from: number, to: number): number[] {
    const start = Math.min(from, to);
    const end = Math.max(from, to);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}
