// 记账表单（创建 / 编辑共用，Q3：编辑复用添加页表单）。
//
// 组合关系：
//   AddForm            状态编排（收支 / 分类 / 金额 / 日期 / 账户 / 附件 / 保存）
//   CategoryGrid       分类宫格 + 编辑模式 + 拖动排序
//   AmountPanel        备注 / 附图入口 / 账户入口 / 金额显示
//   Keypad             4×4 数字键盘
//   DateSheet          月历选日期
//   AccountSheet       账户选择
//   CategoryEditorSheet分类新增 / 编辑
//   ConfirmSheet       删除确认
//
// 两种模式：
//   editing === null  新增（记忆上次分类 / 账户，保存后清空金额与备注）
//   editing !== null  编辑（回填原值；附件删除延迟到「保存」才真正落盘）
//
// 路由级的一次性意图（带日期进入、编辑哪一条）由 AddPage 解析后传进来。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseDayKey, toDayKey, todayDate, todayKey, type CalendarDate } from '../../core/domain/date';
import { isSubmittableAmount, parseAmountExpression, tryAppendKeypadKey, type KeypadKey } from '../../core/domain/money';
import type { Category, EntryKind, Transaction } from '../../core/ipc/types';
import { addEntryPrefsStore, useAddEntryPrefs } from '../../hooks/preferences/addEntryPrefsStore';
import {
    useAttachments,
    useCategoryLookup,
    useCreateCategory,
    useCreateTransaction,
    useDeleteAttachment,
    useHideCategory,
    useReorderCategories,
    useSaveAttachment,
    useTransactionsByDay,
    useUpdateCategory,
    useUpdateTransaction,
    useVisibleCategories,
} from '../../hooks/ledger';
import { useCurrentBook } from '../../hooks/ledger/useLedgerBooks';
import { useAccounts } from '../../hooks/ledger/useLedgerAssets';
import { pushInfoBar } from '../../hooks/ui/globalInfoBarStore';
import { usePageBackHandler } from '../../app/pageBackHandler';
import { useRetapHandler } from '../../app/navigationStore';
import { SegmentedControl } from '../../shared/ui';
import type { TimeValue } from '../../shared/ui/TimePicker';
import { AccountSheet } from './AccountSheet';
import { AmountPanel } from './AmountPanel';
import { AttachmentsRow, type AttachmentStripItem } from './AttachmentsRow';
import { CategoryEditorSheet, type CategoryDraft } from './CategoryEditorSheet';
import { CategoryGrid } from './CategoryGrid';
import { ConfirmSheet } from '../../shared/ui/ConfirmSheet';
import { DateSheet } from './DateSheet';
import { Keypad } from './Keypad';
import {
    clockFromMs,
    editingFormValues,
    occurredAtMsWithTime,
    shortDateLabel,
} from './addPage.logic';
import { describeError } from '../../core/domain/errors';
import { MAX_ATTACHMENTS, prepareImage, remainingAttachmentSlots, type PendingAttachment } from './image';

type SheetKind = 'date' | 'account' | 'category';

export interface AddFormExit {
    /** 保存成功时带上账单 id：明细页返回后要滚动定位并高亮它。 */
    focusTransactionId?: string;
}

export interface AddFormProps {
    /** 编辑目标；null = 新增。 */
    editing: Transaction | null;
    /** 编辑模式的退出（保存成功或取消）：由路由层决定回哪一页。 */
    onExit?: (exit?: AddFormExit) => void;
    /** 路由一次性意图：日历点某天进入时的目标日期（YYYY-MM-DD，仅新增模式）。 */
    intentDate?: string;
}

export function AddForm({ editing, onExit, intentDate }: AddFormProps) {
    const isEditing = editing !== null;
    const prefs = useAddEntryPrefs();
    const { currentBook } = useCurrentBook();
    const bookId = currentBook?.id;

    const { expense, income } = useVisibleCategories();
    const { byId: categoryById } = useCategoryLookup();
    const { data: accounts = [] } = useAccounts(bookId);

    const createTransaction = useCreateTransaction();
    const updateTransaction = useUpdateTransaction();
    const saveAttachment = useSaveAttachment();
    const deleteAttachment = useDeleteAttachment();
    const createCategory = useCreateCategory();
    const updateCategory = useUpdateCategory();
    const hideCategory = useHideCategory();
    const reorderCategories = useReorderCategories();

    const initial = useMemo(() => (editing ? editingFormValues(editing) : null), [editing]);

    const [kind, setKind] = useState<EntryKind>(initial?.kind ?? 'expense');
    /** null = 用记忆值 / 该组第一个；显式点选后覆盖。 */
    const [categoryOverride, setCategoryOverride] = useState<string | null>(initial?.categoryId ?? null);
    const [accountOverride, setAccountOverride] = useState<{ id: string | null } | null>(
        initial ? { id: initial.accountId } : null,
    );
    const [expression, setExpression] = useState(initial?.expression ?? '');
    const [note, setNote] = useState(initial?.note ?? '');
    const [date, setDate] = useState<CalendarDate>(initial?.date ?? todayDate());
    /** 账单时分：编辑时回填原时刻，新增时默认「打开页面那一刻」。 */
    const [time, setTime] = useState<TimeValue>(() => initial?.time ?? clockFromMs(Date.now()));
    const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
    const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);

    const [gridEditing, setGridEditing] = useState(false);
    const [sheet, setSheet] = useState<SheetKind | null>(null);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [categoryError, setCategoryError] = useState<string | null>(null);
    const [pendingDelete, setPendingDelete] = useState<Category | null>(null);
    const [deleting, setDeleting] = useState(false);

    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // 今日已记笔数：新增模式的小提示，也是真机验收时「数据真的落库了」的可见证据
    const today = todayKey();
    const { data: todayTransactions = [] } = useTransactionsByDay(isEditing ? undefined : bookId, today);

    // 编辑模式下如果原分类已被软删除，把它补进宫格，避免「静默换分类」
    const baseCategories = kind === 'expense' ? expense : income;
    const categories = useMemo(() => {
        if (!editing) return baseCategories;
        const original = categoryById.get(editing.categoryId);
        if (!original || original.kind !== kind) return baseCategories;
        if (baseCategories.some((item) => item.id === original.id)) return baseCategories;
        return [...baseCategories, original];
    }, [baseCategories, categoryById, editing, kind]);

    // 分类选择：显式覆盖 > 记忆值 > 该组第一个（删除分类后自动回落，无需清状态）
    const categoryId = useMemo(() => {
        if (categoryOverride && categories.some((item) => item.id === categoryOverride)) {
            return categoryOverride;
        }
        const remembered = prefs.lastCategoryByKind[kind];
        if (remembered && categories.some((item) => item.id === remembered)) return remembered;
        return categories[0]?.id ?? null;
    }, [categoryOverride, categories, kind, prefs.lastCategoryByKind]);

    const accountId = useMemo(() => {
        if (accountOverride) {
            const picked = accountOverride.id;
            // 编辑模式原样保留（即使账户已不在列表里，也不能静默改成别的账户）
            if (isEditing || picked === null || accounts.some((item) => item.id === picked)) {
                return picked;
            }
        }
        const remembered = prefs.lastAccountId;
        if (remembered && accounts.some((item) => item.id === remembered)) return remembered;
        return null;
    }, [accountOverride, accounts, isEditing, prefs.lastAccountId]);

    // 编辑模式的既有附件（删除先记在清单里，保存时才真正删除）
    const { data: existingAttachments = [] } = useAttachments(editing?.id);
    const keptAttachments = useMemo(
        () => existingAttachments.filter((item) => !removedAttachmentIds.includes(item.id)),
        [existingAttachments, removedAttachmentIds],
    );
    const attachmentCount = attachments.length + keptAttachments.length;
    const stripItems: AttachmentStripItem[] = useMemo(
        () => [
            ...attachments.map((attachment) => ({ kind: 'pending', attachment }) as const),
            ...keptAttachments.map((attachment) => ({ kind: 'existing', attachment }) as const),
        ],
        [attachments, keptAttachments],
    );

    const parsed = useMemo(() => parseAmountExpression(expression), [expression]);
    const amountCents = parsed.ok ? parsed.cents : 0;
    const amountValid = parsed.ok && isSubmittableAmount(parsed.cents);
    const canSubmit = Boolean(categoryId) && amountValid && !submitting;

    const accountName = useMemo(() => {
        if (!accountId) return '未指定账户';
        return accounts.find((item) => item.id === accountId)?.name ?? '未指定账户';
    }, [accountId, accounts]);

    // 日历点某天 → 添加页带日期（FR-ADD-18）；编辑模式不参与
    useEffect(() => {
        if (isEditing || !intentDate) return;
        const parsedIntentDate = parseDayKey(intentDate);
        if (parsedIntentDate) setDate(parsedIntentDate);
    }, [intentDate, isEditing]);

    // 再次点「添加」页签：清掉已输入的金额，避免误提交上一笔（编辑模式不动）
    useRetapHandler('add', () => {
        if (isEditing) return;
        setExpression('');
        setNote('');
        setAttachments([]);
    });

    // 返回键：先关弹层 / 退出分类编辑模式，再退出编辑
    usePageBackHandler(() => {
        if (pendingDelete) {
            setPendingDelete(null);
            return true;
        }
        if (sheet !== null) {
            setSheet(null);
            return true;
        }
        if (gridEditing) {
            setGridEditing(false);
            return true;
        }
        if (isEditing) {
            onExit?.();
            return true;
        }
        return false;
    });

    const handleKindChange = useCallback((next: EntryKind) => {
        setKind(next);
        setCategoryOverride(null);
    }, []);

    const handleSelectCategory = useCallback(
        (id: string) => {
            setCategoryOverride(id);
            if (!isEditing) addEntryPrefsStore.rememberCategory(kind, id);
        },
        [isEditing, kind],
    );

    const handleKey = useCallback((key: KeypadKey) => {
        setExpression((prev) => tryAppendKeypadKey(prev, key) ?? prev);
    }, []);

    const handlePickFiles = useCallback(() => {
        if (attachmentCount >= MAX_ATTACHMENTS) {
            pushInfoBar({
                key: 'add-attachments-full',
                tone: 'warning',
                title: '附件已达上限',
                content: `单笔最多 ${MAX_ATTACHMENTS} 张图片`,
            });
            return;
        }
        fileInputRef.current?.click();
    }, [attachmentCount]);

    const handleFilesPicked = useCallback(
        async (files: FileList | null) => {
            if (!files || files.length === 0) return;
            const slots = remainingAttachmentSlots(attachmentCount);
            const picked = Array.from(files).slice(0, slots);
            if (Array.from(files).length > slots) {
                pushInfoBar({
                    key: 'add-attachments-trim',
                    tone: 'warning',
                    title: `只添加了前 ${slots} 张`,
                    content: `单笔最多 ${MAX_ATTACHMENTS} 张图片`,
                });
            }
            const prepared: PendingAttachment[] = [];
            for (const file of picked) {
                try {
                    prepared.push(await prepareImage(file));
                } catch (error) {
                    pushInfoBar({
                        key: 'add-image-error',
                        tone: 'danger',
                        title: '图片处理失败',
                        content: describeError(error),
                    });
                }
            }
            if (prepared.length > 0) {
                setAttachments((prev) => [...prev, ...prepared]);
            }
        },
        [attachmentCount],
    );

    const handleRemoveStripItem = useCallback(
        (key: string) => {
            if (attachments.some((item) => item.localId === key)) {
                setAttachments((prev) => prev.filter((item) => item.localId !== key));
                return;
            }
            setRemovedAttachmentIds((prev) => (prev.includes(key) ? prev : [...prev, key]));
        },
        [attachments],
    );

    const handleSubmit = useCallback(async () => {
        if (submitting) return;
        if (!bookId) {
            pushInfoBar({ key: 'add-no-book', tone: 'danger', title: '账本还没准备好', content: '请稍后重试' });
            return;
        }
        if (!categoryId) {
            pushInfoBar({ key: 'add-no-category', tone: 'warning', title: '先选一个分类' });
            return;
        }
        if (!parsed.ok || !isSubmittableAmount(parsed.cents)) {
            pushInfoBar({
                key: 'add-bad-amount',
                tone: 'warning',
                title: '金额不正确',
                content:
                    expression.trim() === ''
                        ? '请输入金额'
                        : '金额需大于 0 且不超过 ¥ 999,999,999.99',
            });
            return;
        }

        setSubmitting(true);
        const dayKey = toDayKey(date);
        try {
            let transactionId: string;
            if (editing) {
                await updateTransaction.mutateAsync({
                    id: editing.id,
                    kind,
                    categoryId,
                    accountId,
                    amountCents: parsed.cents,
                    note,
                    day: dayKey,
                    month: dayKey.slice(0, 7),
                    occurredAtMs: occurredAtMsWithTime(date, time),
                });
                transactionId = editing.id;
            } else {
                const created = await createTransaction.mutateAsync({
                    bookId,
                    kind,
                    categoryId,
                    accountId,
                    amountCents: parsed.cents,
                    note,
                    day: dayKey,
                    month: dayKey.slice(0, 7),
                    occurredAtMs: occurredAtMsWithTime(date, time),
                });
                transactionId = created.id;
            }

            // 附件：先删被移除的，再逐张落盘新增的（失败不回滚账单，但要明确告知）
            const failed: string[] = [];
            for (const id of removedAttachmentIds) {
                try {
                    await deleteAttachment.mutateAsync(id);
                } catch (error) {
                    failed.push(describeError(error));
                }
            }
            for (const attachment of attachments) {
                try {
                    await saveAttachment.mutateAsync({
                        transactionId,
                        mime: attachment.mime,
                        base64: attachment.base64,
                    });
                } catch (error) {
                    failed.push(describeError(error));
                }
            }

            if (editing) {
                pushInfoBar(
                    failed.length > 0
                        ? {
                              key: 'edit-entry',
                              tone: 'warning',
                              title: `已保存，但 ${failed.length} 张图片没处理好`,
                              content: failed[0],
                          }
                        : { key: 'edit-entry', tone: 'success', title: '已保存修改' },
                );
                onExit?.({ focusTransactionId: editing.id });
                return;
            }

            // 新增：保留分类 / 日期 / 账户，清空金额与备注（FR-ADD-17）；
            // 时间重置为保存那一刻（连记下一笔时不该沿用上一笔的时刻）
            setExpression('');
            setNote('');
            setAttachments([]);
            setTime(clockFromMs(Date.now()));
            if (failed.length > 0) {
                pushInfoBar({
                    key: 'add-entry',
                    tone: 'warning',
                    title: `已记一笔，但 ${failed.length} 张图片没存上`,
                    content: `${failed[0]}（可重新添加图片再存一次）`,
                });
            } else {
                pushInfoBar({
                    key: 'add-entry',
                    tone: 'success',
                    title: '已记一笔',
                    content: attachments.length > 0 ? `含 ${attachments.length} 张图片` : undefined,
                });
            }
        } catch (error) {
            pushInfoBar({
                key: 'add-entry-error',
                tone: 'danger',
                title: '保存失败',
                content: describeError(error),
            });
        } finally {
            setSubmitting(false);
        }
    }, [
        accountId,
        attachments,
        bookId,
        categoryId,
        createTransaction,
        date,
        deleteAttachment,
        editing,
        expression,
        kind,
        note,
        onExit,
        parsed,
        removedAttachmentIds,
        saveAttachment,
        submitting,
        time,
        updateTransaction,
    ]);

    const handleCategorySubmit = useCallback(
        async (draft: CategoryDraft) => {
            setCategoryError(null);
            try {
                if (editingCategory) {
                    await updateCategory.mutateAsync({
                        id: editingCategory.id,
                        name: draft.name,
                        iconName: draft.iconName,
                        color: draft.color,
                    });
                    pushInfoBar({ key: 'category-saved', tone: 'success', title: '分类已更新' });
                } else {
                    const created = await createCategory.mutateAsync({
                        kind,
                        name: draft.name,
                        iconName: draft.iconName,
                        color: draft.color,
                    });
                    setCategoryOverride(created.id);
                    addEntryPrefsStore.rememberCategory(kind, created.id);
                    pushInfoBar({ key: 'category-saved', tone: 'success', title: '分类已创建' });
                }
                setSheet(null);
                setEditingCategory(null);
            } catch (error) {
                setCategoryError(describeError(error));
            }
        },
        [createCategory, editingCategory, kind, updateCategory],
    );

    const handleDeleteCategory = useCallback(async () => {
        if (!pendingDelete) return;
        setDeleting(true);
        try {
            await hideCategory.mutateAsync(pendingDelete.id);
            pushInfoBar({
                key: 'category-deleted',
                tone: 'success',
                title: '分类已删除',
                content: '历史账单仍保留这个分类',
            });
            setPendingDelete(null);
            setSheet(null);
            setEditingCategory(null);
        } catch (error) {
            pushInfoBar({
                key: 'category-delete-error',
                tone: 'danger',
                title: '删除失败',
                content: describeError(error),
            });
        } finally {
            setDeleting(false);
        }
    }, [hideCategory, pendingDelete]);

    const handleReorder = useCallback(
        (orderedIds: string[]) => {
            reorderCategories.mutate({ kind, ids: orderedIds });
        },
        [kind, reorderCategories],
    );

    return (
        <section className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 items-center gap-2 px-3 pt-5">
                <SegmentedControl
                    className="flex-1"
                    items={[
                        { value: 'expense', label: '支出' },
                        { value: 'income', label: '收入' },
                    ]}
                    value={kind}
                    onChange={handleKindChange}
                    ariaLabel="收支切换"
                />
                {isEditing ? (
                    <button
                        type="button"
                        onClick={() => onExit?.()}
                        className="shrink-0 rounded-pill bg-inset px-3 py-1 text-[12px] font-medium text-text-secondary active:bg-muted"
                    >
                        取消
                    </button>
                ) : (
                    <span className="shrink-0 text-[11px] text-text-tertiary tabular-nums">
                        今日 {todayTransactions.length} 笔
                    </span>
                )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pt-3">
                <CategoryGrid
                    kind={kind}
                    categories={categories}
                    selectedId={categoryId}
                    editing={gridEditing}
                    busy={reorderCategories.isPending}
                    onSelect={handleSelectCategory}
                    onEnterEditing={() => setGridEditing(true)}
                    onEditCategory={(category) => {
                        setCategoryError(null);
                        setEditingCategory(category);
                        setSheet('category');
                    }}
                    onDeleteCategory={(category) => setPendingDelete(category)}
                    onCreateCategory={() => {
                        setCategoryError(null);
                        setEditingCategory(null);
                        setSheet('category');
                    }}
                    onExitEditing={() => setGridEditing(false)}
                    onReorder={handleReorder}
                />
            </div>

            <AttachmentsRow items={stripItems} onRemove={handleRemoveStripItem} />

            <AmountPanel
                note={note}
                onNoteChange={setNote}
                attachmentCount={attachmentCount}
                onPickAttachments={handlePickFiles}
                time={time}
                onTimeChange={setTime}
                expression={expression}
                amountCents={amountCents}
                amountValid={amountValid}
                accountName={accountName}
                onPickAccount={() => setSheet('account')}
            />

            <Keypad
                dateLabel={shortDateLabel(date)}
                canSubmit={canSubmit}
                submitting={submitting}
                onKey={handleKey}
                onPickDate={() => setSheet('date')}
                onSubmit={() => void handleSubmit()}
                submitLabel={isEditing ? '保存' : '完成'}
            />

            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                    void handleFilesPicked(event.target.files);
                    event.target.value = '';
                }}
            />

            <DateSheet
                open={sheet === 'date'}
                onOpenChange={(open) => setSheet(open ? 'date' : null)}
                value={date}
                onSelect={setDate}
            />
            <AccountSheet
                open={sheet === 'account'}
                onOpenChange={(open) => setSheet(open ? 'account' : null)}
                accounts={accounts}
                value={accountId}
                onSelect={(id) => {
                    setAccountOverride({ id });
                    if (!isEditing) addEntryPrefsStore.rememberAccount(id);
                }}
            />
            <CategoryEditorSheet
                open={sheet === 'category'}
                onOpenChange={(open) => {
                    setSheet(open ? 'category' : null);
                    if (!open) setCategoryError(null);
                }}
                kind={kind}
                category={editingCategory}
                busy={createCategory.isPending || updateCategory.isPending}
                errorMessage={categoryError}
                onSubmit={(draft) => void handleCategorySubmit(draft)}
                onRequestDelete={() => editingCategory && setPendingDelete(editingCategory)}
            />
            <ConfirmSheet
                open={pendingDelete !== null}
                onOpenChange={(open) => {
                    if (!open) setPendingDelete(null);
                }}
                title={`删除分类「${pendingDelete?.name ?? ''}」？`}
                description="分类会被隐藏，宫格里不再出现；历史账单仍保留这个分类，统计不受影响。"
                busy={deleting}
                onConfirm={() => void handleDeleteCategory()}
            />
        </section>
    );
}

export default AddForm;
