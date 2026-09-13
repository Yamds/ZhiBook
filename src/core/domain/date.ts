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

/** 年月选择器的年候选数量（含今年在内往前共 10 年）。 */
export const YEAR_SELECTOR_SPAN = 10;
/** 年份选择器向**未来**留的余量（BRD 3.3：允许记录未来日期，所以年份不能封在今年）。 */
export const FUTURE_YEAR_SPAN = 2;

/** 月份选择器候选值 1~12（明细页 / 账单页共用）。 */
export const MONTH_SELECTOR_VALUES: readonly number[] = Array.from(
    { length: 12 },
    (_, index) => index + 1,
);

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

/** 'YYYY-MM' → {year, month}；非法返回 null。 */
export function parseMonthKey(key: string): { year: number; month: number } | null {
    const match = /^(\d{4})-(\d{2})$/.exec(key);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) return null;
    return { year, month };
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

/**
 * 年选择器候选值：以今年 + `future` 年结尾、往前 `span` 年。
 *
 * BRD 3.3：**允许选择未来日期**（默认今天，不做未来限制；统计里未来月份允许为空），
 * 所以年份上限是「今年 + `FUTURE_YEAR_SPAN`」，不是今年。
 */
export function yearOptions(
    now?: Date,
    span = YEAR_SELECTOR_SPAN,
    future = FUTURE_YEAR_SPAN,
): number[] {
    const current = todayDate(now).year;
    const years = Math.max(1, Math.round(span));
    const ahead = Math.max(0, Math.round(future));
    return yearRange(current - years + 1, current + ahead);
}

/** 日期键按天偏移（跨月 / 跨年安全）；非法输入原样返回。 */
export function shiftDayKey(key: string, delta: number): string {
    const date = parseDayKey(key);
    if (!date) return key;
    const shifted = new Date(date.year, date.month - 1, date.day + Math.trunc(delta));
    return toDayKey({
        year: shifted.getFullYear(),
        month: shifted.getMonth() + 1,
        day: shifted.getDate(),
    });
}

/** 时间戳（Unix 毫秒）→ 本地日历日。 */
export function dateFromTimestamp(ms: number): CalendarDate {
    return todayParts(new Date(ms));
}

/** 时间戳 → 本地 `HH:mm`（BRD 3.3：明细行内展示时间）。 */
export function formatClockTime(ms: number): string {
    const date = new Date(ms);
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** 时间戳 → `2025年9月8日 星期一`（BRD 3.3：账单详情用完整日期）。 */
export function formatDateLabel(ms: number): string {
    const date = dateFromTimestamp(ms);
    return `${date.year}年${date.month}月${date.day}日 ${weekdayLabel(date)}`;
}

/** 日期键 → `09.08`（分组头 / 紧凑展示用）。 */
export function formatShortDay(key: string): string {
    const date = parseDayKey(key);
    if (!date) return key;
    return `${pad2(date.month)}.${pad2(date.day)}`;
}
