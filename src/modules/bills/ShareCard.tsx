// 账单页 · 占比卡片：环形图 + 图例 + 「其它」展开（FR-BILL-9）。
//
// 结余口径按 Q7 拆成「支出占比 / 收入占比」两张图（子切换由页面传入）。

import { useState, type ReactNode } from 'react';
import type { CategoryShareSet, StatsKind } from '../../core/ipc/types';
import { BillsCard } from './BillsCardParts';
import { OtherSharesSheet } from './OtherSharesSheet';
import { ShareBlock } from './ShareBlock';

export interface ShareCardProps {
    title: string;
    set: CategoryShareSet | undefined;
    kind: StatsKind;
    /** 分类 → 颜色（页面统一算好，保证与排行卡片同色）。 */
    colors: ReadonlyMap<string, string>;
    isLoading: boolean;
    /** 标题右侧内容（结余口径的子切换）。 */
    extra?: ReactNode;
}

export function ShareCard({ title, set, kind, colors, isLoading, extra }: ShareCardProps) {
    const [othersOpen, setOthersOpen] = useState(false);

    return (
        <BillsCard title={title} extra={extra}>
            <ShareBlock
                set={set}
                kind={kind}
                colors={colors}
                isLoading={isLoading}
                onExpand={() => setOthersOpen(true)}
            />
            <OtherSharesSheet
                open={othersOpen}
                onOpenChange={setOthersOpen}
                set={set}
                kind={kind}
                colors={colors}
            />
        </BillsCard>
    );
}

export default ShareCard;
