// 账单页 · 类目排行卡片（FR-BILL-10）：图标 + 「本期共支出 ¥ x，消费 n 笔」+ 占比进度条。

import type { CategoryShareSet, StatsKind } from '../../core/ipc/types';
import { RankRow } from '../../shared/charts';
import { EmptyState, Spinner } from '../../shared/ui';
import { BillsCard, CategoryBadge } from './BillsCardParts';
import {
    categorySubtitle,
    colorResolver,
    formatKindTotal,
    type BillsPeriod,
} from './billsPage.logic';

export interface CategoryRankCardProps {
    title: string;
    set: CategoryShareSet | undefined;
    kind: StatsKind;
    /** 副标题粒度：日 / 月。 */
    period: BillsPeriod;
    colors: ReadonlyMap<string, string>;
    brand: string;
    surface: string;
    isLoading: boolean;
}

export function CategoryRankCard({
    title,
    set,
    kind,
    period,
    colors,
    brand,
    surface,
    isLoading,
}: CategoryRankCardProps) {
    const items = set?.all ?? [];
    const colorOf = colorResolver(colors, brand, surface);

    return (
        <BillsCard title={title}>
            {isLoading && items.length === 0 ? (
                <div className="flex justify-center py-6">
                    <Spinner size="sm" />
                </div>
            ) : items.length === 0 ? (
                <EmptyState size="compact" title="本期还没有可排行的分类" />
            ) : (
                <div className="flex flex-col">
                    {items.map((item) => (
                        <RankRow
                            key={item.categoryId}
                            leading={
                                <CategoryBadge
                                    iconName={item.iconName}
                                    color={colorOf(item.categoryId, item.color)}
                                    brand={brand}
                                    surface={surface}
                                />
                            }
                            title={
                                <>
                                    {item.name}
                                    {item.hidden ? (
                                        <span className="ml-1 text-[10.5px] text-text-disabled">
                                            已删除
                                        </span>
                                    ) : null}
                                </>
                            }
                            subtitle={categorySubtitle(item, kind, period)}
                            trailing={formatKindTotal(item.amountCents, kind)}
                            ratio={item.share}
                            color={colorOf(item.categoryId, item.color)}
                        />
                    ))}
                </div>
            )}
        </BillsCard>
    );
}

export default CategoryRankCard;
