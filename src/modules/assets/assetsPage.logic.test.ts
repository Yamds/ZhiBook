// 资产页纯逻辑测试：口径取值与折线点、差距条刻度、余额输入解析、账本可删判定。

import { describe, expect, it } from 'vitest';
import { MAX_AMOUNT_CENTS } from '../../core/domain/money';
import type { Account, AssetPoint, Book } from '../../core/ipc/types';
import {
    DEFAULT_TREND_KIND,
    TREND_KINDS,
    TREND_TONES,
    balanceInputValue,
    disparityScale,
    isBookDeletable,
    isNegativeBalance,
    parseBalanceCents,
    shouldSwitchBook,
    sumBalances,
    trendPoints,
    trendValue,
} from './assetsPage.logic';

function point(month: string, asset: number, liability: number): AssetPoint {
    return {
        month,
        totalAssetCents: asset,
        liabilityCents: liability,
        netCents: asset - liability,
    };
}

function account(id: string, balanceCents: number): Account {
    return {
        id,
        bookId: 'book_default',
        kind: 'asset',
        name: id,
        iconName: 'mdi:wallet-outline',
        color: 'theme',
        initialBalanceCents: 0,
        balanceCents,
        sortOrder: 0,
        createdAtMs: 0,
        updatedAtMs: 0,
    };
}

function book(id: string): Book {
    return { id, name: id, createdAtMs: 0, sortOrder: 0 };
}

describe('口径与折线点', () => {
    const trend = [point('2025-08', 100000, 20000), point('2025-09', 150000, 30000)];

    it('三个口径各取各的字段', () => {
        expect(trendValue(trend[1], 'net')).toBe(120000);
        expect(trendValue(trend[1], 'asset')).toBe(150000);
        expect(trendValue(trend[1], 'liability')).toBe(30000);
    });

    it('折线点标签是两位月份，key 是月份键', () => {
        expect(trendPoints(trend, 'net')).toEqual([
            { key: '2025-08', label: '08', value: 80000 },
            { key: '2025-09', label: '09', value: 120000 },
        ]);
    });

    it('非法月份键原样当标签，不抛异常', () => {
        expect(trendPoints([point('bad', 1, 0)], 'asset')).toEqual([
            { key: 'bad', label: 'bad', value: 1 },
        ]);
    });

    it('默认口径是净资产；三项都有标签与色调', () => {
        expect(DEFAULT_TREND_KIND).toBe('net');
        expect(TREND_KINDS.map((item) => item.labelKey)).toEqual([
            'assets.trendKind.net',
            'assets.trendKind.asset',
            'assets.trendKind.liability',
        ]);
        expect(TREND_TONES.liability).toBe('danger');
        expect(TREND_TONES.net).toBe('brand');
    });
});

describe('差距条刻度与余额判定', () => {
    it('共用刻度取两者较大值', () => {
        expect(disparityScale(500000, 120000)).toBe(500000);
        expect(disparityScale(120000, 500000)).toBe(500000);
        expect(disparityScale(0, 0)).toBe(0);
    });

    it('负余额被识别（用于视觉提示）', () => {
        expect(isNegativeBalance(-1)).toBe(true);
        expect(isNegativeBalance(0)).toBe(false);
        expect(isNegativeBalance(100)).toBe(false);
    });

    it('分组小计把余额加总', () => {
        expect(sumBalances([account('a', 1000), account('b', -400)])).toBe(600);
        expect(sumBalances([])).toBe(0);
    });
});

describe('初始余额输入（parseBalanceCents）', () => {
    it('留空算 0', () => {
        expect(parseBalanceCents('')).toBe(0);
        expect(parseBalanceCents('   ')).toBe(0);
    });

    it('元与分都能解析，允许千分位与负号', () => {
        expect(parseBalanceCents('12')).toBe(1200);
        expect(parseBalanceCents('12.5')).toBe(1250);
        expect(parseBalanceCents('12.34')).toBe(1234);
        expect(parseBalanceCents('1,234.5')).toBe(123450);
        expect(parseBalanceCents('-0.05')).toBe(-5);
        expect(parseBalanceCents('0')).toBe(0);
        expect(parseBalanceCents('.5')).toBe(50);
    });

    it('超过上限或格式非法返回 null', () => {
        expect(parseBalanceCents('999999999.99')).toBe(MAX_AMOUNT_CENTS);
        expect(parseBalanceCents('1000000000')).toBeNull();
        expect(parseBalanceCents('1.234')).toBeNull();
        expect(parseBalanceCents('12.')).toBe(1200);
        expect(parseBalanceCents('-')).toBeNull();
        expect(parseBalanceCents('abc')).toBeNull();
        expect(parseBalanceCents('1e3')).toBeNull();
    });

    it('回填文案：0 留空，其余不带货币符号', () => {
        expect(balanceInputValue(0)).toBe('');
        expect(balanceInputValue(123450)).toBe('1,234.50');
        expect(balanceInputValue(-5)).toBe('-0.05');
    });
});

describe('账本可删判定', () => {
    it('最后一个账本不可删', () => {
        const books = [book('a')];
        expect(isBookDeletable(books, 'a')).toBe(false);
        expect(isBookDeletable([book('a'), book('b')], 'a')).toBe(true);
    });

    it('不存在的账本 id 不可删', () => {
        expect(isBookDeletable([book('a'), book('b')], 'zzz')).toBe(false);
    });

    it('点当前账本不触发切换写操作', () => {
        expect(shouldSwitchBook('a', 'a')).toBe(false);
        expect(shouldSwitchBook('a', 'b')).toBe(true);
        expect(shouldSwitchBook(undefined, 'b')).toBe(true);
    });
});
