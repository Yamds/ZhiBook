// 分类（全局共享，不随账本隔离）。
//
// 删除 = 软删除（`hideCategory`），历史账单继续显示原分类；
// 排序按组提交（拖动结束时一次提交整组顺序）。

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Category, CategoryPatch, EntryKind, NewCategory } from '../../core/ipc/types';
import { ledgerService } from '../../core/services/ledger.service';
import { ledgerInvalidation, ledgerKeys } from './queryKeys';

export function useCategories(includeHidden = false) {
    return useQuery({
        queryKey: ledgerKeys.categories(includeHidden),
        queryFn: () => ledgerService.listCategories(includeHidden),
        staleTime: 60_000,
    });
}

/** 宫格用的分组视图：支出 / 收入各一组（已按 sortOrder 排序）。 */
export function useVisibleCategories() {
    const query = useCategories(false);
    const all: Category[] = query.data ?? [];
    return {
        expense: all.filter((category) => category.kind === 'expense'),
        income: all.filter((category) => category.kind === 'income'),
        isLoading: query.isLoading,
        error: query.error,
    };
}

/** 按 id 取分类（历史账单可能引用已软删除的分类，所以查全量）。 */
export function useCategoryLookup() {
    const query = useCategories(true);
    const byId = new Map((query.data ?? []).map((category) => [category.id, category]));
    return { byId, isLoading: query.isLoading, error: query.error };
}

function useInvalidateCategories() {
    const client = useQueryClient();
    return () =>
        Promise.all(
            ledgerInvalidation.afterCategoryWrite.map((queryKey) =>
                client.invalidateQueries({ queryKey }),
            ),
        );
}

export function useCreateCategory() {
    const invalidate = useInvalidateCategories();
    return useMutation({
        mutationFn: (input: NewCategory) => ledgerService.createCategory(input),
        onSuccess: () => void invalidate(),
    });
}

export function useUpdateCategory() {
    const invalidate = useInvalidateCategories();
    return useMutation({
        mutationFn: (input: CategoryPatch) => ledgerService.updateCategory(input),
        onSuccess: () => void invalidate(),
    });
}

export function useHideCategory() {
    const invalidate = useInvalidateCategories();
    return useMutation({
        mutationFn: (id: string) => ledgerService.hideCategory(id),
        onSuccess: () => void invalidate(),
    });
}

export function useReorderCategories() {
    const invalidate = useInvalidateCategories();
    return useMutation({
        mutationFn: ({ kind, ids }: { kind: EntryKind; ids: string[] }) =>
            ledgerService.reorderCategories(kind, ids),
        onSuccess: () => void invalidate(),
    });
}
