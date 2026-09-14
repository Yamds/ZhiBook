// 资产页纯逻辑（BRD FR-AST）。
//
// 页面只做接线，这些可测的部分放这里：
//   - 三项资产口径（净资产 / 总资产 / 负债）的取值、折线点与颜色；
//   - 差距条的公共刻度；
//   - 「初始余额」输入 → 分（允许负数、允许留空、拒绝超过上限与非法格式）；
//   - 账本可删判定（FR-AST-5：最后一个账本不能删）。

import { parseMonthKey } from '../../core/domain/date';
import { centsToInputText, parseAmountInput } from '../../core/domain/money';
import type { Account, AssetPoint, Book } from '../../core/ipc/types';

/** 账户名上限（与 Rust `validate::ACCOUNT_NAME_MAX` 一致）。 */
export const ACCOUNT_NAME_MAX = 12;
/** 账本名上限（与 Rust `validate::BOOK_NAME_MAX` 一致）。 */
export const BOOK_NAME_MAX = 20;

export type TrendKind = 'net' | 'asset' | 'liability';

export const DEFAULT_TREND_KIND: TrendKind = 'net';

/** 趋势卡的口径切换项（顺序即展示顺序）。 */
export const TREND_KINDS: ReadonlyArray<{ value: TrendKind; label: string }> = [
    { value: 'net', label: '净资产' },
    { value: 'asset', label: '总资产' },
    { value: 'liability', label: '负债' },
];

/** 折线色调：净资产 / 总资产走品牌色，负债走危险色。 */
export const TREND_TONES: Record<TrendKind, 'brand' | 'danger'> = {
    net: 'brand',
    asset: 'brand',
    liability: 'danger',
};

export interface TrendPoint {
    readonly key: string;
    readonly label: string;
    readonly value: number;
}

/** 取某个口径在某个快照点上的金额（分）。 */
export function trendValue(point: AssetPoint, kind: TrendKind): number {
    if (kind === 'asset') return point.totalAssetCents;
    if (kind === 'liability') return point.liabilityCents;
    return point.netCents;
}

/** 按月快照 → 折线点（横轴标签 = 两位月份，如 `09`）。 */
export function trendPoints(trend: readonly AssetPoint[], kind: TrendKind): TrendPoint[] {
    return trend.map((point) => {
        const parsed = parseMonthKey(point.month);
        const label = parsed ? String(parsed.month).padStart(2, '0') : point.month;
        return { key: point.month, label, value: trendValue(point, kind) };
    });
}

/** 两条差距条共用的刻度上限（都为空时给 0，组件自己会画空条）。 */
export function disparityScale(totalAssetCents: number, liabilityCents: number): number {
    return Math.max(0, totalAssetCents, liabilityCents);
}

/** 余额为负：给出视觉提示但不报错（FR-AST-8）。 */
export function isNegativeBalance(balanceCents: number): boolean {
    return balanceCents < 0;
}

/**
 * 「初始余额」输入 → 分。
 *
 * - 允许留空（= 0）、允许负号（余额为负的账户）、允许千分位；
 * - 整数最多 9 位、小数最多 2 位，绝对值不能超过单笔上限；
 * - 非法格式返回 null（调用方提示，不静默改写）。
 *
 * 解析规则与固定收支金额框同源（`core/domain/money::parseAmountInput`），
 * 这里只是把「余额」这个场景的选项写死。
 */
export function parseBalanceCents(raw: string): number | null {
    return parseAmountInput(raw, { allowNegative: true, allowZero: true, emptyAsZero: true });
}

/** 编辑器里的余额文案：0 留空（配合 placeholder），其余用千分位两位小数。 */
export function balanceInputValue(cents: number): string {
    return centsToInputText(cents, { group: true });
}

/** 分组小计（资产账户合计 / 负债账户合计）。 */
export function sumBalances(accounts: readonly Account[]): number {
    return accounts.reduce((total, account) => total + account.balanceCents, 0);
}

/** 最后一个账本不可删（FR-AST-5）。 */
export function isBookDeletable(books: readonly Book[], bookId: string): boolean {
    return books.length > 1 && books.some((book) => book.id === bookId);
}

/**
 * 切换账本时该不该真的切（点当前账本不做无意义的写操作）。
 */
export function shouldSwitchBook(currentBookId: string | undefined, nextBookId: string): boolean {
    return currentBookId !== nextBookId;
}
