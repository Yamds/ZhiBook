// 占比块（账单页环形图 + 图例 + 「其它」展开入口）。
//
// 年度卡片（最近 12 个月）与详情卡片（选中月）共用同一块：
//   - 扇区：Top10 + 「其它」合并桶（后端已合并，`merged = true`）；
//   - 图例：每项名称 + 占比，点击可高亮对应扇区；「其它」带展开箭头，
//     打开弹层看完整百分比明细（FR-BILL-9）。

import { useEffect, useState } from 'react';
import { UI_ICONS } from '../../core/design/icons';
import { formatMoney } from '../../core/domain/money';
import type { CategoryShareSet, StatsKind } from '../../core/ipc/types';
import { DonutChart } from '../../shared/charts';
import { AppIcon, EmptyState, Spinner } from '../../shared/ui';
import { cn } from '../../shared/utils/cn';
import { formatShare, shareSlices, statsKindLabel } from './billsPage.logic';

export interface ShareBlockProps {
    set: CategoryShareSet | undefined;
    kind: StatsKind;
    /** 分类 → 图表颜色（由 `shareColorMap` 统一算好，图例 / 扇区 / 展开弹层共用）。 */
    colors: ReadonlyMap<string, string>;
    isLoading: boolean;
    /** 点「其它」的展开入口。 */
    onExpand: () => void;
    className?: string;
}

export function ShareBlock({ set, kind, colors, isLoading, onExpand, className }: ShareBlockProps) {
    const [activeKey, setActiveKey] = useState<string | null>(null);
    const items = set?.items ?? [];
    const total = set?.totalCents ?? 0;

    // 换口径 / 换月后旧的高亮 key 已经不在集合里了：不清掉会让所有扇区都变淡
    useEffect(() => {
        setActiveKey(null);
    }, [set]);

    if (isLoading && items.length === 0) {
        return (
            <div className={cn('flex justify-center py-8', className)}>
                <Spinner size="sm" />
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <EmptyState
                size="compact"
                icon={UI_ICONS.bills}
                title={`还没有${statsKindLabel(kind)}数据`}
                description="记几笔之后这里会显示分类构成"
                className={className}
            />
        );
    }

    const slices = shareSlices(items, colors);
    const activeSlice = slices.find((slice) => slice.key === activeKey);
    // 结余口径的 totalCents 是「各项绝对值之和」，不是真正的结余：中心不显示它
    const isBalance = kind === 'balance';

    return (
        <div className={cn('flex flex-col gap-3', className)}>
            <div className="flex justify-center">
                <DonutChart
                    slices={slices}
                    activeKey={activeKey}
                    onSelect={(key) => setActiveKey((previous) => (previous === key ? null : key))}
                    centerLabel={
                        activeSlice
                            ? activeSlice.label
                            : isBalance
                              ? '结余构成'
                              : `${statsKindLabel(kind)}总额`
                    }
                    centerValue={
                        activeSlice
                            ? formatShare(
                                  items.find((item) => item.categoryId === activeSlice.key)?.share ?? 0,
                              )
                            : isBalance
                              ? undefined
                              : formatMoney(total)
                    }
                />
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {items.map((item, index) => {
                    const color = slices[index]?.color ?? 'var(--brand-500)';
                    const active = activeKey === item.categoryId;
                    return (
                        <button
                            key={item.categoryId}
                            type="button"
                            onClick={() => {
                                if (item.merged) {
                                    onExpand();
                                    return;
                                }
                                setActiveKey((previous) =>
                                    previous === item.categoryId ? null : item.categoryId,
                                );
                            }}
                            className={cn(
                                'flex min-w-0 items-center gap-1.5 rounded-sm px-1 py-1 text-left',
                                'active:bg-inset',
                                active && 'bg-brand-tint',
                            )}
                        >
                            <span
                                aria-hidden
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ background: color }}
                            />
                            <span className="min-w-0 flex-1 truncate text-[12px] text-text-secondary">
                                {item.name}
                            </span>
                            <span className="shrink-0 text-[11.5px] text-text-tertiary tabular-nums">
                                {formatShare(item.share)}
                            </span>
                            {item.merged ? (
                                <AppIcon
                                    name={UI_ICONS.chevronRight}
                                    size={12}
                                    className="shrink-0 text-text-disabled"
                                />
                            ) : null}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export default ShareBlock;
