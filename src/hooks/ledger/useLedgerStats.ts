// 统计查询：月度 / 年度 / 占比 / 排行 / 日历日汇总 / 资产趋势。
//
// 全部是只读查询，没有写操作——统计由账单、账户、分类的写操作间接失效
// （见 queryKeys.ts 的 ledgerInvalidation）。

import { useQuery } from '@tanstack/react-query';
import type { StatsKind } from '../../core/ipc/types';
import { DEFAULT_TREND_MONTHS, ledgerService } from '../../core/services/ledger.service';
import { ledgerKeys } from './queryKeys';

export function useMonthStats(bookId: string | undefined, month: string) {
    return useQuery({
        queryKey: ledgerKeys.monthStats(bookId ?? '', month),
        queryFn: () => ledgerService.getMonthStats(bookId ?? '', month),
        enabled: Boolean(bookId),
    });
}

export function useYearSummary(bookId: string | undefined, year: number) {
    return useQuery({
        queryKey: ledgerKeys.yearSummary(bookId ?? '', year),
        queryFn: () => ledgerService.getYearSummary(bookId ?? '', year),
        enabled: Boolean(bookId),
    });
}

/** 单月占比 / 排行（三种口径一次返回）。 */
export function useMonthShares(bookId: string | undefined, month: string) {
    return useQuery({
        queryKey: ledgerKeys.monthShares(bookId ?? '', month),
        queryFn: () => ledgerService.getMonthShares(bookId ?? '', month),
        enabled: Boolean(bookId),
    });
}

/** 环形图口径：以 endMonth 结尾、向前 months 个月（可跨年）。 */
export function usePeriodShares(
    bookId: string | undefined,
    endMonth: string,
    months = DEFAULT_TREND_MONTHS,
) {
    return useQuery({
        queryKey: ledgerKeys.periodShares(bookId ?? '', endMonth, months),
        queryFn: () => ledgerService.getPeriodShares(bookId ?? '', endMonth, months),
        enabled: Boolean(bookId),
    });
}

export function useTransactionRanks(
    bookId: string | undefined,
    month: string,
    kind: StatsKind,
    limit = 10,
) {
    return useQuery({
        queryKey: ledgerKeys.transactionRanks(bookId ?? '', month, kind, limit),
        queryFn: () => ledgerService.getTransactionRanks(bookId ?? '', month, kind, limit),
        enabled: Boolean(bookId),
    });
}

/** 日历用：某月每天的收支合计（只含有数据的日期）。 */
export function useDaySummaries(bookId: string | undefined, month: string) {
    return useQuery({
        queryKey: ledgerKeys.daySummaries(bookId ?? '', month),
        queryFn: () => ledgerService.listDaySummaries(bookId ?? '', month),
        enabled: Boolean(bookId),
    });
}
