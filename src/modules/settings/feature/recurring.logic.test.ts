import { describe, expect, it } from 'vitest';

import type { RecurringRule } from '../../../core/ipc/types';
import { MAX_AMOUNT_CENTS } from '../../../core/domain/money';
import {
    amountTextFromCents,
    dueDays,
    dueOccurrences,
    dueThroughDay,
    firstDueDay,
    MAX_CATCH_UP_DAYS,
    occurredAtMsForDay,
    parseAmountText,
} from './recurring.logic';

function rule(overrides: Partial<RecurringRule> = {}): RecurringRule {
    return {
        id: 'rec_1',
        bookId: 'book_default',
        kind: 'expense',
        amountCents: 100,
        note: '',
        categoryId: 'expense_food',
        accountId: null,
        enabled: true,
        startDay: '2025-09-10',
        lastRunDay: null,
        createdAtMs: 0,
        updatedAtMs: 0,
        ...overrides,
    };
}

describe('固定收支 05:00 边界', () => {
    it('occurredAtMsForDay = 当天本地 05:00', () => {
        const value = new Date(occurredAtMsForDay('2025-09-10'));
        expect(value.getFullYear()).toBe(2025);
        expect(value.getMonth()).toBe(8);
        expect(value.getDate()).toBe(10);
        expect(value.getHours()).toBe(5);
        expect(value.getMinutes()).toBe(0);
    });

    it('firstDueDay：05:00 前创建算当天，05:00 及以后算次日', () => {
        expect(firstDueDay(new Date(2025, 8, 10, 3, 0))).toBe('2025-09-10');
        expect(firstDueDay(new Date(2025, 8, 10, 4, 59))).toBe('2025-09-10');
        expect(firstDueDay(new Date(2025, 8, 10, 5, 0))).toBe('2025-09-11');
        expect(firstDueDay(new Date(2025, 8, 10, 23, 30))).toBe('2025-09-11');
    });

    it('dueThroughDay：05:00 前只能补到昨天', () => {
        expect(dueThroughDay(new Date(2025, 8, 10, 3, 0))).toBe('2025-09-09');
        expect(dueThroughDay(new Date(2025, 8, 10, 5, 0))).toBe('2025-09-10');
    });
});

describe('固定收支补账区间', () => {
    it('从 startDay 补到今天（含），lastRunDay 之后才补', () => {
        expect(dueDays(rule(), new Date(2025, 8, 12, 10, 0))).toEqual([
            '2025-09-10',
            '2025-09-11',
            '2025-09-12',
        ]);
        expect(dueDays(rule({ lastRunDay: '2025-09-11' }), new Date(2025, 8, 12, 10, 0))).toEqual([
            '2025-09-12',
        ]);
    });

    it('05:00 前不补当天；停用 / 未到生效日不补', () => {
        expect(dueDays(rule({ lastRunDay: '2025-09-11' }), new Date(2025, 8, 12, 3, 0))).toEqual([]);
        expect(dueDays(rule({ enabled: false }), new Date(2025, 8, 12, 10, 0))).toEqual([]);
        expect(dueDays(rule({ startDay: '2025-09-20' }), new Date(2025, 8, 12, 10, 0))).toEqual([]);
    });

    it('极端积压时最多补 MAX_CATCH_UP_DAYS 天，保留最近的一段', () => {
        const days = dueDays(
            rule({ startDay: '2000-01-01' }),
            new Date(2025, 8, 12, 10, 0),
        );
        expect(days.length).toBe(MAX_CATCH_UP_DAYS);
        expect(days.at(-1)).toBe('2025-09-12');
        expect(days[0]).toBe('2015-09-06');
    });

    it('dueOccurrences 带上每条规则的每一天与 05:00 时间戳', () => {
        const occurrences = dueOccurrences(
            [rule({ lastRunDay: '2025-09-11' })],
            new Date(2025, 8, 12, 10, 0),
        );
        expect(occurrences).toHaveLength(1);
        expect(occurrences[0]).toEqual({
            ruleId: 'rec_1',
            day: '2025-09-12',
            occurredAtMs: occurredAtMsForDay('2025-09-12'),
        });
    });
});

describe('固定收支金额输入', () => {
    it('解析元 → 分', () => {
        expect(parseAmountText('12')).toBe(1200);
        expect(parseAmountText('12.5')).toBe(1250);
        expect(parseAmountText('1,234.50')).toBe(123450);
        expect(parseAmountText('  ¥ 8.00 ')).toBe(800);
    });

    it('非法 / 超限 / 非正数返回 null', () => {
        expect(parseAmountText('')).toBeNull();
        expect(parseAmountText('0')).toBeNull();
        expect(parseAmountText('-1')).toBeNull();
        expect(parseAmountText('12.345')).toBeNull();
        expect(parseAmountText('abc')).toBeNull();
        expect(parseAmountText(String(MAX_AMOUNT_CENTS / 100 + 1))).toBeNull();
    });

    it('回填文本不带多余尾零', () => {
        expect(amountTextFromCents(1234)).toBe('12.34');
        expect(amountTextFromCents(1200)).toBe('12');
        expect(amountTextFromCents(0)).toBe('');
    });
});
