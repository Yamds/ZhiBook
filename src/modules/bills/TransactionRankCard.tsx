// 账单页 · 明细排行卡片（FR-BILL-11）：本期金额最大的若干**单笔**账单。

import type { TransactionRank } from '../../core/ipc/types';
import { categoryDisplayName } from '../../core/domain/categoryName';
import { useTranslation } from 'react-i18next';
import { RankRow } from '../../shared/charts';
import { EmptyState, Spinner } from '../../shared/ui';
import { BillsCard, CategoryBadge } from './BillsCardParts';
import {
    colorResolver,
    formatKindTotal,
    transactionRankRatio,
    transactionRankSubtitle,
} from './billsPage.logic';

export interface TransactionRankCardProps {
    title: string;
    ranks: ReadonlyArray<TransactionRank>;
    colors: ReadonlyMap<string, string>;
    brand: string;
    surface: string;
    isLoading: boolean;
}

export function TransactionRankCard({
    title,
    ranks,
    colors,
    brand,
    surface,
    isLoading,
}: TransactionRankCardProps) {
    const { t } = useTranslation();
    const colorOf = colorResolver(colors, brand, surface);
    const ratioOf = transactionRankRatio(ranks);

    return (
        <BillsCard title={title}>
            {isLoading && ranks.length === 0 ? (
                <div className="flex justify-center py-6">
                    <Spinner size="sm" />
                </div>
            ) : ranks.length === 0 ? (
                <EmptyState size="compact" title={t('bills.noTransactionToRank')} />
            ) : (
                <div className="flex flex-col">
                    {ranks.map((rank) => (
                        <RankRow
                            key={rank.id}
                            leading={
                                <CategoryBadge
                                    iconName={rank.categoryIconName}
                                    color={colorOf(rank.categoryId, rank.categoryColor)}
                                    brand={brand}
                                    surface={surface}
                                />
                            }
                            title={categoryDisplayName({ id: rank.categoryId, name: rank.categoryName }, t, rank.categoryName)}
                            subtitle={transactionRankSubtitle(rank)}
                            trailing={formatKindTotal(rank.amountCents, rank.kind)}
                            ratio={ratioOf(rank)}
                            color={colorOf(rank.categoryId, rank.categoryColor)}
                        />
                    ))}
                </div>
            )}
        </BillsCard>
    );
}

export default TransactionRankCard;
