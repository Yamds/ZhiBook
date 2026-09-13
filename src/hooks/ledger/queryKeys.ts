// 记账数据的 Query Key 约定 + 写操作后的失效矩阵。
//
// 约定：所有 key 都以 `['ledger']` 打头，第二段是实体域。
// 失效一律按**前缀**做（TanStack 的 invalidateQueries 是前缀匹配），
// 因此下面导出的 `xxxRoot()` 就是「一键失效整个域」。
//
// 为什么账本 id 出现在 key 里：切换账本后必须换一套缓存，不能复用。

import type { StatsKind } from '../../core/ipc/types';
import { DEFAULT_TREND_MONTHS } from '../../core/services/ledger.service';

export const ledgerKeys = {
    all: ['ledger'] as const,

    // 账本
    books: () => [...ledgerKeys.all, 'books'] as const,
    currentBook: () => [...ledgerKeys.all, 'current-book'] as const,

    // 分类（全局共享，key 里只有 includeHidden）
    categoriesRoot: () => [...ledgerKeys.all, 'categories'] as const,
    categories: (includeHidden: boolean) => [...ledgerKeys.categoriesRoot(), includeHidden] as const,

    // 账户 / 资产（余额按 untilDay 截断，所以日期进 key）
    accountsRoot: () => [...ledgerKeys.all, 'accounts'] as const,
    accounts: (bookId: string, untilDay: string) =>
        [...ledgerKeys.accountsRoot(), bookId, untilDay] as const,
    assetsRoot: () => [...ledgerKeys.all, 'assets'] as const,
    assets: (bookId: string, untilDay: string, months: number = DEFAULT_TREND_MONTHS) =>
        [...ledgerKeys.assetsRoot(), bookId, untilDay, months] as const,

    // 账单
    transactionsRoot: () => [...ledgerKeys.all, 'transactions'] as const,
    transactionsByDay: (bookId: string, day: string) =>
        [...ledgerKeys.transactionsRoot(), 'day', bookId, day] as const,
    transactionsRange: (bookId: string, fromDay: string, toDay: string, limit: number) =>
        [...ledgerKeys.transactionsRoot(), 'range', bookId, fromDay, toDay, limit] as const,
    transaction: (id: string) => [...ledgerKeys.transactionsRoot(), 'one', id] as const,
    searchTransactions: (bookId: string, keyword: string) =>
        [...ledgerKeys.transactionsRoot(), 'search', bookId, keyword] as const,
    transactionRanks: (
        bookId: string,
        month: string,
        kind: StatsKind,
        limit: number,
    ) => [...ledgerKeys.transactionsRoot(), 'ranks', bookId, month, kind, limit] as const,

    // 统计
    statsRoot: () => [...ledgerKeys.all, 'stats'] as const,
    monthStats: (bookId: string, month: string) =>
        [...ledgerKeys.statsRoot(), 'month', bookId, month] as const,
    yearSummary: (bookId: string, year: number) =>
        [...ledgerKeys.statsRoot(), 'year', bookId, year] as const,
    monthShares: (bookId: string, month: string) =>
        [...ledgerKeys.statsRoot(), 'shares', bookId, month] as const,
    periodShares: (bookId: string, endMonth: string, months: number = DEFAULT_TREND_MONTHS) =>
        [...ledgerKeys.statsRoot(), 'period-shares', bookId, endMonth, months] as const,
    daySummaries: (bookId: string, month: string) =>
        [...ledgerKeys.statsRoot(), 'days', bookId, month] as const,

    // 附件
    attachmentsRoot: () => [...ledgerKeys.all, 'attachments'] as const,
    attachments: (transactionId: string) =>
        [...ledgerKeys.attachmentsRoot(), transactionId] as const,
    attachmentData: (attachmentId: string) =>
        [...ledgerKeys.attachmentsRoot(), 'data', attachmentId] as const,
};

/**
 * 写操作后的失效矩阵。
 *
 * | 写什么 | 失效 |
 * | --- | --- |
 * | 账单增删改 | 明细 + 统计 + 账户余额 + 资产趋势 |
 * | 分类增删改/排序 | 分类列表 + 统计（分类元信息参与聚合展示）+ 明细（行内显示分类名） |
 * | 账户增删改/排序 | 账户 + 资产趋势 |
 * | 账本增删改/切换 | 除分类外的全部（分类全局共享，不随账本变化） |
 * | 附件增删 | 该账单的附件 + 明细（详情页展示图片） |
 */
export const ledgerInvalidation = {
    afterTransactionWrite: [
        ledgerKeys.transactionsRoot(),
        ledgerKeys.statsRoot(),
        ledgerKeys.accountsRoot(),
        ledgerKeys.assetsRoot(),
    ],
    afterCategoryWrite: [
        ledgerKeys.categoriesRoot(),
        ledgerKeys.statsRoot(),
        ledgerKeys.transactionsRoot(),
    ],
    afterAccountWrite: [ledgerKeys.accountsRoot(), ledgerKeys.assetsRoot()],
    afterBookWrite: [
        ledgerKeys.books(),
        ledgerKeys.currentBook(),
        ledgerKeys.transactionsRoot(),
        ledgerKeys.statsRoot(),
        ledgerKeys.accountsRoot(),
        ledgerKeys.assetsRoot(),
        ledgerKeys.attachmentsRoot(),
    ],
    afterAttachmentWrite: [ledgerKeys.attachmentsRoot(), ledgerKeys.transactionsRoot()],
} as const;
