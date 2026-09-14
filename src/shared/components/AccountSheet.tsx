// 账户选择弹层（BRD FR-AST-9）：可留空（未指定账户），其余按资产 / 负债分组列出。

import type { Account } from '../../core/ipc/types';
import { useTranslation } from 'react-i18next';
import { UI_ICONS, toIconName } from '../../core/design/icons';
import { formatMoney } from '../../core/domain/money';
import { AppIcon } from '../../shared/ui/AppIcon';
import { BottomSheet } from '../../shared/ui/BottomSheet';
import { cn } from '../../shared/utils/cn';

export interface AccountSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    accounts: ReadonlyArray<Account>;
    /** null = 未指定账户。 */
    value: string | null;
    onSelect: (accountId: string | null) => void;
}

export function AccountSheet({ open, onOpenChange, accounts, value, onSelect }: AccountSheetProps) {
    const { t } = useTranslation();
    const assets = accounts.filter((account) => account.kind === 'asset');
    const liabilities = accounts.filter((account) => account.kind === 'liability');

    const pick = (accountId: string | null) => {
        onSelect(accountId);
        onOpenChange(false);
    };

    return (
        <BottomSheet
            open={open}
            onOpenChange={onOpenChange}
            title={t('add.accountSheetTitle')}
            description={t('add.accountSheetDesc')}
        >
            <div className="flex flex-col gap-3">
                <button
                    type="button"
                    onClick={() => pick(null)}
                    className={cn(
                        'flex h-11 items-center gap-2 rounded-md px-3 text-left text-[13px]',
                        value === null ? 'bg-brand-soft text-brand' : 'bg-inset text-text-secondary',
                        'active:bg-muted',
                    )}
                >
                    <AppIcon name={UI_ICONS.dot} size={8} />
                    {t('add.accountUnspecified')}
                    {value === null ? <AppIcon name={UI_ICONS.check} size={15} className="ml-auto" /> : null}
                </button>

                {accounts.length === 0 ? (
                    <p className="px-1 text-[12px] leading-relaxed text-text-tertiary">
                        {t('add.accountSheetEmpty')}
                    </p>
                ) : null}

                <AccountGroup
                    title={t('assets.assetsSection')}
                    accounts={assets}
                    value={value}
                    onPick={pick}
                />
                <AccountGroup
                    title={t('assets.liabilitiesSection')}
                    accounts={liabilities}
                    value={value}
                    onPick={pick}
                />
            </div>
        </BottomSheet>
    );
}

function AccountGroup({
    title,
    accounts,
    value,
    onPick,
}: {
    title: string;
    accounts: ReadonlyArray<Account>;
    value: string | null;
    onPick: (id: string) => void;
}) {
    if (accounts.length === 0) return null;
    return (
        <section className="flex flex-col gap-1">
            <h3 className="px-1 text-[11px] font-medium text-text-tertiary">{title}</h3>
            {accounts.map((account) => {
                const selected = account.id === value;
                return (
                    <button
                        key={account.id}
                        type="button"
                        onClick={() => onPick(account.id)}
                        className={cn(
                            'flex h-11 items-center gap-2.5 rounded-md px-3 text-left active:bg-muted',
                            selected ? 'bg-brand-soft' : 'bg-inset',
                        )}
                    >
                        <AppIcon
                            name={toIconName(account.iconName)}
                            size={17}
                            className={selected ? 'text-brand' : 'text-text-secondary'}
                        />
                        <span
                            className={cn(
                                'min-w-0 flex-1 truncate text-[13px]',
                                selected ? 'font-medium text-brand' : 'text-text',
                            )}
                        >
                            {account.name}
                        </span>
                        <span
                            className={cn(
                                'shrink-0 text-[12px] tabular-nums',
                                account.balanceCents < 0 ? 'text-danger' : 'text-text-secondary',
                            )}
                        >
                            {formatMoney(account.balanceCents)}
                        </span>
                        {selected ? <AppIcon name={UI_ICONS.check} size={15} className="text-brand" /> : null}
                    </button>
                );
            })}
        </section>
    );
}

export default AccountSheet;
