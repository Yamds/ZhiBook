// 明细页纯逻辑测试：懒加载窗口、合并去重、分组总计、金额文案。

import { describe, expect, it } from 'vitest';
import type { EntryKind, Transaction } from '../../core/ipc/types';
import { TRANSACTION_BATCH_LIMIT } from '../../core/services/ledger.service';
import {
    DETAILS_BATCH_DAYS,
    formatDayTotal,
    groupByDayWithTotals,
    initialWindow,
    isBatchTruncated,
    mergeTransactions,
    nextWindow,
    viewerIndexAfterRelease,
    windowsToCover,
} from './detailsPage.logic';

function tx(
    id: string,
    day: string,
    amountCents: number,
    kind: EntryKind = 'expense',
    occurredAtMs = 0,
): Transaction {
    return {
        id,
        bookId: 'book_default',
        kind,
        categoryId: kind === 'income' ? 'income_salary' : 'expense_food',
        accountId: null,
        amountCents,
        note: '',
        day,
        month: day.slice(0, 7),
        occurredAtMs,
        createdAtMs: occurredAtMs,
        updatedAtMs: occurredAtMs,
    };
}

describe('懒加载窗口', () => {
    it('初始窗口覆盖锚定日在内共 7 天', () => {
        expect(initialWindow('2025-09-08')).toEqual({
            fromDay: '2025-09-02',
            toDay: '2025-09-08',
        });
        expect(DETAILS_BATCH_DAYS).toBe(7);
    });

    it('初始窗口跨月 / 跨年也正确', () => {
        expect(initialWindow('2025-09-03')).toEqual({
            fromDay: '2025-08-28',
            toDay: '2025-09-03',
        });
        expect(initialWindow('2025-01-02')).toEqual({
            fromDay: '2024-12-27',
            toDay: '2025-01-02',
        });
    });

    it('正常批次：从最旧那天再往前 7 天', () => {
        const batch = [tx('a', '2025-09-08', 100), tx('b', '2025-09-03', 100)];
        expect(nextWindow({ fromDay: '2025-09-02', toDay: '2025-09-08' }, batch)).toEqual({
            fromDay: '2025-08-27',
            toDay: '2025-09-02',
        });
    });

    it('空批次 = 到底', () => {
        expect(nextWindow({ fromDay: '2025-09-02', toDay: '2025-09-08' }, [])).toBeNull();
    });

    it('顶到 LIMIT：收窄到最旧那一天再拉', () => {
        const batch = Array.from({ length: TRANSACTION_BATCH_LIMIT }, (_, index) =>
            tx(`t${index}`, index === TRANSACTION_BATCH_LIMIT - 1 ? '2025-09-04' : '2025-09-08', 100),
        );
        expect(isBatchTruncated(batch)).toBe(true);
        expect(nextWindow({ fromDay: '2025-09-02', toDay: '2025-09-08' }, batch)).toEqual({
            fromDay: '2025-09-04',
            toDay: '2025-09-04',
        });
    });

    it('单日仍顶到 LIMIT：停止（页面给「记录过多」提示）', () => {
        const batch = Array.from({ length: TRANSACTION_BATCH_LIMIT }, (_, index) =>
            tx(`t${index}`, '2025-09-04', 100),
        );
        expect(nextWindow({ fromDay: '2025-09-04', toDay: '2025-09-04' }, batch)).toBeNull();
    });
});

describe('合并与分组', () => {
    it('mergeTransactions 按 id 去重并按时间倒序', () => {
        const merged = mergeTransactions([
            [tx('a', '2025-09-08', 100, 'expense', 300), tx('b', '2025-09-07', 100, 'expense', 200)],
            [tx('b', '2025-09-07', 100, 'expense', 200), tx('c', '2025-09-06', 100, 'expense', 100)],
        ]);
        expect(merged.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    });

    it('groupByDayWithTotals 算出每日结余（收入 + / 支出 -）', () => {
        const groups = groupByDayWithTotals([
            tx('a', '2025-09-08', 75000, 'expense', 300),
            tx('b', '2025-09-08', 100000, 'income', 200),
            tx('c', '2025-09-07', 14600, 'expense', 100),
        ]);
        expect(groups).toHaveLength(2);
        expect(groups[0]?.day).toBe('2025-09-08');
        expect(groups[0]?.items).toHaveLength(2);
        expect(groups[0]?.balanceCents).toBe(25000);
        expect(groups[1]?.balanceCents).toBe(-14600);
    });

    it('formatDayTotal 带正负号', () => {
        expect(formatDayTotal(-14600)).toBe('- ¥ 146.00');
        expect(formatDayTotal(100000)).toBe('+ ¥ 1,000.00');
        expect(formatDayTotal(0)).toBe('¥ 0.00');
    });
});

describe('windowsToCover', () => {
    it('焦点日在初始窗口内：只给一个窗口', () => {
        expect(windowsToCover('2025-09-13', '2025-09-09')).toEqual([
            { fromDay: '2025-09-07', toDay: '2025-09-13' },
        ]);
        expect(windowsToCover('2025-09-13', '2025-09-13')).toHaveLength(1);
        expect(windowsToCover('2025-09-13', '2025-09-20')).toHaveLength(1);
    });

    it('焦点日更早：铺到覆盖那天为止', () => {
        const windows = windowsToCover('2025-09-13', '2025-09-01');
        expect(windows).toEqual([
            { fromDay: '2025-09-07', toDay: '2025-09-13' },
            { fromDay: '2025-08-31', toDay: '2025-09-06' },
        ]);
        expect((windows.at(-1) as { fromDay: string }).fromDay <= '2025-09-01').toBe(true);
    });

    it('跨年与窗口上限都安全', () => {
        // 焦点日 2024-12-20 落在第 3 个窗口里（第 2 个从 12-21 开始，还不包含它）
        const windows = windowsToCover('2025-01-03', '2024-12-20');
        expect(windows).toEqual([
            { fromDay: '2024-12-28', toDay: '2025-01-03' },
            { fromDay: '2024-12-21', toDay: '2024-12-27' },
            { fromDay: '2024-12-14', toDay: '2024-12-20' },
        ]);
        expect((windows.at(-1) as { fromDay: string }).fromDay <= '2024-12-20').toBe(true);
        expect(windowsToCover('2025-09-13', '2000-01-01', { maxWindows: 3 })).toHaveLength(3);
    });
});

describe('图片查看器翻页', () => {
    it('位移足够才翻页，且夹在首尾', () => {
        expect(viewerIndexAfterRelease(1, -100, 400, 3)).toBe(2);
        expect(viewerIndexAfterRelease(1, 100, 400, 3)).toBe(0);
        expect(viewerIndexAfterRelease(0, 100, 400, 3)).toBe(0);
        expect(viewerIndexAfterRelease(2, -100, 400, 3)).toBe(2);
    });

    it('位移不够 / 参数非法时不动', () => {
        expect(viewerIndexAfterRelease(1, -20, 400, 3)).toBe(1);
        expect(viewerIndexAfterRelease(1, -100, 0, 3)).toBe(1);
        expect(viewerIndexAfterRelease(1, -100, 400, 0)).toBe(1);
    });
});
