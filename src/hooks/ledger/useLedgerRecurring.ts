// 固定收支（每日）：规则 CRUD + 补账。
//
// 补账的「哪些规则 / 哪几天」由前端纯逻辑算出（`recurring.logic.ts`，含 05:00 边界与
// 本地时区），Rust 只做 `day >= start_day` 校验与幂等落库。

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
    NewRecurringRule,
    RecurringOccurrence,
    RecurringRulePatch,
} from '../../core/ipc/types';
import { ledgerService } from '../../core/services/ledger.service';
import { ledgerInvalidation, ledgerKeys } from './queryKeys';

/** 全部账本的固定收支规则（补账需跨账本；设置页再按当前账本过滤）。 */
export function useRecurringRules() {
    return useQuery({
        queryKey: ledgerKeys.recurringRules(),
        queryFn: ledgerService.listRecurringRules,
        staleTime: 30_000,
    });
}

function useInvalidateRules() {
    const client = useQueryClient();
    return () => client.invalidateQueries({ queryKey: ledgerKeys.recurringRoot() });
}

export function useCreateRecurringRule() {
    const invalidate = useInvalidateRules();
    return useMutation({
        mutationFn: (input: NewRecurringRule) => ledgerService.createRecurringRule(input),
        onSuccess: () => void invalidate(),
    });
}

export function useUpdateRecurringRule() {
    const invalidate = useInvalidateRules();
    return useMutation({
        mutationFn: (input: RecurringRulePatch) => ledgerService.updateRecurringRule(input),
        onSuccess: () => void invalidate(),
    });
}

export function useDeleteRecurringRule() {
    const invalidate = useInvalidateRules();
    return useMutation({
        mutationFn: (id: string) => ledgerService.deleteRecurringRule(id),
        onSuccess: () => void invalidate(),
    });
}

/** 补账：生成账单后要让明细 / 统计 / 账户 / 资产一起刷新。 */
export function useRunRecurringEntries() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: (occurrences: RecurringOccurrence[]) =>
            ledgerService.runRecurringEntries(occurrences),
        onSuccess: () =>
            Promise.all([
                ...ledgerInvalidation.afterTransactionWrite.map((queryKey) =>
                    client.invalidateQueries({ queryKey }),
                ),
                client.invalidateQueries({ queryKey: ledgerKeys.recurringRoot() }),
            ]),
    });
}
