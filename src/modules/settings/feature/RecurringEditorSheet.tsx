// 固定收支编辑器：支出/收入、金额、备注、分类、账本、账户、启用开关、删除。
//
// 新建时 `startDay = firstDueDay()`（创建时刻之后的下一个 05:00），编辑时生效日不变；
// 由停用切回启用时带上 `skipThroughDay`，跳过暂停窗口（暂停不补记）。

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UI_ICONS, toIconName } from '../../../core/design/icons';
import { categoryDisplayName, bookDisplayName } from '../../../core/domain/categoryName';
import { formatMoney } from '../../../core/domain/money';
import type { EntryKind, RecurringRule } from '../../../core/ipc/types';
import { AccountSheet } from '../../../shared/components/AccountSheet';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { BottomSheet } from '../../../shared/ui/BottomSheet';
import { ConfirmSheet } from '../../../shared/ui/ConfirmSheet';
import { SegmentedControl } from '../../../shared/ui/SegmentedControl';
import { Switch } from '../../../shared/ui/Switch';
import { TextField } from '../../../shared/ui/TextField';
import { useBooks, useCategoryLookup, useVisibleCategories } from '../../../hooks/ledger';
import { useAccounts } from '../../../hooks/ledger/useLedgerAssets';
import {
    useCreateRecurringRule,
    useDeleteRecurringRule,
    useUpdateRecurringRule,
} from '../../../hooks/ledger/useLedgerRecurring';
import { pushInfoBar } from '../../../hooks/ui/globalInfoBarStore';
import { t as translate } from '../../../core/i18n';
import { cn } from '../../../shared/utils/cn';
import {
    amountTextFromCents,
    firstDueDay,
    parseAmountText,
    scheduleLabel,
    skipThroughDay,
} from './recurring.logic';
import { RecurringCategorySheet } from './RecurringCategorySheet';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** null = 新建。 */
    rule: RecurringRule | null;
    fallbackBookId: string | undefined;
}

/** 收支类型选项（文案在语言文件里，见 `entryKind.*`）。 */
const KIND_ITEMS = [
    { value: 'expense' as EntryKind, labelKey: 'entryKind.expense' },
    { value: 'income' as EntryKind, labelKey: 'entryKind.income' },
];

function showError(error: unknown) {
    pushInfoBar({
        key: 'recurring-error',
        tone: 'danger',
        title: translate('settings.recurring.actionFailed'),
        content: error instanceof Error ? error.message : String(error),
    });
}

export function RecurringEditorSheet({ open, onOpenChange, rule, fallbackBookId }: Props) {
    const { t } = useTranslation();
    const [kind, setKind] = useState<EntryKind>('expense');
    const [amountText, setAmountText] = useState('');
    const [note, setNote] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [accountId, setAccountId] = useState<string | null>(null);
    const [bookId, setBookId] = useState<string | undefined>(fallbackBookId);
    const [enabled, setEnabled] = useState(true);
    const [categoryOpen, setCategoryOpen] = useState(false);
    const [accountOpen, setAccountOpen] = useState(false);
    const [bookOpen, setBookOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [amountInvalid, setAmountInvalid] = useState(false);

    const { expense, income } = useVisibleCategories();
    const { byId } = useCategoryLookup();
    const books = useBooks();
    const accounts = useAccounts(bookId);
    const createRule = useCreateRecurringRule();
    const updateRule = useUpdateRecurringRule();
    const deleteRule = useDeleteRecurringRule();

    const isEdit = Boolean(rule);

    // 打开时按规则重置表单。
    useEffect(() => {
        if (!open) return;
        setKind(rule?.kind ?? 'expense');
        setAmountText(rule ? amountTextFromCents(rule.amountCents) : '');
        setNote(rule?.note ?? '');
        setCategoryId(rule?.categoryId ?? '');
        setAccountId(rule?.accountId ?? null);
        setBookId(rule?.bookId ?? fallbackBookId);
        setEnabled(rule?.enabled ?? true);
        setAmountInvalid(false);
    }, [open, rule, fallbackBookId]);

    const categories = kind === 'expense' ? expense : income;
    // 分类换算：切支出/收入后原分类不在本组时，自动落到「其它」。
    const effectiveCategoryId = categories.some((item) => item.id === categoryId)
        ? categoryId
        // i18n-allow: `'其它'` 是内置分类的**落库名**（expense_other / income_other），不是界面文案。
        : (categories.find((item) => item.name === '其它') ?? categories[0])?.id ?? '';
    const selectedCategory = byId.get(effectiveCategoryId);
    const selectedAccount = (accounts.data ?? []).find((item) => item.id === accountId);
    const selectedBook = (books.data ?? []).find((item) => item.id === bookId);
    const amountCents = parseAmountText(amountText);
    const busy = createRule.isPending || updateRule.isPending || deleteRule.isPending;

    const handleSave = () => {
        if (amountCents === null) {
            setAmountInvalid(true);
            return;
        }
        if (!effectiveCategoryId) {
            pushInfoBar({ key: 'recurring-save', tone: 'danger', title: t('settings.recurring.chooseCategory') });
            return;
        }
        if (!bookId) {
            pushInfoBar({ key: 'recurring-save', tone: 'danger', title: t('settings.recurring.chooseBook') });
            return;
        }
        const payload = {
            kind,
            amountCents,
            note: note.trim(),
            categoryId: effectiveCategoryId,
            accountId,
        };
        if (isEdit && rule) {
            updateRule.mutate(
                {
                    id: rule.id,
                    ...payload,
                    enabled,
                    skipThroughDay: !rule.enabled && enabled ? skipThroughDay() : null,
                },
                { onSuccess: () => onOpenChange(false), onError: showError },
            );
        } else {
            createRule.mutate(
                { ...payload, bookId, startDay: firstDueDay() },
                {
                    onSuccess: () => {
                        onOpenChange(false);
                        pushInfoBar({ key: 'recurring-save', tone: 'success', title: t('settings.recurring.added') });
                    },
                    onError: showError,
                },
            );
        }
    };

    const handleDelete = () => {
        if (!rule) return;
        deleteRule.mutate(rule.id, {
            onSuccess: () => {
                setDeleteOpen(false);
                onOpenChange(false);
                pushInfoBar({ key: 'recurring-delete', tone: 'success', title: t('settings.recurring.deleted') });
            },
            onError: showError,
        });
    };

    return (
        <>
            <BottomSheet
                open={open}
                onOpenChange={onOpenChange}
                title={isEdit ? t('settings.recurring.editTitle') : t('settings.recurring.addTitle')}
                description={scheduleLabel()}
            >
                <div className="flex flex-col gap-5">
                    <SegmentedControl
                        items={KIND_ITEMS.map((item) => ({ value: item.value, label: t(item.labelKey) }))}
                        value={kind}
                        onChange={(value) => setKind(value)}
                        ariaLabel={t('settings.recurring.kindAria')}
                    />

                    <TextField
                        label={t('add.amount')}
                        inputMode="decimal"
                        placeholder="0.00"
                        value={amountText}
                        onValueChange={(value) => {
                            setAmountText(value);
                            setAmountInvalid(false);
                        }}
                        error={amountInvalid ? t('add.amountInvalid') : undefined}
                        hint={amountCents ? formatMoney(amountCents) : undefined}
                    />

                    <TextField
                        label={t('add.note')}
                        placeholder={t('common.optional')}
                        maxLength={64}
                        value={note}
                        onValueChange={setNote}
                    />

                    {!isEdit ? (
                        <SettingRow
                            label={t('settings.recurring.book')}
                            value={selectedBook ? bookDisplayName(selectedBook, t, t('common.pleaseChoose')) : t('common.pleaseChoose')}
                            onClick={() => setBookOpen(true)}
                        />
                    ) : null}

                    <SettingRow
                        label={t('settings.recurring.category')}
                        value={categoryDisplayName(selectedCategory, t, t('common.pleaseChoose'))}
                        icon={selectedCategory ? toIconName(selectedCategory.iconName) : undefined}
                        onClick={() => setCategoryOpen(true)}
                    />

                    <SettingRow
                        label={t('add.account')}
                        value={selectedAccount?.name ?? t('add.accountUnspecified')}
                        onClick={() => setAccountOpen(true)}
                    />

                    {isEdit ? (
                        <div className="flex items-center justify-between rounded-md bg-inset px-3 py-3">
                            <div>
                                <p className="text-[13px] font-medium text-text">{t('settings.recurring.enabled')}</p>
                                <p className="mt-0.5 text-[11.5px] text-text-tertiary">
                                    {t('settings.recurring.enabledDesc')}
                                </p>
                            </div>
                            <Switch checked={enabled} onCheckedChange={setEnabled} />
                        </div>
                    ) : null}

                    <button
                        type="button"
                        disabled={busy}
                        onClick={handleSave}
                        className={cn(
                            'h-11 rounded-md bg-brand text-[14px] font-semibold text-white',
                            busy ? 'opacity-60' : 'active:opacity-90',
                        )}
                    >
                        {busy ? t('common.saving') : t('common.save')}
                    </button>

                    {isEdit ? (
                        <button
                            type="button"
                            onClick={() => setDeleteOpen(true)}
                            className="h-11 rounded-md bg-danger/10 text-[14px] font-medium text-danger active:opacity-80"
                        >
                            {t('settings.recurring.deleteThis')}
                        </button>
                    ) : null}
                </div>
            </BottomSheet>

            <RecurringCategorySheet
                open={categoryOpen}
                onOpenChange={setCategoryOpen}
                kind={kind}
                categories={categories}
                value={effectiveCategoryId}
                onSelect={setCategoryId}
            />

            <AccountSheet
                open={accountOpen}
                onOpenChange={setAccountOpen}
                accounts={accounts.data ?? []}
                value={accountId}
                onSelect={setAccountId}
            />

            <BottomSheet
                open={bookOpen}
                onOpenChange={setBookOpen}
                title={t('settings.recurring.chooseBook')}
                maxHeightRatio={0.6}
            >
                <div className="flex flex-col gap-2">
                    {(books.data ?? []).map((book) => {
                        const selected = book.id === bookId;
                        return (
                            <button
                                key={book.id}
                                type="button"
                                onClick={() => {
                                    setBookId(book.id);
                                    setAccountId(null);
                                    setBookOpen(false);
                                }}
                                className={cn(
                                    'flex h-11 items-center rounded-md px-3 text-left text-[13px] active:bg-muted',
                                    selected ? 'bg-brand-soft font-medium text-brand' : 'bg-inset text-text',
                                )}
                            >
                                {bookDisplayName(book, t, book.name)}
                                {selected ? (
                                    <AppIcon name={UI_ICONS.check} size={15} className="ml-auto" />
                                ) : null}
                            </button>
                        );
                    })}
                </div>
            </BottomSheet>

            <ConfirmSheet
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title={t('settings.recurring.deleteConfirmTitle')}
                description={t('settings.recurring.deleteConfirmBody')}
                busy={deleteRule.isPending}
                onConfirm={handleDelete}
            />
        </>
    );
}

function SettingRow({
    label,
    value,
    icon,
    onClick,
}: {
    label: string;
    value: string;
    icon?: Parameters<typeof AppIcon>[0]['name'];
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex h-11 items-center gap-2.5 rounded-md bg-inset px-3 text-left active:bg-muted"
        >
            {icon ? <AppIcon name={icon} size={16} className="text-text-secondary" /> : null}
            <span className="text-[13px] text-text-secondary">{label}</span>
            <span className="ml-auto truncate text-[13px] font-medium text-text">{value}</span>
            <AppIcon name={UI_ICONS.chevronRight} size={14} className="text-text-tertiary" />
        </button>
    );
}

export default RecurringEditorSheet;
