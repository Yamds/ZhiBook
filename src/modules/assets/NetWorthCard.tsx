// 净资产卡片（FR-AST-1 / FR-AST-2 / FR-AST-6 / FR-AST-11）。
//
// 收起态：净资产 + 总资产 / 负债两条差距条（共用刻度，长度差即「差距」）。
// 展开态：口径切换（净资产 / 总资产 / 负债）+ 按月折线（当月按今日口径，Rust 侧算好）。
// 点标题行来回切；展开后标题行仍是唯一的开关，卡内控件不会被误当成「翻卡」。

import { useState } from 'react';
import type { AssetsOverview } from '../../core/ipc/types';
import { formatMoney } from '../../core/domain/money';
import { UI_ICONS } from '../../core/design/icons';
import { AppIcon } from '../../shared/ui/AppIcon';
import { Card, EmptyState, SegmentedControl, Spinner } from '../../shared/ui';
import { LineChart } from '../../shared/charts/LineChart';
import { DisparityBar } from '../../shared/charts/DisparityBar';
import { cn } from '../../shared/utils/cn';
import {
    DEFAULT_TREND_KIND,
    TREND_KINDS,
    TREND_TONES,
    disparityScale,
    trendPoints,
    type TrendKind,
} from './assetsPage.logic';

export interface NetWorthCardProps {
    overview: AssetsOverview | undefined;
    isLoading: boolean;
    /** 有没有账户：一个都没有时给「先建账户」的引导，而不是一排 0。 */
    hasAccounts: boolean;
}

export function NetWorthCard({ overview, isLoading, hasAccounts }: NetWorthCardProps) {
    const [open, setOpen] = useState(false);
    const [kind, setKind] = useState<TrendKind>(DEFAULT_TREND_KIND);

    const netCents = overview?.netCents ?? 0;
    const assetCents = overview?.totalAssetCents ?? 0;
    const liabilityCents = overview?.liabilityCents ?? 0;
    const scale = disparityScale(assetCents, liabilityCents);
    const points = trendPoints(overview?.trend ?? [], kind);

    return (
        <Card className="flex flex-col gap-3 rounded-lg p-3.5">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                aria-expanded={open}
                className="flex flex-col gap-1 rounded-md text-left active:opacity-80"
            >
                <span className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-text">净资产</span>
                    <span className="flex items-center gap-1 text-[11.5px] text-text-tertiary">
                        {open ? '收起走势' : '查看走势'}
                        <AppIcon name={open ? UI_ICONS.chevronUp : UI_ICONS.chevronDown} size={14} />
                    </span>
                </span>
                {isLoading ? (
                    <span className="flex h-8 items-center">
                        <Spinner size="sm" />
                    </span>
                ) : (
                    <span
                        className={cn(
                            'text-[26px] font-semibold leading-tight tabular-nums',
                            netCents < 0 ? 'text-danger' : 'text-text',
                        )}
                    >
                        {formatMoney(netCents)}
                    </span>
                )}
            </button>

            {open ? (
                <div className="flex flex-col gap-2 border-t border-border-subtle pt-2.5">
                    <SegmentedControl
                        items={TREND_KINDS}
                        value={kind}
                        onChange={(next) => setKind(next as TrendKind)}
                        ariaLabel="走势口径"
                    />
                    {points.length === 0 ? (
                        <EmptyState
                            size="compact"
                            icon={UI_ICONS.assets}
                            title="还没有走势数据"
                            description="记几笔账后这里会按月显示"
                        />
                    ) : (
                        <LineChart
                            points={points}
                            height={160}
                            tone={TREND_TONES[kind]}
                            formatValue={(value) => formatMoney(value)}
                            emptyText="还没有走势数据"
                        />
                    )}
                    <p className="text-[11px] leading-relaxed text-text-tertiary">
                        资产走势按月计算月末资产，当月计算今日资产；负债按欠款量级计。
                    </p>
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    <DisparityBar label="总资产" valueCents={assetCents} maxCents={scale} tone="asset" />
                    <DisparityBar label="负债" valueCents={liabilityCents} maxCents={scale} tone="liability" />
                    {!hasAccounts && !isLoading ? (
                        <p className="text-[11.5px] leading-relaxed text-text-tertiary">
                            还没有账户：先在上面加一个现金 / 银行卡账户，净资产就会跟着账单变化。
                        </p>
                    ) : null}
                </div>
            )}

            {/* 展开态也给一眼总览（免得收起才看得到） */}
            {open ? (
                <div className="flex items-center justify-between gap-2 text-[12px] text-text-secondary">
                    <span>总资产 {formatMoney(assetCents)}</span>
                    <span>负债 {formatMoney(liabilityCents)}</span>
                </div>
            ) : null}
        </Card>
    );
}

export default NetWorthCard;
