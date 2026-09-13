// 账户与资产：账户 CRUD + 净资产卡片 / 按月趋势。
//
// 余额口径：`untilDay`（含）之前的账单才计入，默认今天——与资产卡片
// 「当月按今日口径」保持一致（未来日期的账单要等那天才生效）。

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AccountPatch, NewAccount } from '../../core/ipc/types';
import { todayKey } from '../../core/domain/date';
import { DEFAULT_TREND_MONTHS, ledgerService } from '../../core/services/ledger.service';
import { ledgerInvalidation, ledgerKeys } from './queryKeys';

export function useAccounts(bookId: string | undefined, untilDay: string = todayKey()) {
    return useQuery({
        queryKey: ledgerKeys.accounts(bookId ?? '', untilDay),
        queryFn: () => ledgerService.listAccounts(bookId ?? '', untilDay),
        enabled: Boolean(bookId),
    });
}

/** 资产 / 负债分组视图（P8 资产页用）。 */
export function useAccountGroups(bookId: string | undefined, untilDay: string = todayKey()) {
    const query = useAccounts(bookId, untilDay);
    const all = query.data ?? [];
    return {
        assets: all.filter((account) => account.kind === 'asset'),
        liabilities: all.filter((account) => account.kind === 'liability'),
        isLoading: query.isLoading,
        error: query.error,
    };
}

export function useAssetsOverview(
    bookId: string | undefined,
    untilDay: string = todayKey(),
    months = DEFAULT_TREND_MONTHS,
) {
    return useQuery({
        queryKey: ledgerKeys.assets(bookId ?? '', untilDay, months),
        queryFn: () => ledgerService.getAssetsOverview(bookId ?? '', untilDay, months),
        enabled: Boolean(bookId),
    });
}

function useInvalidateAccounts() {
    const client = useQueryClient();
    return () =>
        Promise.all(
            ledgerInvalidation.afterAccountWrite.map((queryKey) =>
                client.invalidateQueries({ queryKey }),
            ),
        );
}

export function useCreateAccount() {
    const invalidate = useInvalidateAccounts();
    return useMutation({
        mutationFn: (input: NewAccount) => ledgerService.createAccount(input),
        onSuccess: () => void invalidate(),
    });
}

export function useUpdateAccount() {
    const invalidate = useInvalidateAccounts();
    return useMutation({
        mutationFn: (input: AccountPatch) => ledgerService.updateAccount(input),
        onSuccess: () => void invalidate(),
    });
}

export function useDeleteAccount() {
    const invalidate = useInvalidateAccounts();
    return useMutation({
        mutationFn: (id: string) => ledgerService.deleteAccount(id),
        onSuccess: () => void invalidate(),
    });
}

export function useReorderAccounts() {
    const invalidate = useInvalidateAccounts();
    return useMutation({
        mutationFn: ({ bookId, ids }: { bookId: string; ids: string[] }) =>
            ledgerService.reorderAccounts(bookId, ids),
        onSuccess: () => void invalidate(),
    });
}
