import { describe, expect, it } from 'vitest';
import {
    clampDay,
    daysInMonth,
    daysOfMonth,
    formatClockTime,
    formatDateLabel,
    formatShortDay,
    isLeapYear,
    MONTH_SELECTOR_VALUES,
    parseDayKey,
    parseMonthKey,
    shiftDayKey,
    shiftMonth,
    toDayKey,
    toMonthKey,
    todayKey,
    weekdayIndex,
    weekdayLabel,
    yearOptions,
    yearRange,
} from './date';

describe('闰年与月天数', () => {
    it('闰年判定（含 100/400 规则）', () => {
        expect(isLeapYear(2024)).toBe(true);
        expect(isLeapYear(2025)).toBe(false);
        expect(isLeapYear(2000)).toBe(true);
        expect(isLeapYear(2100)).toBe(false);
    });

    it('2 月天数', () => {
        expect(daysInMonth(2024, 2)).toBe(29);
        expect(daysInMonth(2025, 2)).toBe(28);
    });

    it('大小月', () => {
        expect(daysInMonth(2025, 1)).toBe(31);
        expect(daysInMonth(2025, 4)).toBe(30);
        expect(daysInMonth(2025, 12)).toBe(31);
        expect(daysInMonth(2025, 13)).toBe(0);
    });

    it('daysOfMonth 生成完整日期列表', () => {
        expect(daysOfMonth(2024, 2)).toHaveLength(29);
        expect(daysOfMonth(2025, 2)).toHaveLength(28);
    });
});

describe('day key', () => {
    it('往返一致', () => {
        expect(toDayKey({ year: 2025, month: 9, day: 8 })).toBe('2025-09-08');
        expect(parseDayKey('2025-09-08')).toEqual({ year: 2025, month: 9, day: 8 });
    });

    it('非法日期返回 null', () => {
        expect(parseDayKey('2025-02-30')).toBeNull();
        expect(parseDayKey('2025-2-3')).toBeNull();
        expect(parseDayKey('hello')).toBeNull();
    });

    it('month key 补零', () => {
        expect(toMonthKey(2025, 9)).toBe('2025-09');
    });

    it('clampDay 把日夹到合法范围', () => {
        expect(clampDay(2025, 2, 31)).toBe(28);
        expect(clampDay(2024, 2, 31)).toBe(29);
        expect(clampDay(2025, 4, 0)).toBe(1);
    });
});

describe('月份偏移', () => {
    it('跨年向前', () => {
        expect(shiftMonth(2025, 12, 1)).toEqual({ year: 2026, month: 1 });
    });

    it('跨年向后', () => {
        expect(shiftMonth(2025, 1, -1)).toEqual({ year: 2024, month: 12 });
    });

    it('跨多年', () => {
        expect(shiftMonth(2025, 6, -14)).toEqual({ year: 2024, month: 4 });
        expect(shiftMonth(2025, 6, 19)).toEqual({ year: 2027, month: 1 });
    });
});

describe('星期', () => {
    it('2026-09-13 是星期日（设备截图 09-12 为星期六）', () => {
        expect(weekdayIndex({ year: 2026, month: 9, day: 12 })).toBe(6);
        expect(weekdayIndex({ year: 2026, month: 9, day: 13 })).toBe(0);
        expect(weekdayLabel({ year: 2026, month: 9, day: 13 })).toBe('星期日');
        expect(weekdayLabel({ year: 2026, month: 9, day: 12 })).toBe('星期六');
    });
});

describe('其它工具', () => {
    it('todayKey 是合法的 day key', () => {
        expect(parseDayKey(todayKey())).not.toBeNull();
    });

    it('yearRange 含端点且顺序升序', () => {
        expect(yearRange(2023, 2026)).toEqual([2023, 2024, 2025, 2026]);
        expect(yearRange(2026, 2024)).toEqual([2024, 2025, 2026]);
    });

    it('yearOptions 以「今年 + 未来余量」结尾（允许记未来年份）', () => {
        const now = new Date(2026, 8, 13);
        const years = yearOptions(now, 10);
        expect(years).toHaveLength(12);
        expect(years.at(-1)).toBe(2028);
        expect(years[0]).toBe(2017);
        // 显式不要未来余量时回到「以今年结尾」
        expect(yearOptions(now, 10, 0).at(-1)).toBe(2026);
    });

    it('shiftDayKey 处理跨月 / 跨年 / 闰日', () => {
        expect(shiftDayKey('2025-09-08', -7)).toBe('2025-09-01');
        expect(shiftDayKey('2025-09-01', -1)).toBe('2025-08-31');
        expect(shiftDayKey('2025-01-01', -1)).toBe('2024-12-31');
        // 2024-03-01 往前一天是闰日 2024-02-29
        expect(shiftDayKey('2024-03-01', -1)).toBe('2024-02-29');
        // 非法输入原样返回，不抛异常
        expect(shiftDayKey('bad', -1)).toBe('bad');
    });

    it('时间与日期文案用本地时区', () => {
        const ms = new Date(2025, 8, 8, 14, 32, 5).getTime();
        expect(formatClockTime(ms)).toBe('14:32');
        expect(formatDateLabel(ms)).toBe('2025年9月8日 星期一');
        expect(formatShortDay('2025-09-08')).toBe('09.08');
        expect(formatShortDay('bad')).toBe('bad');
    });

    it('parseMonthKey 校验月份范围', () => {
        expect(parseMonthKey('2025-09')).toEqual({ year: 2025, month: 9 });
        expect(parseMonthKey('2025-13')).toBeNull();
        expect(parseMonthKey('2025-1')).toBeNull();
        expect(parseMonthKey('bad')).toBeNull();
    });

    it('MONTH_SELECTOR_VALUES 是 1~12', () => {
        expect(MONTH_SELECTOR_VALUES).toHaveLength(12);
        expect(MONTH_SELECTOR_VALUES[0]).toBe(1);
        expect(MONTH_SELECTOR_VALUES[11]).toBe(12);
    });
});
