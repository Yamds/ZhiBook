// 账单页 · 概览卡片：本期口径总额 + 单日最高 / 单月最高 / 平均 / 累计笔数。
//
// 月视图 → 单日最高 + 平均每日；年视图 → 单月最高 + 平均每月（FR-BILL-7 的年度对应物）。

import type { StatsKind } from '../../core/ipc/types';
import { Spinner } from '../../shared/ui';
import { cn } from '../../shared/utils/cn';
import { BillsCard } from './BillsCardParts';
import { formatKindTotal, type OverviewCell } from './billsPage.logic';

export interface OverviewCardProps {
    /** 「支出概览」。 */
    title: string;
    /** 「本月支出 · 2025年9月」。 */
    caption: string;
    totalCents: number;
    kind: StatsKind;
    cells: ReadonlyArray<OverviewCell>;
    isLoading: boolean;
}

export function OverviewCard({
    title,
    caption,
    totalCents,
    kind,
    cells,
    isLoading,
}: OverviewCardProps) {
    return (
        <BillsCard title={title}>
            {isLoading ? (
                <div className="flex justify-center py-6">
                    <Spinner size="sm" />
                </div>
            ) : (
                <>
                    <div className="flex flex-col gap-0.5">
                        <span className="text-[11.5px] text-text-tertiary">{caption}</span>
                        <span
                            className={cn(
                                'font-display text-[26px] leading-none font-semibold tabular-nums',
                                totalCents < 0 ? 'text-danger' : 'text-text',
                            )}
                        >
                            {formatKindTotal(totalCents, kind)}
                        </span>
                    </div>
                    <div className="mt-1 grid grid-cols-3 gap-2">
                        {cells.map((cell) => (
                            <div
                                key={cell.label}
                                className="flex min-w-0 flex-col gap-0.5 rounded-md bg-inset px-2 py-1.5"
                            >
                                <span className="truncate text-[10.5px] text-text-tertiary">
                                    {cell.label}
                                </span>
                                <span className="truncate text-[12.5px] font-semibold text-text tabular-nums">
                                    {cell.value}
                                </span>
                                {cell.hint ? (
                                    <span className="text-[10px] text-text-tertiary tabular-nums">
                                        {cell.hint}
                                    </span>
                                ) : null}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </BillsCard>
    );
}

export default OverviewCard;
