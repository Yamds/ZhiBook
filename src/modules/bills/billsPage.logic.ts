// 账单页纯逻辑：年 / 月两种视图的口径文案、概览格、趋势点、占比颜色、排行副标题。
//
// 页面有两种视图（BRD v1.3 FR-BILL-MODE）：
//   - 月视图：按「日」聚合（本月单日最高 / 平均每日 / 按日趋势）
//   - 年视图：按「月」聚合（本年单月最高 / 平均每月 / 按月趋势）
// 两者的卡片骨架完全一样，只是粒度与文案不同，所以文案统一由 `kindCopy(kind, period)` 产出，
// 数值换算也集中在 `*ForKind` 里，页面只做接线。

import {
    THEME_COLOR_TOKEN,
    categoryColors,
    parseHexColor,
} from '../../core/design/categoryColor';
import { parseMonthKey } from '../../core/domain/date';
import { categoryDisplayNameStatic } from '../../core/domain/categoryName';
import { formatMoney, formatSignedBalance, formatSignedMoney } from '../../core/domain/money';
import { t } from '../../core/i18n';
import type {
    CategoryShare,
    CategoryShareSet,
    KindMonthStats,
    MonthPoint,
    MonthStats,
    ShareBreakdown,
    StatsKind,
    TransactionRank,
    YearSummary,
} from '../../core/ipc/types';
import type { DonutChartSlice, LineChartPoint } from '../../shared/charts';

/** 明细排行取前 N 笔（FR-BILL-11 的「若干」）。 */
export const TRANSACTION_RANK_LIMIT = 10;

/** 年视图固定 12 个月。 */
export const MONTHS_PER_YEAR = 12;

/** 视图模式。 */
export type BillsMode = 'year' | 'month';

/** 统计粒度：日（月视图）/ 月（年视图）。 */
export type BillsPeriod = 'day' | 'month';

/** 三种口径的展示顺序（文案 key 见 `stats.kind.*`）。 */
export const STATS_KINDS: ReadonlyArray<{ value: StatsKind; labelKey: string }> = [
    { value: 'balance', labelKey: 'stats.kind.balance' },
    { value: 'expense', labelKey: 'stats.kind.expense' },
    { value: 'income', labelKey: 'stats.kind.income' },
];

/** 新进入页面时的默认口径（FR-BILL-6：默认「支出」）。 */
export const DEFAULT_BILLS_KIND: StatsKind = 'expense';

/** 新进入页面时的默认视图：先看本月（最常用），切年选择器才进年视图。 */
export const DEFAULT_BILLS_MODE: BillsMode = 'month';

export function statsKindLabel(kind: StatsKind): string {
    const found = STATS_KINDS.find((item) => item.value === kind);
    return t(found?.labelKey ?? 'stats.kind.expense');
}

/**
 * 该口径是否要展示「占比 / 类目排行 / 明细排行」三张卡片。
 *
 * 结余只是收入减支出，分类占比与类目排行对结余没有分析意义（用户反馈第 2 轮），
 * 所以结余口径只保留**结余概览 + 趋势**；支出 / 收入不受影响。
 */
export function showsBreakdownCards(kind: StatsKind): boolean {
    return kind !== 'balance';
}

/** 粒度的说法：日 / 月。 */
export function periodUnitLabel(period: BillsPeriod): string {
    return period === 'day' ? t('stats.period.day') : t('stats.period.month');
}

// ---------------------------------------------------------------------------
// 月视图（按日聚合）
// ---------------------------------------------------------------------------

/** 从月度统计里取某个口径。 */
export function statsForKind(stats: MonthStats, kind: StatsKind): KindMonthStats {
    if (kind === 'balance') return stats.balance;
    if (kind === 'income') return stats.income;
    return stats.expense;
}

/** 从占比集合里取某个口径。 */
export function sharesForKind(breakdown: ShareBreakdown, kind: StatsKind): CategoryShareSet {
    if (kind === 'balance') return breakdown.balance;
    if (kind === 'income') return breakdown.income;
    return breakdown.expense;
}

// ---------------------------------------------------------------------------
// 年视图（按月聚合）
// ---------------------------------------------------------------------------

/** 12 个月序列里某个月的该口径金额。 */
export function monthValueForKind(point: MonthPoint, kind: StatsKind): number {
    if (kind === 'income') return point.incomeCents;
    if (kind === 'balance') return point.balanceCents;
    return point.expenseCents;
}

/** 12 个月序列里某个月的该口径笔数（结余 = 收入 + 支出）。 */
export function monthCountForKind(point: MonthPoint, kind: StatsKind): number {
    if (kind === 'income') return point.incomeCount;
    if (kind === 'balance') return point.incomeCount + point.expenseCount;
    return point.expenseCount;
}

/** 年度该口径总额。 */
export function yearTotalCents(summary: YearSummary | undefined, kind: StatsKind): number {
    if (!summary) return 0;
    if (kind === 'income') return summary.incomeCents;
    if (kind === 'balance') return summary.balanceCents;
    return summary.expenseCents;
}

/** 年度该口径累计笔数。 */
export function yearTotalCount(summary: YearSummary | undefined, kind: StatsKind): number {
    if (!summary) return 0;
    return summary.months.reduce((sum, point) => sum + monthCountForKind(point, kind), 0);
}

/** 半舍入（远离零）的整数除法，与 Rust `query::div_round` 同口径。 */
function divRound(value: number, divisor: number): number {
    if (!Number.isFinite(value) || divisor <= 0) return 0;
    const half = Math.floor(divisor / 2);
    if (value >= 0) return Math.trunc((value + half) / divisor);
    return -Math.trunc((-value + half) / divisor);
}

/** 年度「单月最高」：绝对值最大的那个月，保留符号。 */
export function yearMaxMonth(
    summary: YearSummary | undefined,
    kind: StatsKind,
): { month: string | null; cents: number } {
    let cents = 0;
    let month: string | null = null;
    for (const point of summary?.months ?? []) {
        const value = monthValueForKind(point, kind);
        if (Math.abs(value) > Math.abs(cents)) {
            cents = value;
            month = point.month;
        }
    }
    return { month, cents };
}

/** 年度平均每月（与月视图的「日均 = 总额 ÷ 当月天数」同口径，这里固定 ÷12）。 */
export function yearMonthlyAverageCents(
    summary: YearSummary | undefined,
    kind: StatsKind,
): number {
    return divRound(yearTotalCents(summary, kind), MONTHS_PER_YEAR);
}

// ---------------------------------------------------------------------------
// 文案
// ---------------------------------------------------------------------------

/** 某个口径 + 粒度的全部展示文案。 */
export interface KindCopy {
    readonly label: string;
    /** 结余卡片标题：本年结余 / 本月结余。 */
    readonly balanceTitle: string;
    readonly totalLabel: string;
    readonly trendTitle: string;
    readonly maxLabel: string;
    readonly averageLabel: string;
    readonly countLabel: string;
    readonly shareTitle: string;
    readonly categoryRankTitle: string;
    readonly transactionRankTitle: string;
    /** 类目排行副标题：`本月共支出 ¥ 750.00，消费 1 笔`。 */
    readonly categorySubtitle: (amountCents: number, count: number) => string;
}

export function kindCopy(kind: StatsKind, period: BillsPeriod): KindCopy {
    const label = statsKindLabel(kind);
    // 结余口径不拼口径名（「本月单日最高」而不是「本月单日最高结余」），所以传空串。
    const nameSuffix = kind === 'balance' ? '' : label;
    const scope = period === 'day' ? t('stats.scope.month') : t('stats.scope.year');
    const unit = periodUnitLabel(period);
    const verb =
        kind === 'income'
            ? t('stats.verb.income')
            : kind === 'expense'
              ? t('stats.verb.expense')
              : t('stats.verb.balance');
    const pick = (dayKey: string, monthKey: string) => (period === 'day' ? dayKey : monthKey);
    return {
        label,
        balanceTitle: t('stats.copy.balanceTitle', { scope }),
        totalLabel: t('stats.copy.totalLabel', { scope, label }),
        trendTitle: t(pick('stats.copy.trendTitleDay', 'stats.copy.trendTitleMonth'), { label }),
        maxLabel: t('stats.copy.maxLabel', { scope, unit, label: nameSuffix }),
        averageLabel: t('stats.copy.averageLabel', { scope, unit, label: nameSuffix }),
        countLabel: t('stats.copy.countLabel', { scope, label: nameSuffix }),
        shareTitle: t(pick('stats.copy.shareTitleDay', 'stats.copy.shareTitleMonth'), { scope, label }),
        categoryRankTitle: t(
            pick('stats.copy.categoryRankTitleDay', 'stats.copy.categoryRankTitleMonth'),
            { scope, label },
        ),
        transactionRankTitle: t(
            pick('stats.copy.transactionRankTitleDay', 'stats.copy.transactionRankTitleMonth'),
            { scope, label },
        ),
        categorySubtitle: (amountCents, count) =>
            kind === 'balance'
                ? t('stats.copy.subtitleBalance', {
                      scope,
                      amount: formatSignedBalance(amountCents),
                      verb,
                      count,
                  })
                : t('stats.copy.subtitle', {
                      scope,
                      label,
                      amount: formatMoney(Math.abs(amountCents)),
                      verb,
                      count,
                  }),
    };
}

// ---------------------------------------------------------------------------
// 概览与趋势
// ---------------------------------------------------------------------------

/** 概览块里的一个小格。 */
export interface OverviewCell {
    readonly label: string;
    readonly value: string;
    /** 次要说明（如单日最高 / 单月最高对应的日期或月份）。 */
    readonly hint?: string;
}

/** 口径金额带符号：支出口径 `- ¥`、收入 `+ ¥`、结余看数值本身。 */
export function formatKindTotal(cents: number, kind: StatsKind): string {
    return kind === 'balance' ? formatSignedBalance(cents) : formatSignedMoney(cents, kind);
}

/** 月视图概览格：单日最高 / 日均 / 累计笔数（FR-BILL-7）。 */
export function overviewCells(stats: MonthStats, kind: StatsKind): OverviewCell[] {
    const data = statsForKind(stats, kind);
    const copy = kindCopy(kind, 'day');
    const hasData = data.count > 0;
    return [
        {
            label: copy.maxLabel,
            value: hasData ? formatKindTotal(data.maxDayCents, kind) : '—',
            hint: hasData && data.maxDay ? formatDayHint(data.maxDay) : undefined,
        },
        {
            label: copy.averageLabel,
            value: hasData ? formatKindTotal(data.dailyAverageCents, kind) : '—',
        },
        { label: copy.countLabel, value: t('stats.countValue', { count: data.count }) },
    ];
}

/** 年视图概览格：单月最高 / 平均每月 / 累计笔数（按月聚合）。 */
export function yearOverviewCells(summary: YearSummary | undefined, kind: StatsKind): OverviewCell[] {
    const copy = kindCopy(kind, 'month');
    const count = yearTotalCount(summary, kind);
    const hasData = count > 0;
    const max = yearMaxMonth(summary, kind);
    return [
        {
            label: copy.maxLabel,
            value: hasData ? formatKindTotal(max.cents, kind) : '—',
            hint: hasData && max.month ? formatMonthHint(max.month) : undefined,
        },
        {
            label: copy.averageLabel,
            value: hasData ? formatKindTotal(yearMonthlyAverageCents(summary, kind), kind) : '—',
        },
        { label: copy.countLabel, value: t('stats.countValue', { count }) },
    ];
}

/** 月视图趋势点：横轴为「日」（01..当月天数）。 */
export function trendPoints(stats: MonthStats, kind: StatsKind): LineChartPoint[] {
    const data = statsForKind(stats, kind);
    return data.daily.map((value, index) => {
        const day = String(index + 1).padStart(2, '0');
        return { key: `${stats.month}-${day}`, label: day, value };
    });
}

/** 年视图趋势点：横轴为「月」（01..12）。 */
export function yearTrendPoints(summary: YearSummary | undefined, kind: StatsKind): LineChartPoint[] {
    const months = summary?.months ?? [];
    if (months.length === 0) return [];
    return months.map((point, index) => ({
        key: point.month,
        label: String(index + 1).padStart(2, '0'),
        value: monthValueForKind(point, kind),
    }));
}

// ---------------------------------------------------------------------------
// 占比与颜色
// ---------------------------------------------------------------------------

/**
 * 图表里的分类颜色。
 *
 * 分类颜色默认是 `theme`（跟随品牌色）——直接用到环形图上会让 Top10 全是同一个颜色，
 * 完全看不出结构。所以这里对 `theme` 走**主题自带色板**（按条目顺序取），
 * 用户显式选过颜色的分类仍用它自己的颜色。
 *
 * @param palette 主题色板（9 色相 + 4 灰阶，由 `useThemePalette` 解析）；
 *                色板为空时退到品牌色。
 */
export function chartColor(
    color: string,
    index: number,
    brand: string,
    surface: string,
    palette: readonly string[],
): string {
    if (color === THEME_COLOR_TOKEN || parseHexColor(color) === null) {
        return palette.length > 0 ? palette[index % palette.length] ?? brand : brand;
    }
    return categoryColors(color, brand, surface).foreground;
}

/** 占比条目 → 环形图扇区（值用绝对值：扇区只表达构成）。 */
export function shareSlices(
    items: ReadonlyArray<CategoryShare>,
    colors: ReadonlyMap<string, string>,
): DonutChartSlice[] {
    return items.map((item) => ({
        key: item.categoryId,
        label: categoryDisplayNameStatic({ id: item.categoryId, name: item.name }, item.name),
        value: item.absAmountCents,
        color: colors.get(item.categoryId) ?? 'var(--brand-500)',
    }));
}

/**
 * 一次算出某个占比集合里每个分类的图表颜色。
 *
 * 以 `all`（完整列表，已按绝对值降序）的顺序定色：环形图里的 Top10 与 `all` 的前 10 项
 * 索引一致，所以环形图、图例、展开弹层里的颜色完全对得上；
 * 「其它」合并桶不在 `all` 里，用品牌色兑底。
 */
export function shareColorMap(
    set: CategoryShareSet | undefined,
    brand: string,
    surface: string,
    palette: readonly string[],
): Map<string, string> {
    const map = new Map<string, string>();
    if (!set) return map;
    set.all.forEach((item, index) => {
        map.set(item.categoryId, chartColor(item.color, index, brand, surface, palette));
    });
    for (const item of set.items) {
        if (!map.has(item.categoryId)) map.set(item.categoryId, brand);
    }
    return map;
}

/** 排行行取色的统一入口：图表色优先，缺失时退回该分类自己的颜色。 */
export function colorResolver(
    colors: ReadonlyMap<string, string>,
    brand: string,
    surface: string,
): (categoryId: string, fallbackColor: string) => string {
    return (categoryId, fallbackColor) =>
        colors.get(categoryId) ?? categoryColors(fallbackColor, brand, surface).foreground;
}

/** 0.837 → `83.7%`。 */
export function formatShare(ratio: number): string {
    if (!Number.isFinite(ratio)) return '0.0%';
    return `${(ratio * 100).toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// 日期 / 月份标签
// ---------------------------------------------------------------------------

/** `2025-09-08` → `09.08`。 */
export function formatDayHint(day: string): string {
    const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(day);
    return match ? `${match[1]}.${match[2]}` : day;
}

/** `2025-03` → `3月`。 */
export function formatMonthHint(month: string): string {
    const parsed = parseMonthKey(month);
    return parsed ? t('date.monthOnly', { month: parsed.month }) : month;
}

/** `2025-09` → `2025年9月`（非法输入原样返回）。 */
export function monthLabel(month: string): string {
    const parsed = parseMonthKey(month);
    return parsed ? t('date.yearMonth', { year: parsed.year, month: parsed.month }) : month;
}

// ---------------------------------------------------------------------------
// 排行
// ---------------------------------------------------------------------------

/** 类目排行的副标题（FR-BILL-10）。 */
export function categorySubtitle(
    share: CategoryShare,
    kind: StatsKind,
    period: BillsPeriod,
): string {
    return kindCopy(kind, period).categorySubtitle(share.amountCents, share.count);
}

/** 明细排行的副标题：`09.08 北京-杭州 D888号`（FR-BILL-11）。 */
export function transactionRankSubtitle(rank: TransactionRank): string {
    const day = formatDayHint(rank.day);
    return rank.note ? `${day} ${rank.note}` : day;
}

/** 进度条占比：相对最大值，越界夹取。 */
export function rankRatio(value: number, maxValue: number): number {
    if (!Number.isFinite(value) || !Number.isFinite(maxValue) || maxValue <= 0) return 0;
    return Math.min(1, Math.abs(value) / Math.abs(maxValue));
}

/** 明细排行的进度条基准：最大单笔金额（单笔之间比「谁更大」最直观）。 */
export function transactionRankRatio(
    ranks: ReadonlyArray<TransactionRank>,
): (rank: TransactionRank) => number {
    const max = ranks.reduce((best, item) => Math.max(best, item.amountCents), 0);
    return (rank) => rankRatio(rank.amountCents, max);
}
