// 资产页（BRD FR-AST，P8）。
//
// 结构：净资产卡片（可展开为按月走势）→ 账户（资产 / 负债分组）→ 账本（切换 / 增删改）。
// 数据：`useAssetsOverview`（净资产 / 总资产 / 负债 + 12 个月快照）+ `useAccountGroups`
// （账户余额由后端按关联账单折算）；写操作全部走 `hooks/ledger` 的 mutation，
// 失效矩阵保证记账 / 改账户 / 换账本后这里立刻跟着变。

import { useCallback, useState } from 'react';
import type { Account, AccountKind, Book } from '../../core/ipc/types';
import { describeError } from '../../core/domain/errors';
import { UI_ICONS } from '../../core/design/icons';
import {
    useAccountGroups,
    useAssetsOverview,
    useCreateAccount,
    useDeleteAccount,
    useUpdateAccount,
} from '../../hooks/ledger/useLedgerAssets';
import {
    useCreateBook,
    useCurrentBook,
    useDeleteBook,
    useSetCurrentBook,
    useUpdateBook,
} from '../../hooks/ledger/useLedgerBooks';
import { pushInfoBar } from '../../hooks/ui/globalInfoBarStore';
import { ConfirmSheet, EmptyState } from '../../shared/ui';
import { AccountEditorSheet, type AccountDraft } from './AccountEditorSheet';
import { AccountSection } from './AccountSection';
import { BookEditorSheet } from './BookEditorSheet';
import { BookSection } from './BookSection';
import { NetWorthCard } from './NetWorthCard';
import { isBookDeletable, shouldSwitchBook } from './assetsPage.logic';

export function AssetsPage() {
    const { books, currentBook, isLoading: booksLoading, error: booksError } = useCurrentBook();
    const bookId = currentBook?.id;

    const overview = useAssetsOverview(bookId);
    const { assets, liabilities, isLoading: accountsLoading, error: accountsError } = useAccountGroups(bookId);

    const createAccount = useCreateAccount();
    const updateAccount = useUpdateAccount();
    const deleteAccount = useDeleteAccount();
    const createBook = useCreateBook();
    const updateBook = useUpdateBook();
    const deleteBook = useDeleteBook();
    const setCurrentBook = useSetCurrentBook();

    /** 账户编辑：null = 关闭；{ account: null } = 新建。 */
    const [accountSheet, setAccountSheet] = useState<{ account: Account | null; kind: AccountKind } | null>(null);
    const [accountError, setAccountError] = useState<string | null>(null);
    const [pendingAccountDelete, setPendingAccountDelete] = useState<Account | null>(null);

    /** 账本编辑：null = 关闭；{ book: null } = 新建。 */
    const [bookSheet, setBookSheet] = useState<{ book: Book | null } | null>(null);
    const [bookError, setBookError] = useState<string | null>(null);
    const [pendingBookDelete, setPendingBookDelete] = useState<Book | null>(null);
    const [switchingBookId, setSwitchingBookId] = useState<string | null>(null);

    const accountBusy = createAccount.isPending || updateAccount.isPending;

    const submitAccount = useCallback(
        async (draft: AccountDraft) => {
            const editing = accountSheet?.account ?? null;
            setAccountError(null);
            try {
                if (editing) {
                    await updateAccount.mutateAsync({ id: editing.id, ...draft });
                    pushInfoBar({ key: 'account-save', tone: 'success', title: '账户已保存' });
                } else {
                    if (!bookId) return;
                    await createAccount.mutateAsync({ bookId, ...draft });
                    pushInfoBar({ key: 'account-save', tone: 'success', title: '账户已创建' });
                }
                setAccountSheet(null);
            } catch (error) {
                setAccountError(describeError(error));
            }
        },
        [accountSheet, bookId, createAccount, updateAccount],
    );

    const confirmAccountDelete = useCallback(async () => {
        if (!pendingAccountDelete) return;
        try {
            await deleteAccount.mutateAsync(pendingAccountDelete.id);
            pushInfoBar({
                key: 'account-delete',
                tone: 'success',
                title: '账户已删除',
                content: '相关账单保留，显示为「未指定账户」',
            });
            setPendingAccountDelete(null);
            setAccountSheet(null);
        } catch (error) {
            pushInfoBar({ key: 'account-delete-error', tone: 'danger', title: '删除失败', content: describeError(error) });
        }
    }, [deleteAccount, pendingAccountDelete]);

    const submitBook = useCallback(
        async (name: string) => {
            const editing = bookSheet?.book ?? null;
            setBookError(null);
            try {
                if (editing) {
                    await updateBook.mutateAsync({ id: editing.id, name });
                    pushInfoBar({ key: 'book-save', tone: 'success', title: '账本已重命名' });
                } else {
                    await createBook.mutateAsync({ name });
                    pushInfoBar({ key: 'book-save', tone: 'success', title: '账本已创建' });
                }
                setBookSheet(null);
            } catch (error) {
                setBookError(describeError(error));
            }
        },
        [bookSheet, createBook, updateBook],
    );

    const confirmBookDelete = useCallback(async () => {
        if (!pendingBookDelete) return;
        try {
            await deleteBook.mutateAsync(pendingBookDelete.id);
            pushInfoBar({ key: 'book-delete', tone: 'success', title: '账本已删除', content: '该账本的账单与附件已一并清理' });
            setPendingBookDelete(null);
            setBookSheet(null);
        } catch (error) {
            pushInfoBar({ key: 'book-delete-error', tone: 'danger', title: '删除失败', content: describeError(error) });
        }
    }, [deleteBook, pendingBookDelete]);

    const handleSwitch = useCallback(
        async (book: Book) => {
            if (!shouldSwitchBook(bookId, book.id)) return;
            setSwitchingBookId(book.id);
            try {
                await setCurrentBook.mutateAsync(book.id);
                pushInfoBar({ key: 'book-switch', tone: 'success', title: `已切换到「${book.name}」` });
            } catch (error) {
                pushInfoBar({ key: 'book-switch-error', tone: 'danger', title: '切换失败', content: describeError(error) });
            } finally {
                setSwitchingBookId(null);
            }
        },
        [bookId, setCurrentBook],
    );

    if (!booksLoading && booksError) {
        return (
            <section className="flex min-h-full flex-col gap-3 pt-5">
                <EmptyState icon={UI_ICONS.danger} title="账本加载失败" description={describeError(booksError)} />
            </section>
        );
    }

    return (
        <section className="flex min-h-full flex-col gap-3 pt-5">
            <NetWorthCard
                overview={overview.data}
                isLoading={overview.isLoading}
                hasAccounts={assets.length + liabilities.length > 0}
            />

            {accountsError ? (
                <EmptyState icon={UI_ICONS.danger} title="账户加载失败" description={describeError(accountsError)} />
            ) : (
                <AccountSection
                    assets={assets}
                    liabilities={liabilities}
                    isLoading={accountsLoading}
                    onCreate={(kind) => {
                        setAccountError(null);
                        setAccountSheet({ account: null, kind });
                    }}
                    onEdit={(account) => {
                        setAccountError(null);
                        setAccountSheet({ account, kind: account.kind });
                    }}
                />
            )}

            <BookSection
                books={books}
                currentBookId={bookId}
                busyBookId={switchingBookId}
                onSwitch={(book) => void handleSwitch(book)}
                onCreate={() => {
                    setBookError(null);
                    setBookSheet({ book: null });
                }}
                onEdit={(book) => {
                    setBookError(null);
                    setBookSheet({ book });
                }}
            />

            <AccountEditorSheet
                open={accountSheet !== null}
                onOpenChange={(open) => {
                    if (!open) setAccountSheet(null);
                }}
                account={accountSheet?.account ?? null}
                defaultKind={accountSheet?.kind ?? 'asset'}
                busy={accountBusy}
                errorMessage={accountError}
                onSubmit={(draft) => void submitAccount(draft)}
                onRequestDelete={
                    accountSheet?.account ? () => setPendingAccountDelete(accountSheet.account) : undefined
                }
            />

            <BookEditorSheet
                open={bookSheet !== null}
                onOpenChange={(open) => {
                    if (!open) setBookSheet(null);
                }}
                book={bookSheet?.book ?? null}
                busy={createBook.isPending || updateBook.isPending}
                errorMessage={bookError}
                deletable={bookSheet?.book ? isBookDeletable(books, bookSheet.book.id) : false}
                onSubmit={(name) => void submitBook(name)}
                onRequestDelete={
                    bookSheet?.book ? () => setPendingBookDelete(bookSheet.book) : undefined
                }
            />

            <ConfirmSheet
                open={pendingAccountDelete !== null}
                onOpenChange={(open) => {
                    if (!open) setPendingAccountDelete(null);
                }}
                title={`删除账户「${pendingAccountDelete?.name ?? ''}」？`}
                description="该账户下的历史账单会保留，只是不再关联账户（显示为「未指定账户」）；资产统计与走势会同步更新。"
                busy={deleteAccount.isPending}
                onConfirm={() => void confirmAccountDelete()}
            />

            <ConfirmSheet
                open={pendingBookDelete !== null}
                onOpenChange={(open) => {
                    if (!open) setPendingBookDelete(null);
                }}
                title={`删除账本「${pendingBookDelete?.name ?? ''}」？`}
                description="将同时删除该账本的全部账单与图片附件，且不可恢复；其它账本不受影响。"
                busy={deleteBook.isPending}
                onConfirm={() => void confirmBookDelete()}
            />
        </section>
    );
}

export default AssetsPage;
