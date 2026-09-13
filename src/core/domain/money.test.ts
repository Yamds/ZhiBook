import { describe, expect, it } from 'vitest';
import {
    MAX_AMOUNT_CENTS,
    formatCents,
    formatCompactAmount,
    formatMoney,
    formatSignedBalance,
    formatSignedMoney,
    isSubmittableAmount,
    parseAmountExpression,
    tryAppendKeypadKey,
    type KeypadKey,
} from './money';

describe('紧凑金额（formatCompactAmount）', () => {
    it('小于 100 元保留小数，避免被取整成 0', () => {
        expect(formatCompactAmount(0)).toBe('0');
        expect(formatCompactAmount(40)).toBe('0.4');
        expect(formatCompactAmount(5)).toBe('0.05');
        expect(formatCompactAmount(550)).toBe('5.5');
        expect(formatCompactAmount(1200)).toBe('12');
        expect(formatCompactAmount(9999)).toBe('99.99');
    });

    it('100 元 ~ 1 万元取整到元并带千分位', () => {
        expect(formatCompactAmount(10000)).toBe('100');
        expect(formatCompactAmount(123450)).toBe('1,235');
        expect(formatCompactAmount(999949)).toBe('9,999');
    });

    it('1 万元起缩写为万，1 亿起缩写为亿', () => {
        expect(formatCompactAmount(1000000)).toBe('1万');
        expect(formatCompactAmount(1200000)).toBe('1.2万');
        expect(formatCompactAmount(12345678)).toBe('12.3万');
        expect(formatCompactAmount(10_000_000)).toBe('10万');
        expect(formatCompactAmount(1_000_000_000)).toBe('1,000万');
        // 9999.5 万 = 99,995,000 元：再进位就会变成 `10,000万`，所以从里改走亿
        expect(formatCompactAmount(99_994_000_00)).toBe('9,999万');
        expect(formatCompactAmount(99_995_000_00)).toBe('1亿');
        expect(formatCompactAmount(MAX_AMOUNT_CENTS)).toBe('10亿');
    });

    it('负数按量级缩写（符号由调用方给）', () => {
        expect(formatCompactAmount(-550)).toBe('5.5');
        expect(formatCompactAmount(-1200000)).toBe('1.2万');
    });
});

describe('结余金额（formatSignedBalance）', () => {
    it('正负都有符号，零不带符号', () => {
        expect(formatSignedBalance(-89600)).toBe('- ¥ 896.00');
        expect(formatSignedBalance(100000)).toBe('+ ¥ 1,000.00');
        expect(formatSignedBalance(0)).toBe('¥ 0.00');
    });
});

describe('金额格式化', () => {
    it('固定两位小数 + 千分位', () => {
        expect(formatCents(0)).toBe('0.00');
        expect(formatCents(5)).toBe('0.05');
        expect(formatCents(34450)).toBe('344.50');
        expect(formatCents(123456789)).toBe('1,234,567.89');
        expect(formatCents(-34450)).toBe('-344.50');
    });

    it('货币符号与空格', () => {
        expect(formatMoney(34450)).toBe('¥ 344.50');
        expect(formatMoney(0)).toBe('¥ 0.00');
        expect(formatMoney(-89600)).toBe('- ¥ 896.00');
    });

    it('带收支语义：支出负号、收入正号', () => {
        expect(formatSignedMoney(34450, 'expense')).toBe('- ¥ 344.50');
        expect(formatSignedMoney(100000, 'income')).toBe('+ ¥ 1,000.00');
        expect(formatSignedMoney(-89600)).toBe('- ¥ 896.00');
    });

    it('可提交金额必须为正且不超过上限', () => {
        expect(isSubmittableAmount(1)).toBe(true);
        expect(isSubmittableAmount(MAX_AMOUNT_CENTS)).toBe(true);
        expect(isSubmittableAmount(0)).toBe(false);
        expect(isSubmittableAmount(-1)).toBe(false);
        expect(isSubmittableAmount(MAX_AMOUNT_CENTS + 1)).toBe(false);
    });
});

describe('键盘表达式求值', () => {
    it('纯数字', () => {
        expect(parseAmountExpression('344.5')).toEqual({ ok: true, cents: 34450 });
        expect(parseAmountExpression('0.05')).toEqual({ ok: true, cents: 5 });
    });

    it('顺序求值（加减不区分优先级）', () => {
        expect(parseAmountExpression('12+3.5')).toEqual({ ok: true, cents: 1550 });
        expect(parseAmountExpression('10-3+2')).toEqual({ ok: true, cents: 900 });
        expect(parseAmountExpression('100-150')).toEqual({ ok: true, cents: -5000 });
    });

    it('尾随运算符按「还没输入下一个数」处理', () => {
        expect(parseAmountExpression('12+')).toEqual({ ok: true, cents: 1200 });
    });

    it('空 / 非法 / 超限', () => {
        expect(parseAmountExpression('')).toEqual({ ok: false, reason: 'empty' });
        expect(parseAmountExpression('   ')).toEqual({ ok: false, reason: 'empty' });
        expect(parseAmountExpression('1..2')).toEqual({ ok: false, reason: 'invalid' });
        expect(parseAmountExpression('12a')).toEqual({ ok: false, reason: 'invalid' });
        expect(parseAmountExpression('99999999999')).toEqual({ ok: false, reason: 'overflow' });
    });
});

describe('键盘按键规则', () => {
    const press = (expression: string, keys: readonly KeypadKey[]) =>
        keys.reduce<string | null>(
            (acc, key) => (acc === null ? null : tryAppendKeypadKey(acc, key)),
            expression,
        );

    it('连续输入数字', () => {
        expect(press('', ['3', '4', '4'])).toBe('344');
    });

    it('前导 0 被替换，不出现 007', () => {
        expect(tryAppendKeypadKey('0', '7')).toBe('7');
        expect(tryAppendKeypadKey('12+0', '7')).toBe('12+7');
    });

    it('小数点只能出现一次，空片段补 0', () => {
        expect(tryAppendKeypadKey('', '.')).toBe('0.');
        expect(tryAppendKeypadKey('12+', '.')).toBe('12+0.');
        expect(tryAppendKeypadKey('12.5', '.')).toBeNull();
    });

    it('小数最多两位、整数最多九位', () => {
        expect(tryAppendKeypadKey('12.34', '5')).toBeNull();
        expect(tryAppendKeypadKey('123456789', '0')).toBeNull();
        expect(tryAppendKeypadKey('123456789.1', '2')).toBe('123456789.12');
    });

    it('运算符不能打头，连按等于替换', () => {
        expect(tryAppendKeypadKey('', '+')).toBeNull();
        expect(tryAppendKeypadKey('12', '+')).toBe('12+');
        expect(tryAppendKeypadKey('12+', '-')).toBe('12-');
    });

    it('退格删最后一位，空表达式不响应', () => {
        expect(tryAppendKeypadKey('12+3', 'backspace')).toBe('12+');
        expect(tryAppendKeypadKey('', 'backspace')).toBeNull();
    });

    it('完整连打：12 + 3.5 → 1550 分', () => {
        const expression = press('', ['1', '2', '+', '3', '.', '5']);
        expect(expression).toBe('12+3.5');
        expect(parseAmountExpression(expression ?? '')).toEqual({ ok: true, cents: 1550 });
    });
});
