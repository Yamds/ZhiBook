// 账单页纯逻辑测试：年 / 月两种视图的口径换算、概览格、趋势点、占比颜色、排行文案。

import { describe, expect, it } from 'vitest';
import type {
    CategoryShare,
    CategoryShareSet,
    KindMonthStats,
    MonthPoint,
    MonthStats,
    ShareBreakdown,
    TransactionRank,
    YearSummary,
} from '../../core/ipc/types';
import {
    categorySubtitle,
    chartColor,
    colorResolver,
    formatDayHint,
    formatKindTotal,
    formatMonthHint,
    formatShare,
    kindCopy,
    monthCountForKind,
    monthLabel,
    monthValueForKind,
    overviewCells,
    rankRatio,
    shareColorMap,
    shareSlices,
    sharesForKind,
    showsBreakdownCards,
    statsForKind,
    statsKindLabel,
    transactionRankRatio,
    transactionRankSubtitle,
    trendPoints,
    yearMaxMonth,
    yearMonthlyAverageCents,
    yearOverviewCells,
    yearTotalCents,
    yearTotalCount,
    yearTrendPoints,
} from './billsPage.logic';

const BRAND = '#ff6b3d';
const SURFACE = '#ffffff';
/** 主题色板样例（9 色相 + 4 灰阶），真实值由 `useThemePalette` 从 CSS 读出。 */
const PALETTE = [
    '#e85b57', '#f2762f', '#e8a72e', '#4fb477', '#14a3a0',
    '#3d96ed', '#5b6ee1', '#a280e8', '#f58fb6',
    '#d9d9d9', '#b3b3b3', '#808080', '#4d4d4d',
];

function kindStats(partial: Partial<KindMonthStats> = {}): KindMonthStats {
    return {
        totalCents: 0,
        count: 0,
        maxDayCents: 0,
        maxDay: null,
        dailyAverageCents: 0,
        daily: [],
        ...partial,
    };
}

function monthStats(partial: Partial<MonthStats> = {}): MonthStats {
    return {
        month: '2025-09',
        days: 30,
        expense: kindStats({
            totalCents: 89600,
            count: 2,
            maxDayCents: 75000,
            maxDay: '2025-09-08',
            dailyAverageCents: 2987,
            daily: [0, 0, 0, 0, 0, 0, 0, 75000, 0, 0, 14600],
        }),
        income: kindStats({ totalCents: 100000, count: 1, maxDayCents: 100000, maxDay: '2025-09-01', dailyAverageCents: 3333 }),
        balance: kindStats({ totalCents: 10400, count: 3, maxDayCents: 75000, maxDay: '2025-09-08', dailyAverageCents: 347 }),
        ...partial,
    };
}

function monthPoint(month: string, partial: Partial<MonthPoint> = {}): MonthPoint {
    return {
        month,
        expenseCents: 0,
        incomeCents: 0,
        balanceCents: 0,
        expenseCount: 0,
        incomeCount: 0,
        ...partial,
    };
}

function yearSummary(months: MonthPoint[] = []): YearSummary {
    const filled: MonthPoint[] = Array.from({ length: 12 }, (_, index) => {
        const key = `2025-${String(index + 1).padStart(2, '0')}`;
        return months.find((point) => point.month === key) ?? monthPoint(key);
    });
    const expense = filled.reduce((sum, point) => sum + point.expenseCents, 0);
    const income = filled.reduce((sum, point) => sum + point.incomeCents, 0);
    return {
        year: 2025,
        expenseCents: expense,
        incomeCents: income,
        balanceCents: income - expense,
        months: filled,
    };
}

function share(partial: Partial<CategoryShare> = {}): CategoryShare {
    return {
        categoryId: 'expense_food',
        name: '餐饮',
        iconName: 'mdi:noodles',
        color: 'theme',
        amountCents: 75000,
        absAmountCents: 75000,
        count: 1,
        share: 0.7,
        hidden: false,
        merged: false,
        ...partial,
    };
}

function shareSet(items: CategoryShare[], all?: CategoryShare[]): CategoryShareSet {
    return {
        totalCents: items.reduce((sum, item) => sum + item.absAmountCents, 0),
        count: items.reduce((sum, item) => sum + item.count, 0),
        items,
        all: all ?? items,
    };
}

function breakdown(): ShareBreakdown {
    return {
        expense: shareSet([
            share(),
            share({ categoryId: 'expense_traffic', name: '交通', absAmountCents: 14600, share: 0.3 }),
        ]),
        income: shareSet([share({ categoryId: 'income_salary', name: '工资', absAmountCents: 100000, share: 1 })]),
        balance: shareSet([
            share({ categoryId: 'income_salary', name: '工资', amountCents: 100000, absAmountCents: 100000, share: 0.57 }),
            share({ categoryId: 'expense_food', name: '餐饮', amountCents: -75000, absAmountCents: 75000, share: 0.43 }),
        ]),
    };
}

function rank(partial: Partial<TransactionRank> = {}): TransactionRank {
    return {
        id: 'tx_1',
        kind: 'expense',
        categoryId: 'expense_traffic',
        categoryName: '交通',
        categoryIconName: 'mdi:bus',
        categoryColor: 'theme',
        amountCents: 14600,
        signedCents: -14600,
        day: '2025-09-09',
        occurredAtMs: 0,
        note: '汉口-杭州D45',
        ...partial,
    };
}

describe('口径取值', () => {
    it('statsForKind / sharesForKind 取对应口径', () => {
        const stats = monthStats();
        expect(statsForKind(stats, 'expense').totalCents).toBe(89600);
        expect(statsForKind(stats, 'income').totalCents).toBe(100000);
        expect(statsForKind(stats, 'balance').totalCents).toBe(10400);

        const sets = breakdown();
        expect(sharesForKind(sets, 'expense')).toBe(sets.expense);
        expect(sharesForKind(sets, 'income')).toBe(sets.income);
        expect(sharesForKind(sets, 'balance')).toBe(sets.balance);
    });

    it('月份序列按口径取金额与笔数（结余 = 收入 + 支出）', () => {
        const point = monthPoint('2025-03', {
            expenseCents: 300,
            incomeCents: 500,
            balanceCents: 200,
            expenseCount: 2,
            incomeCount: 1,
        });
        expect(monthValueForKind(point, 'expense')).toBe(300);
        expect(monthValueForKind(point, 'income')).toBe(500);
        expect(monthValueForKind(point, 'balance')).toBe(200);
        expect(monthCountForKind(point, 'expense')).toBe(2);
        expect(monthCountForKind(point, 'income')).toBe(1);
        expect(monthCountForKind(point, 'balance')).toBe(3);
    });

    it('年度总额与累计笔数', () => {
        const summary = yearSummary([
            monthPoint('2025-03', { expenseCents: 300, expenseCount: 2 }),
            monthPoint('2025-07', { expenseCents: 700, expenseCount: 3, incomeCents: 100, incomeCount: 1 }),
        ]);
        expect(yearTotalCents(summary, 'expense')).toBe(1000);
        expect(yearTotalCents(summary, 'income')).toBe(100);
        expect(yearTotalCents(summary, 'balance')).toBe(-900);
        expect(yearTotalCount(summary, 'expense')).toBe(5);
        expect(yearTotalCount(summary, 'balance')).toBe(6);
    });

    it('结余口径不展示占比 / 排行卡片', () => {
        expect(showsBreakdownCards('expense')).toBe(true);
        expect(showsBreakdownCards('income')).toBe(true);
        expect(showsBreakdownCards('balance')).toBe(false);
    });

    it('口径文案：粒度为日 / 月时标签不同', () => {
        expect(statsKindLabel('balance')).toBe('结余');

        const day = kindCopy('expense', 'day');
        expect(day.balanceTitle).toBe('本月结余');
        expect(day.maxLabel).toBe('本月单日最高支出');
        expect(day.averageLabel).toBe('本月平均每日支出');
        expect(day.countLabel).toBe('本月累计支出笔数');
        expect(day.categorySubtitle(75000, 1)).toBe('本月共支出 ¥ 750.00，消费 1 笔');

        const month = kindCopy('expense', 'month');
        expect(month.balanceTitle).toBe('本年结余');
        expect(month.maxLabel).toBe('本年单月最高支出');
        expect(month.averageLabel).toBe('本年平均每月支出');
        expect(month.countLabel).toBe('本年累计支出笔数');
        expect(month.trendTitle).toBe('支出月度趋势');
        expect(month.categorySubtitle(75000, 1)).toBe('本年共支出 ¥ 750.00，消费 1 笔');

        expect(kindCopy('income', 'month').categorySubtitle(100000, 2)).toBe('本年共收入 ¥ 1,000.00，进账 2 笔');
        expect(kindCopy('balance', 'day').countLabel).toBe('本月累计笔数');
        expect(kindCopy('balance', 'day').categorySubtitle(-75000, 3)).toBe('本月结余 - ¥ 750.00，共 3 笔');
    });

    it('金额：支出口径带负号、收入带正号、结余看数值本身', () => {
        expect(formatKindTotal(75000, 'expense')).toBe('- ¥ 750.00');
        expect(formatKindTotal(100000, 'income')).toBe('+ ¥ 1,000.00');
        expect(formatKindTotal(-75000, 'balance')).toBe('- ¥ 750.00');
    });
});

describe('概览', () => {
    it('月视图：单日最高带日期、日均、笔数', () => {
        const cells = overviewCells(monthStats(), 'expense');
        expect(cells).toHaveLength(3);
        expect(cells[0]?.label).toBe('本月单日最高支出');
        expect(cells[0]?.value).toBe('- ¥ 750.00');
        expect(cells[0]?.hint).toBe('09.08');
        expect(cells[1]?.value).toBe('- ¥ 29.87');
        expect(cells[2]?.value).toBe('2 笔');
    });

    it('月视图空月：金额给占位符', () => {
        const empty = monthStats({ expense: kindStats(), balance: kindStats() });
        const cells = overviewCells(empty, 'expense');
        expect(cells[0]?.value).toBe('—');
        expect(cells[1]?.value).toBe('—');
        expect(cells[2]?.value).toBe('0 笔');
    });

    it('年视图：单月最高带月份、平均每月 = 总额 ÷ 12、累计笔数', () => {
        const summary = yearSummary([
            monthPoint('2025-03', { expenseCents: 120000, expenseCount: 2 }),
            monthPoint('2025-07', { expenseCents: 240000, expenseCount: 4 }),
        ]);
        const cells = yearOverviewCells(summary, 'expense');
        expect(cells[0]?.label).toBe('本年单月最高支出');
        expect(cells[0]?.value).toBe('- ¥ 2,400.00');
        expect(cells[0]?.hint).toBe('7月');
        // 360000 / 12 = 30000
        expect(cells[1]?.value).toBe('- ¥ 300.00');
        expect(cells[2]?.value).toBe('6 笔');
    });

    it('年视图空年：金额给占位符', () => {
        const cells = yearOverviewCells(yearSummary(), 'income');
        expect(cells[0]?.value).toBe('—');
        expect(cells[1]?.value).toBe('—');
        expect(cells[2]?.value).toBe('0 笔');
        expect(yearMaxMonth(yearSummary(), 'income')).toEqual({ month: null, cents: 0 });
    });

    it('年视图：结余口径的单月最高按绝对值选月，保留符号', () => {
        const summary = yearSummary([
            monthPoint('2025-02', { incomeCents: 500000, balanceCents: 500000, incomeCount: 1 }),
            monthPoint('2025-08', { expenseCents: 900000, balanceCents: -900000, expenseCount: 1 }),
        ]);
        expect(yearMaxMonth(summary, 'balance')).toEqual({ month: '2025-08', cents: -900000 });
        // 平均每月：(-400000) / 12 = -33333.3 → 四舍五入 -33333
        expect(yearMonthlyAverageCents(summary, 'balance')).toBe(-33333);
    });
});

describe('趋势点', () => {
    it('月视图：横轴是当月天数，key 是 day key', () => {
        const points = trendPoints(monthStats(), 'expense');
        expect(points).toHaveLength(11);
        expect(points[0]).toEqual({ key: '2025-09-01', label: '01', value: 0 });
        expect(points[7]).toEqual({ key: '2025-09-08', label: '08', value: 75000 });
    });

    it('年视图：12 个月，标签 01~12', () => {
        const summary = yearSummary([monthPoint('2025-12', { incomeCents: 100 })]);
        const points = yearTrendPoints(summary, 'income');
        expect(points).toHaveLength(12);
        expect(points[0]).toEqual({ key: '2025-01', label: '01', value: 0 });
        expect(points[11]).toEqual({ key: '2025-12', label: '12', value: 100 });
        expect(yearTrendPoints(undefined, 'income')).toEqual([]);
    });
});

describe('占比与颜色', () => {
    it('formatShare / 日期月份标签', () => {
        expect(formatShare(0.837)).toBe('83.7%');
        expect(formatShare(Number.NaN)).toBe('0.0%');
        expect(formatDayHint('2025-09-08')).toBe('09.08');
        expect(formatDayHint('bad')).toBe('bad');
        expect(formatMonthHint('2025-03')).toBe('3月');
        expect(formatMonthHint('bad')).toBe('bad');
        expect(monthLabel('2025-09')).toBe('2025年9月');
        expect(monthLabel('bad')).toBe('bad');
    });

    it('theme 颜色走主题色板，显式颜色用自己的色', () => {
        expect(chartColor('theme', 0, BRAND, SURFACE, PALETTE)).toBe(PALETTE[0]);
        expect(chartColor('theme', 14, BRAND, SURFACE, PALETTE)).toBe(PALETTE[1]);
        expect(chartColor('#123456', 3, BRAND, SURFACE, PALETTE)).toBe('#123456');
        // 色板为空（探针还没就绪）时退回品牌色
        expect(chartColor('theme', 0, BRAND, SURFACE, [])).toBe(BRAND);
    });

    it('shareColorMap：Top10 与环形图索引一致，合并桶用品牌色兑底', () => {
        const set = shareSet(
            [share(), share({ categoryId: '__other__', name: '其它', merged: true, color: 'theme' })],
            [share({ categoryId: 'expense_food' }), share({ categoryId: 'expense_traffic', color: '#123456' })],
        );
        const map = shareColorMap(set, BRAND, SURFACE, PALETTE);
        expect(map.get('expense_food')).toBe(PALETTE[0]);
        expect(map.get('expense_traffic')).toBe('#123456');
        expect(map.get('__other__')).toBe(BRAND);
    });

    it('shareSlices 用绝对值作为扇区大小；colorResolver 兑底到分类自己的色', () => {
        const slices = shareSlices(
            [share({ amountCents: -75000, absAmountCents: 75000 })],
            new Map([['expense_food', '#111111']]),
        );
        expect(slices[0]).toEqual({ key: 'expense_food', label: '餐饮', value: 75000, color: '#111111' });

        const resolve = colorResolver(new Map([['expense_food', '#222222']]), BRAND, SURFACE);
        expect(resolve('expense_food', 'theme')).toBe('#222222');
        expect(resolve('expense_traffic', '#123456')).toBe('#123456');
    });
});

describe('排行', () => {
    it('类目排行副标题跟随粒度', () => {
        expect(categorySubtitle(share({ amountCents: 75000, count: 1 }), 'expense', 'day')).toBe(
            '本月共支出 ¥ 750.00，消费 1 笔',
        );
        expect(categorySubtitle(share({ amountCents: 75000, count: 1 }), 'expense', 'month')).toBe(
            '本年共支出 ¥ 750.00，消费 1 笔',
        );
    });

    it('明细排行副标题', () => {
        expect(transactionRankSubtitle(rank())).toBe('09.09 汉口-杭州D45');
        expect(transactionRankSubtitle(rank({ note: '' }))).toBe('09.09');
    });

    it('进度条：相对最大值，越界夹取', () => {
        expect(rankRatio(50, 100)).toBe(0.5);
        expect(rankRatio(150, 100)).toBe(1);
        expect(rankRatio(50, 0)).toBe(0);
        expect(rankRatio(-50, 100)).toBe(0.5);
    });

    it('明细排行按最大单笔算进度', () => {
        const ranks = [rank({ amountCents: 75000 }), rank({ id: 'tx_2', amountCents: 15000 })];
        const ratio = transactionRankRatio(ranks);
        expect(ratio(ranks[0] as TransactionRank)).toBe(1);
        expect(ratio(ranks[1] as TransactionRank)).toBeCloseTo(0.2);
    });
});
