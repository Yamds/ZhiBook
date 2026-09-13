// 添加页：3 次以内完成一笔记账（BRD 4.1 FR-ADD-1 ~ 18）。
//
// 组合关系：
//   AddPage            状态编排（收支 / 分类 / 金额 / 日期 / 账户 / 附件 / 保存）
//   CategoryGrid       分类宫格 + 编辑模式 + 拖动排序
//   AmountPanel        备注 / 附图入口 / 账户入口 / 金额显示
//   Keypad             4×4 数字键盘
//   DateSheet          月历选日期
//   AccountSheet       账户选择
//   CategoryEditorSheet分类新增 / 编辑
//   ConfirmSheet       删除确认
//
// 记住上次选择（分类按收支分组、账户一个）走 addEntryPrefsStore。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseDayKey, toDayKey, todayDate, todayKey, type CalendarDate } from '../../core/domain/date';
import { isSubmittableAmount, parseAmountExpression, tryAppendKeypadKey, type KeypadKey } from '../../core/domain/money';
import type { Category, EntryKind } from '../../core/ipc/types';
import { addEntryPrefsStore, useAddEntryPrefs } from '../../hooks/preferences/addEntryPrefsStore';
import {
    useCreateCategory,
    useHideCategory,
    useReorderCategories,
    useUpdateCategory,
    useVisibleCategories,
} from '../../hooks/ledger/useLedgerCategories';
import { useCurrentBook } from '../../hooks/ledger/useLedgerBooks';
import { useAccounts } from '../../hooks/ledger/useLedgerAssets';
import { useCreateTransaction, useSaveAttachment, useTransactionsByDay } from '../../hooks/ledger';
import { pushInfoBar } from '../../hooks/ui/globalInfoBarStore';
import { usePageBackHandler } from '../../app/pageBackHandler';
import { clearNavigationIntent, useNavigation, useRetapHandler } from '../../app/navigationStore';
import { SegmentedControl } from '../../shared/ui';
import { AccountSheet } from './AccountSheet';
import { AmountPanel } from './AmountPanel';
import { AttachmentsRow } from './AttachmentsRow';
import { CategoryEditorSheet, type CategoryDraft } from './CategoryEditorSheet';
import { CategoryGrid } from './CategoryGrid';
import { ConfirmSheet } from './ConfirmSheet';
import { DateSheet } from './DateSheet';
import { Keypad } from './Keypad';
import { describeError, occurredAtMs, shortDateLabel } from './addPage.logic';
import { MAX_ATTACHMENTS, prepareImage, remainingAttachmentSlots, type PendingAttachment } from './image';

type SheetKind = 'date' | 'account' | 'category';

export function AddPage() {
    const navigation = useNavigation();
    const prefs = useAddEntryPrefs();
    const { currentBook } = useCurrentBook();
    const bookId = currentBook?.id;

    const { expense, income } = useVisibleCategories();
    const { data: accounts = [] } = useAccounts(bookId);

    const createTransaction = useCreateTransaction();
    const saveAttachment = useSaveAttachment();
    const createCategory = useCreateCategory();
    const updateCategory = useUpdateCategory();
    const hideCategory = useHideCategory();
    const reorderCategories = useReorderCategories();

    const [kind, setKind] = useState<EntryKind>('expense');
    /** null = 用记忆值 / 该组第一个；显式点选后覆盖。 */
    const [categoryOverride, setCategoryOverride] = useState<string | null>(null);
    const [accountOverride, setAccountOverride] = useState<{ id: string | null } | null>(null);
    const [expression, setExpression] = useState('');
    const [note, setNote] = useState('');
    const [date, setDate] = useState<CalendarDate>(() => todayDate());
    const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
    const [submitting, setSubmitting] = useState(false);

    const [editing, setEditing] = useState(false);
    const [sheet, setSheet] = useState<SheetKind | null>(null);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [categoryError, setCategoryError] = useState<string | null>(null);
    const [pendingDelete, setPendingDelete] = useState<Category | null>(null);
    const [deleting, setDeleting] = useState(false);

    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // 今日已记笔数：既是给小字提示，也是真机验收时「数据真的落库了」的可见证据
    const today = todayKey();
    const { data: todayTransactions = [] } = useTransactionsByDay(bookId, today);

    const categories = kind === 'expense' ? expense : income;

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
            if (picked === null || accounts.some((item) => item.id === picked)) return picked;
        }
        const remembered = prefs.lastAccountId;
        if (remembered && accounts.some((item) => item.id === remembered)) return remembered;
        return null;
    }, [accountOverride, accounts, prefs.lastAccountId]);

    const parsed = useMemo(() => parseAmountExpression(expression), [expression]);
    const amountCents = parsed.ok ? parsed.cents : 0;
    const amountValid = parsed.ok && isSubmittableAmount(parsed.cents);
    const canSubmit = Boolean(categoryId) && amountValid && !submitting;

    const accountName = useMemo(() => {
        if (!accountId) return '未指定账户';
        return accounts.find((item) => item.id === accountId)?.name ?? '未指定账户';
    }, [accountId, accounts]);

    // 日历点某天 → 添加页带日期（FR-ADD-18）；消费后清掉一次性意图
    const intentDate = navigation.intent?.date;
    useEffect(() => {
        if (!intentDate) return;
        const parsedDate = parseDayKey(intentDate);
        if (parsedDate) setDate(parsedDate);
        clearNavigationIntent('add');
    }, [intentDate, navigation.seq]);

    // 再次点「添加」页签：清掉已输入的金额，避免误提交上一笔
    useRetapHandler('add', () => {
        setExpression('');
        setNote('');
        setAttachments([]);
    });

    // 返回键：先关弹层 / 退出编辑模式，再交回壳
    usePageBackHandler(() => {
        if (pendingDelete) {
            setPendingDelete(null);
            return true;
        }
        if (sheet !== null) {
            setSheet(null);
            return true;
        }
        if (editing) {
            setEditing(false);
            return true;
        }
        return false;
    });

    const handleKindChange = useCallback((next: EntryKind) => {
        setKind(next);
        setCategoryOverride(null);
    }, []);

    const handleSelectCategory = useCallback((id: string) => {
        setCategoryOverride(id);
        addEntryPrefsStore.rememberCategory(kind, id);
    }, [kind]);

    const handleKey = useCallback((key: KeypadKey) => {
        setExpression((prev) => tryAppendKeypadKey(prev, key) ?? prev);
    }, []);

    const handlePickFiles = useCallback(() => {
        if (attachments.length >= MAX_ATTACHMENTS) {
            pushInfoBar({
                key: 'add-attachments-full',
                tone: 'warning',
                title: '附件已达上限',
                content: `单笔最多 ${MAX_ATTACHMENTS} 张图片`,
            });
            return;
        }
        fileInputRef.current?.click();
    }, [attachments.length]);

    const handleFilesPicked = useCallback(
        async (files: FileList | null) => {
            if (!files || files.length === 0) return;
            const slots = remainingAttachmentSlots(attachments.length);
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
        [attachments.length],
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
            const created = await createTransaction.mutateAsync({
                bookId,
                kind,
                categoryId,
                accountId,
                amountCents: parsed.cents,
                note,
                day: dayKey,
                month: dayKey.slice(0, 7),
                occurredAtMs: occurredAtMs(date),
            });
            // 附件逐张落盘（失败不回滚账单，但要明确告知）
            const failed: string[] = [];
            for (const attachment of attachments) {
                try {
                    await saveAttachment.mutateAsync({
                        transactionId: created.id,
                        mime: attachment.mime,
                        base64: attachment.base64,
                    });
                } catch (error) {
                    failed.push(describeError(error));
                }
            }
            // 保留分类 / 日期 / 账户，清空金额与备注（FR-ADD-17）
            setExpression('');
            setNote('');
            setAttachments([]);
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
        expression,
        kind,
        note,
        parsed,
        saveAttachment,
        submitting,
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
                <span className="shrink-0 text-[11px] text-text-tertiary tabular-nums">
                    今日 {todayTransactions.length} 笔
                </span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pt-3">
                <CategoryGrid
                    kind={kind}
                    categories={categories}
                    selectedId={categoryId}
                    editing={editing}
                    busy={reorderCategories.isPending}
                    onSelect={handleSelectCategory}
                    onEnterEditing={() => setEditing(true)}
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
                    onExitEditing={() => setEditing(false)}
                    onReorder={handleReorder}
                />
            </div>

            <AttachmentsRow
                attachments={attachments}
                onRemove={(localId) =>
                    setAttachments((prev) => prev.filter((item) => item.localId !== localId))
                }
            />

            <AmountPanel
                note={note}
                onNoteChange={setNote}
                attachmentCount={attachments.length}
                onPickAttachments={handlePickFiles}
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
                    addEntryPrefsStore.rememberAccount(id);
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

export default AddPage;
