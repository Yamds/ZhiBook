// 账本：列表 / 当前账本 / 增删改与切换。
//
// 当前账本 id 存在后端 meta 里（`set_current_book`），前端只读它。
// 切换账本会让所有账本相关缓存失效（见 ledgerInvalidation.afterBookWrite）。

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Book, BookPatch, NewBook } from '../../core/ipc/types';
import { ledgerService } from '../../core/services/ledger.service';
import { ledgerInvalidation, ledgerKeys } from './queryKeys';

/** 账本列表（很少变，给 30s 的 staleTime）。 */
export function useBooks() {
    return useQuery({
        queryKey: ledgerKeys.books(),
        queryFn: ledgerService.listBooks,
        staleTime: 30_000,
    });
}

/** 当前账本：后端指针缺失时落到列表第一个，保证页面永远有一个可用账本。 */
export function useCurrentBook() {
    const books = useBooks();
    const pointer = useQuery({
        queryKey: ledgerKeys.currentBook(),
        queryFn: ledgerService.getCurrentBook,
        staleTime: 30_000,
    });

    const list = books.data ?? [];
    const currentBook: Book | undefined =
        list.find((book) => book.id === pointer.data) ?? list[0];

    return {
        books: list,
        currentBook,
        isLoading: books.isLoading || pointer.isLoading,
        error: books.error ?? pointer.error,
    };
}

/** 失效账本相关缓存（写账本 / 切账本后调用）。 */
function useInvalidateBooks() {
    const client = useQueryClient();
    return () =>
        Promise.all(
            ledgerInvalidation.afterBookWrite.map((queryKey) =>
                client.invalidateQueries({ queryKey }),
            ),
        );
}

export function useCreateBook() {
    const invalidate = useInvalidateBooks();
    return useMutation({
        mutationFn: (input: NewBook) => ledgerService.createBook(input),
        onSuccess: () => void invalidate(),
    });
}

export function useUpdateBook() {
    const invalidate = useInvalidateBooks();
    return useMutation({
        mutationFn: (input: BookPatch) => ledgerService.updateBook(input),
        onSuccess: () => void invalidate(),
    });
}

export function useDeleteBook() {
    const invalidate = useInvalidateBooks();
    return useMutation({
        mutationFn: (id: string) => ledgerService.deleteBook(id),
        onSuccess: () => void invalidate(),
    });
}

export function useSetCurrentBook() {
    const invalidate = useInvalidateBooks();
    return useMutation({
        mutationFn: (id: string) => ledgerService.setCurrentBook(id),
        onSuccess: () => void invalidate(),
    });
}
