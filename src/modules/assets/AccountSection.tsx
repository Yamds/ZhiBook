// 账户区（FR-AST-7 / FR-AST-8 / FR-AST-10）：资产 / 负债两组，行内显示余额。
//
// 余额由后端算（`list_accounts` 按账户类型把关联账单折算成增减），前端只负责展示：
// 负余额给危险色提示但不报错；点行打开编辑器（改名 / 改类型 / 图标 / 颜色 / 初始余额 / 删除）。

import type { Account } from '../../core/ipc/types';
import { useTranslation } from 'react-i18next';
import { UI_ICONS, toIconName } from '../../core/design/icons';
import { formatMoney } from '../../core/domain/money';
import { categoryColors } from '../../core/design/categoryColor';
import { CATEGORY_VISUAL_TOKENS, useThemeTokens } from '../../hooks/theme/useThemeTokens';
import { AppIcon } from '../../shared/ui/AppIcon';
import { Card, EmptyState } from '../../shared/ui';
import { cn } from '../../shared/utils/cn';
import { isNegativeBalance, sumBalances } from './assetsPage.logic';

export interface AccountSectionProps {
    assets: readonly Account[];
    liabilities: readonly Account[];
    isLoading: boolean;
    /** 新建账户：带上默认类型（点哪一组的 + 就用哪种）。 */
    onCreate: (kind: 'asset' | 'liability') => void;
    onEdit: (account: Account) => void;
}

export function AccountSection({
    assets,
    liabilities,
    isLoading,
    onCreate,
    onEdit,
}: AccountSectionProps) {
    const { t } = useTranslation();
    const { brand, surface } = useThemeTokens(CATEGORY_VISUAL_TOKENS);
    const totalAssets = sumBalances(assets);
    const totalLiabilities = sumBalances(liabilities);
    const empty = assets.length === 0 && liabilities.length === 0;

    return (
        <Card className="flex flex-col gap-2 rounded-lg p-3.5">
            <header className="flex items-center justify-between gap-2">
                <h2 className="text-[13px] font-semibold text-text">{t('assets.accountsSection')}</h2>
                <button
                    type="button"
                    onClick={() => onCreate('asset')}
                    className="inline-flex h-7 items-center gap-1 rounded-pill bg-brand-soft px-2.5 text-[11.5px] font-medium text-brand active:opacity-80"
                >
                    <AppIcon name={UI_ICONS.plus} size={13} />
                    {t('assets.newAccount')}
                </button>
            </header>

            {isLoading ? (
                <p className="py-6 text-center text-[12px] text-text-tertiary">{t('assets.loadingAccounts')}</p>
            ) : empty ? (
                <EmptyState
                    size="compact"
                    icon={UI_ICONS.assets}
                    title={t('assets.noAccounts')}
                    description={t('assets.noAccountsDesc')}
                />
            ) : (
                <div className="flex flex-col gap-3">
                    <AccountGroup
                        title={t('assets.assetAccounts')}
                        hint={t('assets.assetAccountsHint')}
                        accounts={assets}
                        totalCents={totalAssets}
                        brand={brand}
                        surface={surface}
                        onCreate={() => onCreate('asset')}
                        onEdit={onEdit}
                    />
                    <AccountGroup
                        title={t('assets.liabilityAccounts')}
                        hint={t('assets.liabilityAccountsHint')}
                        accounts={liabilities}
                        totalCents={totalLiabilities}
                        brand={brand}
                        surface={surface}
                        onCreate={() => onCreate('liability')}
                        onEdit={onEdit}
                        tone="liability"
                    />
                </div>
            )}
        </Card>
    );
}

function AccountGroup({
    title,
    hint,
    accounts,
    totalCents,
    brand,
    surface,
    onCreate,
    onEdit,
    tone = 'asset',
}: {
    title: string;
    hint: string;
    accounts: readonly Account[];
    totalCents: number;
    brand: string;
    surface: string;
    onCreate: () => void;
    onEdit: (account: Account) => void;
    tone?: 'asset' | 'liability';
}) {
    const { t } = useTranslation();
    return (
        <section className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2">
                <span className="flex items-baseline gap-1.5">
                    <span className="text-[12px] font-medium text-text-secondary">{title}</span>
                    <span className="text-[11px] text-text-disabled">{hint}</span>
                </span>
                <span
                    className={cn(
                        'text-[12.5px] font-medium tabular-nums',
                        isNegativeBalance(totalCents) && 'text-danger',
                        !isNegativeBalance(totalCents) && 'text-text',
                    )}
                >
                    {formatMoney(totalCents)}
                </span>
            </div>

            {accounts.length === 0 ? (
                <button
                    type="button"
                    onClick={onCreate}
                    className="flex h-10 items-center justify-center rounded-md border border-dashed border-border-subtle text-[12px] text-text-tertiary active:bg-inset"
                >
                    {tone === 'liability' ? t('assets.addLiabilityAccount') : t('assets.addAssetAccount')}
                </button>
            ) : (
                <div className="flex flex-col divide-y divide-border-subtle/70">
                    {accounts.map((account) => (
                        <AccountRow
                            key={account.id}
                            account={account}
                            brand={brand}
                            surface={surface}
                            onClick={() => onEdit(account)}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}

function AccountRow({
    account,
    brand,
    surface,
    onClick,
}: {
    account: Account;
    brand: string;
    surface: string;
    onClick: () => void;
}) {
    const colors = categoryColors(account.color, brand, surface);
    const negative = isNegativeBalance(account.balanceCents);

    return (
        <button
            type="button"
            onClick={onClick}
            data-account-id={account.id}
            className="flex items-center gap-2.5 py-2 text-left active:bg-inset"
        >
            <span
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{ background: colors.background, color: colors.foreground }}
            >
                <AppIcon name={toIconName(account.iconName)} size={16} />
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-text">{account.name}</span>
            {negative ? (
                <span className="shrink-0 rounded-pill bg-danger-soft px-1.5 py-0.5 text-[10px] font-medium text-danger">
                    余额为负
                </span>
            ) : null}
            <span
                className={cn(
                    'shrink-0 text-[13px] font-medium tabular-nums',
                    negative ? 'text-danger' : 'text-text',
                )}
            >
                {formatMoney(account.balanceCents)}
            </span>
        </button>
    );
}

export default AccountSection;
