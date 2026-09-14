// 资产页（BRD FR-AST，P8）。
//
// 结构：净资产卡片（可展开为按月走势）→ 账户（资产 / 负债分组）→ 账本（切换 / 增删改）。
// 数据：`useAssetsOverview`（净资产 / 总资产 / 负债 + 12 个月快照）+ `useAccountGroups`
// （账户余额由后端按关联账单折算）；写操作全部走 `hooks/ledger` 的 mutation，
// 失效矩阵保证记账 / 改账户 / 换账本后这里立刻跟着变。

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Account, AccountKind, Book } from '../../core/ipc/types';
import { describeError } from '../../core/domain/errors';
import { bookDisplayName } from '../../core/domain/categoryName';
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
    const { t } = useTranslation();
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
                    pushInfoBar({ key: 'account-save', tone: 'success', title: t('assets.accountSaved') });
                } else {
                    if (!bookId) return;
                    await createAccount.mutateAsync({ bookId, ...draft });
                    pushInfoBar({ key: 'account-save', tone: 'success', title: t('assets.accountCreated') });
                }
                setAccountSheet(null);
            } catch (error) {
                setAccountError(describeError(error));
            }
        },
        [accountSheet, bookId, createAccount, updateAccount, t],
    );

    const confirmAccountDelete = useCallback(async () => {
        if (!pendingAccountDelete) return;
        try {
            await deleteAccount.mutateAsync(pendingAccountDelete.id);
            pushInfoBar({
                key: 'account-delete',
                tone: 'success',
                title: t('assets.accountDeleted'),
                content: t('assets.accountDeletedBody'),
            });
            setPendingAccountDelete(null);
            setAccountSheet(null);
        } catch (error) {
            pushInfoBar({ key: 'account-delete-error', tone: 'danger', title: t('common.deleteFailed'), content: describeError(error) });
        }
    }, [deleteAccount, pendingAccountDelete, t]);

    const submitBook = useCallback(
        async (name: string) => {
            const editing = bookSheet?.book ?? null;
            setBookError(null);
            try {
                if (editing) {
                    await updateBook.mutateAsync({ id: editing.id, name });
                    pushInfoBar({ key: 'book-save', tone: 'success', title: t('assets.bookRenamed') });
                } else {
                    await createBook.mutateAsync({ name });
                    pushInfoBar({ key: 'book-save', tone: 'success', title: t('assets.bookCreated') });
                }
                setBookSheet(null);
            } catch (error) {
                setBookError(describeError(error));
            }
        },
        [bookSheet, createBook, updateBook, t],
    );

    const confirmBookDelete = useCallback(async () => {
        if (!pendingBookDelete) return;
        try {
            await deleteBook.mutateAsync(pendingBookDelete.id);
            pushInfoBar({ key: 'book-delete', tone: 'success', title: t('assets.bookDeleted'), content: t('assets.bookDeletedBody') });
            setPendingBookDelete(null);
            setBookSheet(null);
        } catch (error) {
            pushInfoBar({ key: 'book-delete-error', tone: 'danger', title: t('common.deleteFailed'), content: describeError(error) });
        }
    }, [deleteBook, pendingBookDelete, t]);

    const handleSwitch = useCallback(
        async (book: Book) => {
            if (!shouldSwitchBook(bookId, book.id)) return;
            setSwitchingBookId(book.id);
            try {
                await setCurrentBook.mutateAsync(book.id);
                pushInfoBar({ key: 'book-switch', tone: 'success', title: t('assets.switchedBook', { name: bookDisplayName(book, t, book.name) }) });
            } catch (error) {
                pushInfoBar({ key: 'book-switch-error', tone: 'danger', title: t('assets.switchFailed'), content: describeError(error) });
            } finally {
                setSwitchingBookId(null);
            }
        },
        [bookId, setCurrentBook, t],
    );

    if (!booksLoading && booksError) {
        return (
            <section className="flex min-h-full flex-col gap-3 pt-5">
                <EmptyState icon={UI_ICONS.danger} title={t('assets.booksLoadFailed')} description={describeError(booksError)} />
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
                <EmptyState icon={UI_ICONS.danger} title={t('assets.accountsLoadFailed')} description={describeError(accountsError)} />
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
                title={t('assets.confirmDeleteAccountTitle', { name: pendingAccountDelete?.name ?? '' })}
                description={t('assets.confirmDeleteAccountBody')}
                busy={deleteAccount.isPending}
                onConfirm={() => void confirmAccountDelete()}
            />

            <ConfirmSheet
                open={pendingBookDelete !== null}
                onOpenChange={(open) => {
                    if (!open) setPendingBookDelete(null);
                }}
                title={t('assets.confirmDeleteBookTitle', { name: pendingBookDelete?.name ?? '' })}
                description={t('assets.confirmDeleteBookBody')}
                busy={deleteBook.isPending}
                onConfirm={() => void confirmBookDelete()}
            />
        </section>
    );
}

export default AssetsPage;
