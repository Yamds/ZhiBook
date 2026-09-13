// 账单：按天查询、区间懒加载、增删改。
//
// 明细页按天分段懒加载（Q9）：`useTransactionsRange` 只是把区间代理给后端，
// 「继续加载更早」由页面把 toDay 往前推（每次不超过 7 天 / 50 条）。

import { useMutation, useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import type { NewTransaction, Transaction, TransactionPatch } from '../../core/ipc/types';
import {
    ledgerService,
    TRANSACTION_BATCH_LIMIT,
} from '../../core/services/ledger.service';
import { ledgerInvalidation, ledgerKeys } from './queryKeys';

/** 某一天的账单（时间倒序）。 */
export function useTransactionsByDay(bookId: string | undefined, day: string) {
    return useQuery({
        queryKey: ledgerKeys.transactionsByDay(bookId ?? '', day),
        queryFn: () => ledgerService.listTransactionsByDay(bookId ?? '', day),
        enabled: Boolean(bookId),
    });
}

/** 日期区间内的账单（倒序，最多 limit 条），用于明细页懒加载。 */
export function useTransactionsRange(
    bookId: string | undefined,
    fromDay: string,
    toDay: string,
    limit = TRANSACTION_BATCH_LIMIT,
) {
    return useQuery({
        queryKey: ledgerKeys.transactionsRange(bookId ?? '', fromDay, toDay, limit),
        queryFn: () => ledgerService.listTransactionsRange(bookId ?? '', fromDay, toDay, limit),
        enabled: Boolean(bookId),
    });
}

/** 日期区间窗口（明细页懒加载：互不重叠的日期段）。 */
export interface TransactionWindow {
    readonly fromDay: string;
    readonly toDay: string;
}

/**
 * 明细页懒加载：**每个窗口一个查询**（窗口互不重叠，页面按 id 去重合并）。
 *
 * 用 `useQueries` 而不是循环调 hook：窗口数量是动态增长的。
 * 单个窗口仍受 [`TRANSACTION_BATCH_LIMIT`] 限制，与 BRD Q9 的「每批 ≤50 条」一致。
 */
export function useTransactionWindows(
    bookId: string | undefined,
    windows: ReadonlyArray<TransactionWindow>,
    enabled = true,
) {
    return useQueries({
        queries: windows.map((window) => ({
            queryKey: ledgerKeys.transactionsRange(
                bookId ?? '',
                window.fromDay,
                window.toDay,
                TRANSACTION_BATCH_LIMIT,
            ),
            queryFn: () =>
                ledgerService.listTransactionsRange(
                    bookId ?? '',
                    window.fromDay,
                    window.toDay,
                    TRANSACTION_BATCH_LIMIT,
                ),
            enabled: Boolean(bookId) && enabled,
        })),
    });
}

/**
 * 明细页搜索（FR-DET-10）：关键字为空时不发请求。
 *
 * 结果不再分组——页面直接交给 `groupTransactionsByDay`（与按天浏览同一套渲染）。
 */
export function useSearchTransactions(bookId: string | undefined, keyword: string) {
    const trimmed = keyword.trim();
    return useQuery({
        queryKey: ledgerKeys.searchTransactions(bookId ?? '', trimmed),
        queryFn: () => ledgerService.searchTransactions(bookId ?? '', trimmed),
        enabled: Boolean(bookId) && trimmed.length > 0,
        // 搜索是用户输入驱动的短生命周期查询，缓存久了反而占内存
        gcTime: 5 * 60_000,
    });
}

export function useTransaction(id: string | undefined) {
    return useQuery({
        queryKey: ledgerKeys.transaction(id ?? ''),
        queryFn: () => ledgerService.getTransaction(id ?? ''),
        enabled: Boolean(id),
    });
}

function useInvalidateTransactions() {
    const client = useQueryClient();
    return () =>
        Promise.all(
            ledgerInvalidation.afterTransactionWrite.map((queryKey) =>
                client.invalidateQueries({ queryKey }),
            ),
        );
}

/** 记一笔（含编辑复用）。 */
export function useCreateTransaction() {
    const invalidate = useInvalidateTransactions();
    return useMutation({
        mutationFn: (input: NewTransaction) => ledgerService.createTransaction(input),
        onSuccess: () => void invalidate(),
    });
}

export function useUpdateTransaction() {
    const invalidate = useInvalidateTransactions();
    return useMutation({
        mutationFn: (input: TransactionPatch) => ledgerService.updateTransaction(input),
        onSuccess: () => void invalidate(),
    });
}

export function useDeleteTransaction() {
    const invalidate = useInvalidateTransactions();
    return useMutation({
        mutationFn: (id: string) => ledgerService.deleteTransaction(id),
        onSuccess: () => void invalidate(),
    });
}

/** 把一批账单按天分组（明细页分组头用）。 */
export function groupTransactionsByDay(items: Transaction[]): { day: string; items: Transaction[] }[] {
    const groups: { day: string; items: Transaction[] }[] = [];
    for (const item of items) {
        const last = groups.at(-1);
        if (last && last.day === item.day) last.items.push(item);
        else groups.push({ day: item.day, items: [item] });
    }
    return groups;
}
