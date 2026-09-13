// 账单页 · 趋势卡片：月视图按「日」、年视图按「月」（FR-BILL-8 及其年度对应物）。
//
// 折线图复用 shared/charts 的自绘 LineChart（点选气泡 + 零轴 + 负值）。

import { useState } from 'react';
import type { StatsKind } from '../../core/ipc/types';
import { LineChart, type LineChartPoint } from '../../shared/charts';
import { Spinner } from '../../shared/ui';
import { BillsCard } from './BillsCardParts';
import { formatKindTotal } from './billsPage.logic';

export interface TrendCardProps {
    title: string;
    points: ReadonlyArray<LineChartPoint>;
    kind: StatsKind;
    isLoading: boolean;
    /** 无数据时的文案（跟随年 / 月视图）。 */
    emptyText: string;
}

export function TrendCard({ title, points, kind, isLoading, emptyText }: TrendCardProps) {
    const [activeIndex, setActiveIndex] = useState<number | null>(null);

    return (
        <BillsCard title={title}>
            {isLoading ? (
                <div className="flex justify-center py-8">
                    <Spinner size="sm" />
                </div>
            ) : points.length === 0 ? (
                <p className="py-6 text-center text-[12px] text-text-tertiary">{emptyText}</p>
            ) : (
                <LineChart
                    points={points}
                    height={150}
                    activeIndex={activeIndex}
                    onActiveIndexChange={setActiveIndex}
                    formatValue={(value) => formatKindTotal(value, kind)}
                />
            )}
        </BillsCard>
    );
}

export default TrendCard;
