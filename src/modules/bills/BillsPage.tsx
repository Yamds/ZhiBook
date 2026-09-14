// 账单页（BRD v1.3 FR-BILL）：年 / 月**两种视图**分离，统计主题各自成卡片。
//
// 视图规则（用户反馈第 2 轮）：
//   点 / 滑**年**选择器 → 年视图：下方全是按「月」聚合的卡片（本年结余、单月最高、平均每月…），
//                          月份条变暗但仍可点可滑；
//   点 / 滑**月**选择器 → 月视图：下方全是按「日」聚合的卡片（本月结余、单日最高、平均每日…）。
//
// 两种视图的卡片骨架完全一致（结余 / 概览 / 趋势 / 占比 / 类目排行 / 明细排行），
// 只有数据源与文案不同；口径切换（结余 / 支出 / 收入）位于结余卡片下方，作用于后面所有卡片。
// **结余口径只保留概览 + 趋势**（占比 / 排行对结余没有分析意义，见 `showsBreakdownCards`）。
//
// 数据：年视图走 year/年汇总 + 年度占比 + 年度单笔排行；月视图走月统计 + 月度占比 + 月度排行。

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    MONTH_SELECTOR_VALUES,
    YEAR_SELECTOR_SPAN,
    todayDate,
    toMonthKey,
    yearOptions,
} from '../../core/domain/date';
import type { MonthStats, StatsKind } from '../../core/ipc/types';
import {
    useMonthShares,
    useMonthStats,
    usePeriodShares,
    useTransactionRanks,
    useYearSummary,
    useYearTransactionRanks,
} from '../../hooks/ledger';
import { useCurrentBook } from '../../hooks/ledger/useLedgerBooks';
import { CATEGORY_VISUAL_TOKENS, useThemeTokens } from '../../hooks/theme/useThemeTokens';
import { useThemePalette } from '../../hooks/theme/useThemePalette';
import { PeriodSelector } from '../../shared/ui/PeriodSelector';
import { SegmentedControl } from '../../shared/ui';
import { cn } from '../../shared/utils/cn';
import { BalanceCard } from './BalanceCard';
import { CategoryRankCard } from './CategoryRankCard';
import { OverviewCard } from './OverviewCard';
import { ShareCard } from './ShareCard';
import { TransactionRankCard } from './TransactionRankCard';
import { TrendCard } from './TrendCard';
import {
    DEFAULT_BILLS_KIND,
    DEFAULT_BILLS_MODE,
    MONTHS_PER_YEAR,
    STATS_KINDS,
    TRANSACTION_RANK_LIMIT,
    kindCopy,
    monthLabel,
    overviewCells,
    shareColorMap,
    sharesForKind,
    showsBreakdownCards,
    statsForKind,
    trendPoints,
    yearOverviewCells,
    yearTotalCents,
    yearTrendPoints,
    type BillsMode,
    type BillsPeriod,
} from './billsPage.logic';


export function BillsPage() {
    const { t } = useTranslation();
    const { currentBook } = useCurrentBook();
    const bookId = currentBook?.id;
    const today = useMemo(() => todayDate(), []);
    const { brand, surface } = useThemeTokens(CATEGORY_VISUAL_TOKENS);
    const { palette } = useThemePalette();

    const [year, setYear] = useState(today.year);
    const [month, setMonth] = useState(today.month);
    const [mode, setMode] = useState<BillsMode>(DEFAULT_BILLS_MODE);
    const [kind, setKind] = useState<StatsKind>(DEFAULT_BILLS_KIND);

    const monthKey = toMonthKey(year, month);
    const yearValues = useMemo(() => yearOptions(undefined, YEAR_SELECTOR_SPAN), []);
    const isYear = mode === 'year';
    const period: BillsPeriod = isYear ? 'month' : 'day';
    const copy = kindCopy(kind, period);
    /** 结余口径只做概览 + 趋势，不拉占比 / 排行（拉了也不用）。 */
    const withBreakdown = showsBreakdownCards(kind);

    const yearSummary = useYearSummary(bookId, year);
    // 年视图的占比 = 该年 1~12 月（`period_share_breakdown` 取以 12 月结尾的 12 个月）
    const yearShares = usePeriodShares(bookId, `${year}-12`, MONTHS_PER_YEAR, withBreakdown);
    const yearRanks = useYearTransactionRanks(
        bookId,
        year,
        kind,
        TRANSACTION_RANK_LIMIT,
        withBreakdown,
    );
    const monthStats = useMonthStats(bookId, monthKey);
    const monthShares = useMonthShares(bookId, monthKey, withBreakdown);
    const monthRanks = useTransactionRanks(
        bookId,
        monthKey,
        kind,
        TRANSACTION_RANK_LIMIT,
        withBreakdown,
    );

    const breakdown = isYear ? yearShares.data : monthShares.data;
    const breakdownLoading = isYear ? yearShares.isLoading : monthShares.isLoading;
    const ranks = (isYear ? yearRanks.data : monthRanks.data) ?? [];
    const ranksLoading = isYear ? yearRanks.isLoading : monthRanks.isLoading;

    /** 占比与类目排行共用一套集合（两者都是「按分类汇总」）。 */
    const shareSet = breakdown ? sharesForKind(breakdown, kind) : undefined;
    /** 整页一套图表颜色：图例、类目排行、明细排行里同一个分类必然同色。 */
    const colors = useMemo(
        () => shareColorMap(shareSet, brand, surface, palette),
        [brand, palette, shareSet, surface],
    );

    // 结余卡片：年视图看本年，月视图看本月
    const balanceCents = isYear
        ? yearSummary.data?.balanceCents ?? 0
        : monthStats.data?.balance.totalCents ?? 0;
    const expenseCents = isYear
        ? yearSummary.data?.expenseCents ?? 0
        : monthStats.data?.expense.totalCents ?? 0;
    const incomeCents = isYear
        ? yearSummary.data?.incomeCents ?? 0
        : monthStats.data?.income.totalCents ?? 0;
    const balanceLoading = isYear ? yearSummary.isLoading : monthStats.isLoading;

    const totalCents = isYear
        ? yearTotalCents(yearSummary.data, kind)
        : monthStats.data
          ? statsForKind(monthStats.data, kind).totalCents
          : 0;
    const cells = isYear
        ? yearOverviewCells(yearSummary.data, kind)
        : overviewCells(monthStats.data ?? emptyMonthStats(monthKey), kind);
    const points = isYear
        ? yearTrendPoints(yearSummary.data, kind)
        : monthStats.data
          ? trendPoints(monthStats.data, kind)
          : [];
    const periodLabel = isYear ? t('date.yearOnly', { year }) : monthLabel(monthKey);

    return (
        <section className="flex min-h-full flex-col gap-3 pt-5">
            <div className="flex flex-col">
                <PeriodSelector
                    values={yearValues}
                    value={year}
                    onChange={setYear}
                    onInteract={() => setMode('year')}
                    visible={3}
                    unit={t('date.yearUnit')}
                    ariaLabel={t('date.selectYear')}
                />
                {/* 年视图下月份条变暗：说明当前卡片是按年聚合的；但仍然可点可滑 */}
                <div className={cn('flex flex-col', isYear && 'opacity-40')}>
                    <PeriodSelector
                        values={MONTH_SELECTOR_VALUES}
                        value={month}
                        onChange={setMonth}
                        onInteract={() => setMode('month')}
                        unit={t('date.monthUnit')}
                        ariaLabel={t('date.selectMonth')}
                    />
                </div>
            </div>

            <BalanceCard
                title={copy.balanceTitle}
                periodLabel={periodLabel}
                balanceCents={balanceCents}
                expenseCents={expenseCents}
                incomeCents={incomeCents}
                isLoading={balanceLoading}
            />

            {/* 口径切换：位于结余卡片下方，作用于之后的所有统计卡片 */}
            <div className="px-1">
                <SegmentedControl
                    items={STATS_KINDS.map((item) => ({ value: item.value, label: t(item.labelKey) }))}
                    value={kind}
                    onChange={setKind}
                    ariaLabel={t('stats.scopeAria')}
                />
            </div>

            <OverviewCard
                title={t('bills.overviewTitle', { label: copy.label })}
                caption={`${copy.totalLabel} · ${periodLabel}`}
                totalCents={totalCents}
                kind={kind}
                cells={cells}
                isLoading={isYear ? yearSummary.isLoading : monthStats.isLoading}
            />

            <TrendCard
                title={copy.trendTitle}
                points={points}
                kind={kind}
                isLoading={isYear ? yearSummary.isLoading : monthStats.isLoading}
                emptyText={t('stats.noDataYet', { label: copy.totalLabel })}
            />

            {/* 结余口径只保留概览 + 趋势：分类占比 / 排行对结余没有分析意义 */}
            {withBreakdown ? (
                <>
                    <ShareCard
                        title={copy.shareTitle}
                        set={shareSet}
                        kind={kind}
                        colors={colors}
                        isLoading={breakdownLoading}
                    />

                    <CategoryRankCard
                        title={copy.categoryRankTitle}
                        set={shareSet}
                        kind={kind}
                        period={period}
                        colors={colors}
                        brand={brand}
                        surface={surface}
                        isLoading={breakdownLoading}
                    />

                    <TransactionRankCard
                        title={copy.transactionRankTitle}
                        ranks={ranks}
                        colors={colors}
                        brand={brand}
                        surface={surface}
                        isLoading={ranksLoading}
                    />
                </>
            ) : null}
        </section>
    );
}

/** 统计未就绪时的全 0 占位（避免 undefined 分支散落在卡片里）。 */
function emptyMonthStats(month: string): MonthStats {
    const empty = {
        totalCents: 0,
        count: 0,
        maxDayCents: 0,
        maxDay: null,
        dailyAverageCents: 0,
        daily: [],
    };
    return { month, days: 0, expense: { ...empty }, income: { ...empty }, balance: { ...empty } };
}

export default BillsPage;
