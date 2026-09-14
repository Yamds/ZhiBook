// 账单页 · 结余卡片：本年结余 / 本月结余 + 本期支出与收入。
//
// 年 / 月两种视图共用：标题与周期文案由页面按当前视图传入（FR-BILL-4）。

import { formatMoney, formatSignedBalance, formatSignedMoney } from '../../core/domain/money';
import { useTranslation } from 'react-i18next';
import { Card, Spinner } from '../../shared/ui';
import { cn } from '../../shared/utils/cn';

export interface BalanceCardProps {
    /** 「本年结余」/「本月结余」。 */
    title: string;
    /** 「2025 年」/「2025年9月」。 */
    periodLabel: string;
    balanceCents: number;
    expenseCents: number;
    incomeCents: number;
    isLoading: boolean;
}

export function BalanceCard({
    title,
    periodLabel,
    balanceCents,
    expenseCents,
    incomeCents,
    isLoading,
}: BalanceCardProps) {
    const { t } = useTranslation();
    return (
        <Card className="flex flex-col rounded-lg p-3.5">
            <header className="flex items-baseline justify-between">
                <h2 className="text-[13px] font-semibold text-text">{title}</h2>
                <span className="text-[11px] text-text-tertiary tabular-nums">{periodLabel}</span>
            </header>

            {isLoading ? (
                <div className="flex h-[52px] items-center">
                    <Spinner size="sm" />
                </div>
            ) : (
                <p
                    className={cn(
                        'mt-1 font-display text-[28px] leading-none font-semibold tabular-nums',
                        balanceCents < 0 ? 'text-danger' : 'text-text',
                    )}
                >
                    {formatSignedBalance(balanceCents)}
                </p>
            )}

            <div className="mt-3 grid grid-cols-2 gap-2">
                <Metric
                    label={t('stats.kind.expense')}
                    value={expenseCents > 0 ? formatSignedMoney(expenseCents, 'expense') : formatMoney(0)}
                />
                <Metric
                    label={t('stats.kind.income')}
                    value={incomeCents > 0 ? formatSignedMoney(incomeCents, 'income') : formatMoney(0)}
                />
            </div>
        </Card>
    );
}

function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex flex-col gap-0.5 rounded-md bg-inset px-2.5 py-2">
            <span className="text-[11px] text-text-tertiary">{label}</span>
            <span className="text-[14px] font-semibold text-text tabular-nums">{value}</span>
        </div>
    );
}

export default BalanceCard;
