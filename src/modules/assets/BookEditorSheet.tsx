// 账本编辑器（FR-AST-3 / FR-AST-5）：新建与重命名共用；重命名时带删除入口。
//
// 删除的最后一道确认在页面层用 `ConfirmSheet` 做（要写清「将同时删除全部账单」），
// 这里只发请求，不直接删。

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Book } from '../../core/ipc/types';
import { BottomSheet } from '../../shared/ui/BottomSheet';
import { cn } from '../../shared/utils/cn';
import { BOOK_NAME_MAX } from './assetsPage.logic';

export interface BookEditorSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** null = 新建。 */
    book: Book | null;
    busy?: boolean;
    errorMessage?: string | null;
    /** 只有一个账本时不允许删除（FR-AST-5）。 */
    deletable: boolean;
    onSubmit: (name: string) => void;
    onRequestDelete?: () => void;
}

export function BookEditorSheet({
    open,
    onOpenChange,
    book,
    busy = false,
    errorMessage,
    deletable,
    onSubmit,
    onRequestDelete,
}: BookEditorSheetProps) {
    const { t } = useTranslation();
    const [name, setName] = useState('');

    useEffect(() => {
        if (!open) return;
        setName(book?.name ?? '');
    }, [open, book]);

    const trimmed = name.trim();
    const nameLength = [...trimmed].length;
    const nameValid = nameLength >= 1 && nameLength <= BOOK_NAME_MAX;
    const canSubmit = nameValid && !busy;

    return (
        <BottomSheet
            open={open}
            onOpenChange={onOpenChange}
            title={book ? t('assets.renameBook') : t('assets.newBook')}
            description={t('assets.bookSheetDesc')}
            maxHeightRatio={0.6}
        >
            <div className="flex flex-col gap-3">
                <div>
                    <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        maxLength={BOOK_NAME_MAX}
                        placeholder={t('assets.bookNamePlaceholder')}
                        aria-label={t('assets.bookName')}
                        className={cn(
                            'h-10 w-full rounded-md border bg-field px-2.5 text-[14px] text-text',
                            'placeholder:text-text-disabled focus-visible:outline-none',
                            nameValid || trimmed === ''
                                ? 'border-border-subtle focus-visible:border-brand'
                                : 'border-danger',
                        )}
                    />
                    <p className="mt-1 text-[11px] text-text-tertiary">
                        {trimmed === '' ? t('common.required') : t('add.nameLengthCounter', { current: nameLength, max: BOOK_NAME_MAX })}
                    </p>
                </div>

                {errorMessage ? (
                    <p className="rounded-md bg-danger-soft px-2.5 py-1.5 text-[12px] text-danger">
                        {errorMessage}
                    </p>
                ) : null}

                <div className="flex items-center gap-2">
                    {book && onRequestDelete ? (
                        <button
                            type="button"
                            disabled={!deletable}
                            onClick={onRequestDelete}
                            className={cn(
                                'h-10 rounded-md px-3 text-[13px] font-medium',
                                deletable ? 'bg-inset text-danger active:bg-muted' : 'bg-inset text-text-disabled',
                            )}
                        >
                            {t('common.delete')}
                        </button>
                    ) : null}
                    <button
                        type="button"
                        disabled={!canSubmit}
                        onClick={() => onSubmit(trimmed)}
                        className={cn(
                            'h-10 flex-1 rounded-md text-[14px] font-semibold',
                            canSubmit ? 'bg-brand text-white shadow-card active:opacity-90' : 'bg-inset text-text-disabled',
                        )}
                    >
                        {busy ? t('common.saving') : book ? t('add.saveChanges') : t('assets.createBook')}
                    </button>
                </div>

                {book && !deletable ? (
                    <p className="text-[11px] text-text-tertiary">{t('assets.lastBookHint')}</p>
                ) : null}
            </div>
        </BottomSheet>
    );
}

export default BookEditorSheet;
