// 账单：按天查询、区间懒加载、增删改。
//
// 明细页按天分段懒加载（Q9）：`useTransactionsRange` 只是把区间代理给后端，
// 「继续加载更早」由页面把 toDay 往前推（每次不超过 7 天 / 50 条）。

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
