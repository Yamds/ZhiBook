// 明细页纯逻辑：懒加载窗口、合并去重、按日分组与分组总计、金额文案。
//
// 与 DOM 解耦，单测直接钉住：
//   - 窗口互不重叠且不漏天（BRD FR-DET-4 / Q9：每批 ≤7 天 / 50 条）；
//   - 被 LIMIT 截断时收窄到「最旧那一天」再拉，避免静默丢账单；
//   - 合并多个窗口时按 id 去重、按时间倒序。

import { shiftDayKey } from '../../core/domain/date';
import { formatMoney } from '../../core/domain/money';
import type { Transaction } from '../../core/ipc/types';
import { TRANSACTION_BATCH_LIMIT } from '../../core/services/ledger.service';

/** 每个懒加载批次覆盖的天数（BRD Q9）。 */
export const DETAILS_BATCH_DAYS = 7;

/** 一个懒加载窗口（闭区间，day key）。 */
export interface DayWindow {
    readonly fromDay: string;
    readonly toDay: string;
}

/**
 * 初始窗口：锚定日（含）往前共 `days` 天。
 *
 * 锚定日 = 用户在日选择器上选的那天，列表从这天的最新一笔开始往前。
 */
export function initialWindow(anchorDay: string, days = DETAILS_BATCH_DAYS): DayWindow {
    const span = Math.max(1, days);
    return { toDay: anchorDay, fromDay: shiftDayKey(anchorDay, -(span - 1)) };
}

/** 这一批是否被 `LIMIT` 截断（可能还有更早的账单没取到）。 */
export function isBatchTruncated(batch: ReadonlyArray<unknown>, limit = TRANSACTION_BATCH_LIMIT): boolean {
    return batch.length >= limit;
}

/**
 * 覆盖「锚定日 → 焦点日」所需的窗口列表（编辑返回时一次把窗口铺到位）。
 *
 * 不这么做的话，焦点账单可能在已加载窗口之外（用户可能在搜索里改了一条很旧的账单），
 * 就需逐窗懒加载，滚动定位会先跳到空处再跳回来。
 *
 * 最多铺 `maxWindows` 个窗口（默认 26 个 ≈ 半年）；超过则不再铺，焦点账单这次就不高亮
 * （宁可少一个提示，也不要在手机上一次发几十个查询）。
 */
export function windowsToCover(
    anchorDay: string,
    focusDay: string,
    options: { days?: number; maxWindows?: number } = {},
): DayWindow[] {
    const days = Math.max(1, options.days ?? DETAILS_BATCH_DAYS);
    const maxWindows = Math.max(1, options.maxWindows ?? 26);
    const windows: DayWindow[] = [initialWindow(anchorDay, days)];
    if (focusDay >= anchorDay) return windows;

    while (windows.length < maxWindows) {
        const previous = windows[windows.length - 1] as DayWindow;
        if (previous.fromDay <= focusDay) break;
        const toDay = shiftDayKey(previous.fromDay, -1);
        windows.push({ fromDay: shiftDayKey(toDay, -(days - 1)), toDay });
    }
    return windows;
}

/**
 * 下一批窗口；返回 `null` 表示「没有更早的账单了」。
 *
 * - 正常情况：从上一批最旧那天再往前 `days` 天；
 * - 上一批正好顶到 LIMIT：说明该窗口内还有没取到的，**收窄到最旧那一天**再拉一次
 *   （与已加载部分按 id 去重，不会重复显示）；
 * - 已经收窄到单日仍然顶到 LIMIT：这一天的记录实在太多，停止继续拉（页面给提示）。
 */
export function nextWindow(
    previous: DayWindow,
    batch: ReadonlyArray<Pick<Transaction, 'day'>>,
    limit = TRANSACTION_BATCH_LIMIT,
    days = DETAILS_BATCH_DAYS,
): DayWindow | null {
    if (batch.length === 0) return null;
    const first = batch[0] as Pick<Transaction, 'day'>;
    const oldest = batch.reduce(
        (min, item) => (item.day < min ? item.day : min),
        first.day,
    );

    if (isBatchTruncated(batch, limit)) {
        if (previous.fromDay === previous.toDay) return null;
        return { fromDay: oldest, toDay: oldest };
    }

    const span = Math.max(1, days);
    const toDay = shiftDayKey(oldest, -1);
    return { fromDay: shiftDayKey(toDay, -(span - 1)), toDay };
}

/** 多批结果合并：按 id 去重，按发生时间倒序（新的在前）。 */
export function mergeTransactions(
    batches: ReadonlyArray<ReadonlyArray<Transaction>>,
): Transaction[] {
    const byId = new Map<string, Transaction>();
    for (const batch of batches) {
        for (const item of batch) {
            if (!byId.has(item.id)) byId.set(item.id, item);
        }
    }
    return Array.from(byId.values()).sort(
        (left, right) =>
            right.occurredAtMs - left.occurredAtMs ||
            right.createdAtMs - left.createdAtMs ||
            (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    );
}

/** 一天的账单分组（`items` 已按时间倒序）。 */
export interface DayGroup {
    readonly day: string;
    readonly items: Transaction[];
    /** 该日结余 = 收入 − 支出（只统计已加载的行）。 */
    readonly balanceCents: number;
}

/** 按日分组并算出每日总计；入参需已按时间倒序（`mergeTransactions` 的输出）。 */
export function groupByDayWithTotals(items: ReadonlyArray<Transaction>): DayGroup[] {
    const groups: { day: string; items: Transaction[]; balanceCents: number }[] = [];
    for (const item of items) {
        const signed = item.kind === 'income' ? item.amountCents : -item.amountCents;
        const last = groups.at(-1);
        if (last && last.day === item.day) {
            last.items.push(item);
            last.balanceCents += signed;
            continue;
        }
        groups.push({ day: item.day, items: [item], balanceCents: signed });
    }
    return groups;
}

/** 分组头总计文案：`+ ¥ 1,000.00` / `- ¥ 146.00` / `¥ 0.00`。 */
export function formatDayTotal(cents: number): string {
    if (cents === 0) return formatMoney(0);
    return `${cents > 0 ? '+' : '-'} ${formatMoney(Math.abs(cents))}`;
}

// ---------------------------------------------------------------------------
// 全屏图片查看器
// ---------------------------------------------------------------------------

/** 位移超过视口宽度的这个比例就翻到上一张 / 下一张。 */
export const VIEWER_SWIPE_RATIO = 0.2;

/** 图片查看器松手后落到哪一张（越界夹到首尾）。 */
export function viewerIndexAfterRelease(
    index: number,
    dx: number,
    width: number,
    count: number,
    ratio = VIEWER_SWIPE_RATIO,
): number {
    if (count <= 0 || width <= 0) return index;
    if (Math.abs(dx) < width * ratio) return index;
    const next = index + (dx < 0 ? 1 : -1);
    return Math.min(Math.max(0, next), count - 1);
}
