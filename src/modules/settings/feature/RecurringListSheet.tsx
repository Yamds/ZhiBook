// 固定收支管理列表：当前账本的规则 + 启用开关 + 编辑入口。

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toIconName, UI_ICONS } from '../../../core/design/icons';
import { categoryDisplayName } from '../../../core/domain/categoryName';
import { formatSignedMoney } from '../../../core/domain/money';
import type { RecurringRule } from '../../../core/ipc/types';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { BottomSheet } from '../../../shared/ui/BottomSheet';
import { Switch } from '../../../shared/ui/Switch';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { useCategoryLookup } from '../../../hooks/ledger';
import { useAccounts } from '../../../hooks/ledger/useLedgerAssets';
import {
    useRecurringRules,
    useUpdateRecurringRule,
} from '../../../hooks/ledger/useLedgerRecurring';
import { pushInfoBar } from '../../../hooks/ui/globalInfoBarStore';
import { scheduleLabel, skipThroughDay } from './recurring.logic';
import { RecurringEditorSheet } from './RecurringEditorSheet';

export interface RecurringListSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    bookId: string | undefined;
}

export function RecurringListSheet({ open, onOpenChange, bookId }: RecurringListSheetProps) {
    const { t } = useTranslation();
    const { data: rules } = useRecurringRules();
    const updateRule = useUpdateRecurringRule();
    const { byId } = useCategoryLookup();
    const accounts = useAccounts(bookId);
    // undefined = 关闭编辑器；null = 新建；rule = 编辑。
    const [editing, setEditing] = useState<RecurringRule | null | undefined>(undefined);

    const bookRules = (rules ?? []).filter((rule) => rule.bookId === bookId);

    const toggle = (rule: RecurringRule) => {
        const nextEnabled = !rule.enabled;
        updateRule.mutate(
            {
                id: rule.id,
                kind: rule.kind,
                amountCents: rule.amountCents,
                note: rule.note,
                categoryId: rule.categoryId,
                accountId: rule.accountId,
                enabled: nextEnabled,
                skipThroughDay: nextEnabled ? skipThroughDay() : null,
            },
            {
                onError: (error) =>
                    pushInfoBar({
                        key: 'recurring-toggle',
                        tone: 'danger',
                        title: t('settings.recurring.actionFailed'),
                        content: error instanceof Error ? error.message : String(error),
                    }),
            },
        );
    };

    return (
        <>
            <BottomSheet
                open={open}
                onOpenChange={onOpenChange}
                title={t('settings.feature.recurring')}
                description={t('settings.recurring.sheetDesc', { schedule: scheduleLabel() })}
            >
                <div className="flex flex-col gap-2">
                    {bookRules.length === 0 ? (
                        <EmptyState
                            title={t('settings.recurring.emptyTitle')}
                            description={t('settings.recurring.emptyDesc')}
                        />
                    ) : null}

                    {bookRules.map((rule) => {
                        const category = byId.get(rule.categoryId);
                        const account = (accounts.data ?? []).find(
                            (item) => item.id === rule.accountId,
                        );
                        return (
                            <div
                                key={rule.id}
                                className="flex items-center gap-3 rounded-md bg-inset px-3 py-3"
                            >
                                <button
                                    type="button"
                                    onClick={() => setEditing(rule)}
                                    className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-70"
                                >
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-text-secondary">
                                        <AppIcon
                                            name={toIconName(category?.iconName ?? '')}
                                            size={18}
                                        />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center gap-2">
                                            <span className="truncate text-[13px] font-medium text-text">
                                                {categoryDisplayName(category, t, t('settings.recurring.unknownCategory'))}
                                            </span>
                                            <span
                                                className={
                                                    'shrink-0 text-[13px] font-semibold tabular-nums ' +
                                                    (rule.kind === 'expense'
                                                        ? 'text-danger'
                                                        : 'text-success')
                                                }
                                            >
                                                {formatSignedMoney(rule.amountCents, rule.kind)}
                                            </span>
                                        </span>
                                        <span className="mt-0.5 block truncate text-[11.5px] text-text-tertiary">
                                            {[rule.note || t('common.noNote'), account?.name ?? t('add.accountUnspecified')]
                                                .filter(Boolean)
                                                .join(t('common.dotSeparator'))}
                                        </span>
                                    </span>
                                </button>
                                <Switch checked={rule.enabled} onCheckedChange={() => toggle(rule)} />
                            </div>
                        );
                    })}

                    <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="mt-1 flex h-11 items-center justify-center gap-1.5 rounded-md border border-dashed border-border text-[13px] font-medium text-text-secondary active:opacity-70"
                    >
                        <AppIcon name={UI_ICONS.plus} size={16} />
                        {t('settings.recurring.addNew')}
                    </button>
                </div>
            </BottomSheet>

            <RecurringEditorSheet
                open={editing !== undefined}
                onOpenChange={(next) => {
                    if (!next) setEditing(undefined);
                }}
                rule={editing ?? null}
                fallbackBookId={bookId}
            />
        </>
    );
}

export default RecurringListSheet;
