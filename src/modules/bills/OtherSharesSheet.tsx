// 「其它」展开弹层：把某个口径的**完整**分类占比列出来（FR-BILL-9）。
//
// 数据来自后端同一个占比集合的 `all` 字段（已按绝对值降序），
// 所以与环形图、类目排行完全同源，不会出现「展开后数字对不上」。

import { formatMoney } from '../../core/domain/money';
import type { CategoryShareSet, StatsKind } from '../../core/ipc/types';
import { BottomSheet } from '../../shared/ui/BottomSheet';
import { EmptyState } from '../../shared/ui/EmptyState';
import { formatShare, statsKindLabel } from './billsPage.logic';

export interface OtherSharesSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    set: CategoryShareSet | undefined;
    kind: StatsKind;
    /** 扇区颜色（与 ShareBlock 的图例一致）。 */
    colors: ReadonlyMap<string, string>;
}

export function OtherSharesSheet({ open, onOpenChange, set, kind, colors }: OtherSharesSheetProps) {
    const items = set?.all ?? [];
    const totalLabel = kind === 'balance' ? '合计（绝对值）' : '合计';

    return (
        <BottomSheet
            open={open}
            onOpenChange={onOpenChange}
            title={`${statsKindLabel(kind)}占比明细`}
            description={`共 ${items.length} 个分类，${totalLabel} ${formatMoney(set?.totalCents ?? 0)}`}
            maxHeightRatio={0.8}
        >
            {items.length === 0 ? (
                <EmptyState size="compact" title="没有可展开的明细" />
            ) : (
                <ul className="flex flex-col gap-1">
                    {items.map((item) => (
                        <li
                            key={item.categoryId}
                            className="flex items-center gap-2 rounded-md bg-inset px-2.5 py-2"
                        >
                            <span
                                aria-hidden
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ background: colors.get(item.categoryId) ?? 'var(--brand-500)' }}
                            />
                            <span className="min-w-0 flex-1 truncate text-[13px] text-text">
                                {item.name}
                                {item.hidden ? (
                                    <span className="ml-1 text-[10.5px] text-text-disabled">已删除</span>
                                ) : null}
                            </span>
                            <span className="shrink-0 text-[12px] text-text-secondary tabular-nums">
                                {formatMoney(item.absAmountCents)}
                            </span>
                            <span className="w-12 shrink-0 text-right text-[12px] text-text-tertiary tabular-nums">
                                {formatShare(item.share)}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </BottomSheet>
    );
}

export default OtherSharesSheet;
