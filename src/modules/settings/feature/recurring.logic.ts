// 固定收支的纯逻辑：05:00 边界、补账日期区间、金额输入解析。
//
// 时区处理全部留在前端：`day` = 本地日历日（YYYY-MM-DD），
// `occurredAtMs` = 当天 05:00 的本地时间戳；Rust 侧不做时区推断。

import { logicalDayKey, shiftDayKey, todayKey } from '../../../core/domain/date';
import { centsToInputText, parseAmountInput } from '../../../core/domain/money';
import type { RecurringOccurrence, RecurringRule } from '../../../core/ipc/types';

/** 每笔固定收支的落库时刻（本地时间）。 */
export const RECURRING_HOUR = 5;

/** 单次补账的最大天数（极端保护：设备时钟异常时不会一次刷出上万笔）。 */
export const MAX_CATCH_UP_DAYS = 3660;

const MS_PER_DAY = 86_400_000;

/** 本地 day key 的 05:00 → 毫秒时间戳。 */
export function occurredAtMsForDay(day: string, hour = RECURRING_HOUR): number {
    const [year, month, date] = day.split('-').map(Number);
    return new Date(year, month - 1, date, hour, 0, 0, 0).getTime();
}

/** 最新一个「05:00 已经过去」的日期（含当天）；5:00 前算前一天。 */
export function dueThroughDay(now: Date = new Date()): string {
    return logicalDayKey(now, RECURRING_HOUR);
}

/**
 * 新规则的首个生效日 = 创建时刻之后的**下一个 05:00**。
 *
 * 05:00 前创建 → 当天（当天 05:00 还没到，晚于创建时刻，可以记）；
 * 05:00 及以后创建 → 次日。因此永远不会补到「创建规则之前」。
 */
export function firstDueDay(now: Date = new Date()): string {
    const today = todayKey(now);
    return now.getHours() < RECURRING_HOUR ? today : shiftDayKey(today, 1);
}

/** 重新启用时用来跳过暂停窗口的「已处理截止日」。 */
export function skipThroughDay(now: Date = new Date()): string {
    return dueThroughDay(now);
}

function maxDay(a: string, b: string): string {
    return a >= b ? a : b;
}

/** 某条规则当前应补的日期（从 startDay 与 lastRunDay+1 的较大者到 dueThrough）。 */
export function dueDays(rule: RecurringRule, now: Date = new Date()): string[] {
    if (!rule.enabled) return [];
    const through = dueThroughDay(now);
    const from = rule.lastRunDay ? shiftDayKey(rule.lastRunDay, 1) : rule.startDay;
    let start = maxDay(from, rule.startDay);
    if (start > through) return [];

    const totalDays = Math.round(
        (occurredAtMsForDay(through) - occurredAtMsForDay(start)) / MS_PER_DAY,
    ) + 1;
    if (totalDays > MAX_CATCH_UP_DAYS) {
        start = shiftDayKey(through, -(MAX_CATCH_UP_DAYS - 1));
    }

    const days: string[] = [];
    let cursor = start;
    while (cursor <= through) {
        days.push(cursor);
        cursor = shiftDayKey(cursor, 1);
    }
    return days;
}

/** 把规则列表转成补账请求（没有要补的就返回空数组）。 */
export function dueOccurrences(
    rules: ReadonlyArray<RecurringRule>,
    now: Date = new Date(),
): RecurringOccurrence[] {
    const occurrences: RecurringOccurrence[] = [];
    for (const rule of rules) {
        for (const day of dueDays(rule, now)) {
            occurrences.push({
                ruleId: rule.id,
                day,
                occurredAtMs: occurredAtMsForDay(day),
            });
        }
    }
    return occurrences;
}

/** 列表里的排程文案。 */
export function scheduleLabel(): string {
    return `每天 ${String(RECURRING_HOUR).padStart(2, '0')}:00`;
}

/** 金额输入（元）→ 分；非法、非正数或超限返回 null。 */
export function parseAmountText(text: string): number | null {
    return parseAmountInput(text);
}

/** 分 → 金额输入框预填文本（无多余尾零）。 */
export function amountTextFromCents(cents: number): string {
    return centsToInputText(cents, { trimZeros: true });
}
