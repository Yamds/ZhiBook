// Query key 约定测试：key 形状稳定 + 失效前缀能覆盖到对应查询。

import { describe, expect, it } from 'vitest';
import { ledgerInvalidation, ledgerKeys } from './queryKeys';

/** key 是否是某个前缀的延伸（TanStack invalidateQueries 的前缀匹配语义）。 */
function startsWith(key: readonly unknown[], prefix: readonly unknown[]): boolean {
    if (key.length < prefix.length) return false;
    return prefix.every((part, index) => key[index] === part);
}

describe('ledgerKeys', () => {
    it('所有 key 都以 ledger 打头', () => {
        const keys = [
            ledgerKeys.books(),
            ledgerKeys.currentBook(),
            ledgerKeys.categories(false),
            ledgerKeys.accounts('book_a', '2025-09-08'),
            ledgerKeys.assets('book_a', '2025-09-08', 12),
            ledgerKeys.transactionsByDay('book_a', '2025-09-08'),
            ledgerKeys.transactionsRange('book_a', '2025-09-01', '2025-09-08', 50),
            ledgerKeys.transaction('tx_1'),
            ledgerKeys.searchTransactions('book_a', '早餐'),
            ledgerKeys.transactionRanks('book_a', '2025-09', 'expense', 10),
            ledgerKeys.monthStats('book_a', '2025-09'),
            ledgerKeys.yearSummary('book_a', 2025),
            ledgerKeys.monthShares('book_a', '2025-09'),
            ledgerKeys.periodShares('book_a', '2025-09', 12),
            ledgerKeys.daySummaries('book_a', '2025-09'),
            ledgerKeys.attachments('tx_1'),
            ledgerKeys.attachmentData('att_1'),
        ];
        for (const key of keys) expect(key[0]).toBe('ledger');
    });

    it('账本 id 进入 key：不同账本不共用缓存', () => {
        expect(ledgerKeys.monthStats('book_a', '2025-09')).not.toEqual(
            ledgerKeys.monthStats('book_b', '2025-09'),
        );
        expect(ledgerKeys.transactionsByDay('book_a', '2025-09-08')).not.toEqual(
            ledgerKeys.transactionsByDay('book_b', '2025-09-08'),
        );
    });

    it('余额按日期截断，所以 untilDay 进 key', () => {
        expect(ledgerKeys.accounts('book_a', '2025-09-08')).not.toEqual(
            ledgerKeys.accounts('book_a', '2025-09-09'),
        );
    });

    it('分类与账本无关（全局共享）', () => {
        expect(ledgerKeys.categories(false)).toEqual(['ledger', 'categories', false]);
        expect(ledgerKeys.categories(true)).toEqual(['ledger', 'categories', true]);
    });
});

describe('ledgerInvalidation', () => {
    it('账单写操作覆盖明细 / 统计 / 账户 / 资产', () => {
        const prefixes = ledgerInvalidation.afterTransactionWrite;
        expect(prefixes).toContainEqual(ledgerKeys.transactionsRoot());
        expect(prefixes).toContainEqual(ledgerKeys.statsRoot());
        expect(prefixes).toContainEqual(ledgerKeys.accountsRoot());
        expect(prefixes).toContainEqual(ledgerKeys.assetsRoot());

        expect(startsWith(ledgerKeys.monthStats('book_a', '2025-09'), prefixes[1])).toBe(true);
        expect(startsWith(ledgerKeys.transactionsByDay('book_a', '2025-09-08'), prefixes[0])).toBe(
            true,
        );
        expect(startsWith(ledgerKeys.searchTransactions('book_a', '早餐'), prefixes[0])).toBe(true);
        expect(startsWith(ledgerKeys.accounts('book_a', '2025-09-08'), prefixes[2])).toBe(true);
        expect(startsWith(ledgerKeys.assets('book_a', '2025-09-08', 12), prefixes[3])).toBe(true);
    });

    it('分类写操作覆盖分类 / 统计 / 明细，但不碰账户与资产', () => {
        const prefixes = ledgerInvalidation.afterCategoryWrite;
        expect(startsWith(ledgerKeys.categories(false), prefixes[0])).toBe(true);
        expect(startsWith(ledgerKeys.monthShares('book_a', '2025-09'), prefixes[1])).toBe(true);
        expect(startsWith(ledgerKeys.accounts('book_a', '2025-09-08'), prefixes[0])).toBe(false);
        expect(startsWith(ledgerKeys.assets('book_a', '2025-09-08', 12), prefixes[1])).toBe(false);
    });

    it('账户写操作覆盖账户与资产趋势', () => {
        const prefixes = ledgerInvalidation.afterAccountWrite;
        expect(startsWith(ledgerKeys.accounts('book_a', '2025-09-08'), prefixes[0])).toBe(true);
        expect(startsWith(ledgerKeys.assets('book_a', '2025-09-08', 12), prefixes[1])).toBe(true);
        expect(startsWith(ledgerKeys.monthStats('book_a', '2025-09'), prefixes[0])).toBe(false);
    });

    it('账本写操作覆盖除分类外的全部数据', () => {
        const prefixes = ledgerInvalidation.afterBookWrite;
        for (const key of [
            ledgerKeys.books(),
            ledgerKeys.currentBook(),
            ledgerKeys.monthStats('book_a', '2025-09'),
            ledgerKeys.transactionsByDay('book_a', '2025-09-08'),
            ledgerKeys.accounts('book_a', '2025-09-08'),
            ledgerKeys.assets('book_a', '2025-09-08', 12),
            ledgerKeys.attachments('tx_1'),
        ]) {
            expect(prefixes.some((prefix) => startsWith(key, prefix))).toBe(true);
        }
        expect(
            prefixes.some((prefix) => startsWith(ledgerKeys.categories(false), prefix)),
        ).toBe(false);
    });

    it('附件写操作覆盖附件与明细', () => {
        const prefixes = ledgerInvalidation.afterAttachmentWrite;
        expect(startsWith(ledgerKeys.attachments('tx_1'), prefixes[0])).toBe(true);
        expect(startsWith(ledgerKeys.attachmentData('att_1'), prefixes[0])).toBe(true);
        expect(startsWith(ledgerKeys.transaction('tx_1'), prefixes[1])).toBe(true);
    });
});
