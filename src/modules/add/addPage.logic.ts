// 添加页纯逻辑：分类宫格分页、拖拽落点、滚动页码。
//
// 全部与 DOM 解耦（只吃数字与矩形），因此能在单测里钉住：
//   - 4 列 × 3 行 = 12 项一页（BRD FR-ADD-2）；
//   - 末尾固定一个「+」卡位（FR-ADD-6）；
//   - 拖动排序的落点换算（FR-ADD-8）。

import type { Category, EntryKind } from '../../core/ipc/types';
import { todayDate, type CalendarDate } from '../../core/domain/date';

/** 宫格列数（每排 4 个）。 */
export const GRID_COLUMNS = 4;
/** 宫格行数（每页 3 排）。 */
export const GRID_ROWS = 3;
/** 每页容量。 */
export const GRID_PAGE_SIZE = GRID_COLUMNS * GRID_ROWS;
/** 拖动到距边缘多少像素时触发自动翻页。 */
export const AUTO_PAGE_EDGE_PX = 28;
/** 翻页位移超过页面宽度的这个比例就翻页。 */
export const PAGE_SWIPE_THRESHOLD_RATIO = 0.25;
/** 甩动速度阈值（px/ms），超过就按方向翻页。 */
export const PAGE_FLING_VELOCITY = 0.5;
/** 首尾页继续往外拖时的阻尼系数（跟手但不越界太多）。 */
export const PAGE_EDGE_DAMPING = 0.35;

/** 宫格条目：分类，或末尾的「+」新建卡位。 */
export type GridEntry =
    | { readonly type: 'category'; readonly category: Category }
    | { readonly type: 'add' };

export interface GridRect {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
}

/**
 * 组宫格条目：某一组的分类（已按 sortOrder 排好）+ 末尾的「+」。
 *
 * 「+」永远排在**最后一页的最后一项**：分类数量刚好整除时，它单独占一页。
 */
export function buildGridEntries(
    categories: ReadonlyArray<Category>,
    kind: EntryKind,
    includeAddCard = true,
): GridEntry[] {
    const entries: GridEntry[] = categories
        .filter((category) => category.kind === kind)
        .map((category) => ({ type: 'category', category }));
    if (includeAddCard) entries.push({ type: 'add' });
    return entries;
}

/** 按每页 `pageSize` 切页；空数组返回空数组（调用方自己决定空态）。 */
export function paginate<T>(items: ReadonlyArray<T>, pageSize = GRID_PAGE_SIZE): T[][] {
    if (pageSize <= 0) return [];
    const pages: T[][] = [];
    for (let index = 0; index < items.length; index += pageSize) {
        pages.push(items.slice(index, index + pageSize));
    }
    return pages;
}

/** 拖动排序：把 from 位置的元素移动到 to 位置（越界自动夹取，不修改入参）。 */
export function moveItem<T>(items: ReadonlyArray<T>, from: number, to: number): T[] {
    const next = items.slice();
    if (next.length === 0) return next;
    const source = clampIndex(from, next.length);
    const target = clampIndex(to, next.length);
    if (source === target) return next;
    const [moved] = next.splice(source, 1);
    if (moved === undefined) return next;
    next.splice(target, 0, moved);
    return next;
}

function clampIndex(index: number, length: number): number {
    if (!Number.isFinite(index)) return 0;
    return Math.min(Math.max(0, Math.trunc(index)), length - 1);
}

/**
 * 由拖动中的指针位置算出落点下标（页内下标，0..columns*rows-1）。
 *
 * 超出宫格区域时按行列夹取，因此拖到页外也能得到合理落点。
 */
export function dropIndexAt(
    point: { x: number; y: number },
    rect: GridRect,
    columns = GRID_COLUMNS,
    rows = GRID_ROWS,
): number {
    if (columns <= 0 || rows <= 0) return 0;
    const cellWidth = rect.width / columns;
    const cellHeight = rect.height / rows;
    if (cellWidth <= 0 || cellHeight <= 0) return 0;
    const column = clamp(Math.floor((point.x - rect.left) / cellWidth), 0, columns - 1);
    const row = clamp(Math.floor((point.y - rect.top) / cellHeight), 0, rows - 1);
    return row * columns + column;
}

/**
 * 拖动到页边缘时是否需要自动翻页。
 *
 * 返回 -1 往前翻、1 往后翻、0 不动。`pageCount` 为 1 时永远不动。
 */
export function autoPageDirection(
    point: { x: number },
    rect: GridRect,
    pageCount: number,
    edge = AUTO_PAGE_EDGE_PX,
): -1 | 0 | 1 {
    if (pageCount <= 1) return 0;
    if (point.x <= rect.left + edge) return -1;
    if (point.x >= rect.left + rect.width - edge) return 1;
    return 0;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

// ---------------------------------------------------------------------------
// 自定义翻页（跟手 + 一次只过一页）
// ---------------------------------------------------------------------------

/**
 * 把拖动位移夹到当前页范围内：首尾页继续往外拖时按阻尼缩小，形成“拉不动”的手感。
 */
export function clampPageDrag(
    dx: number,
    pageIndex: number,
    pageCount: number,
    pageWidth: number,
    damping = PAGE_EDGE_DAMPING,
): number {
    if (pageWidth <= 0) return 0;
    if (dx > 0 && pageIndex <= 0) return dx * damping;
    if (dx < 0 && pageIndex >= pageCount - 1) return dx * damping;
    return clamp(dx, -pageWidth, pageWidth);
}

/**
 * 松手后落到哪一页。
 *
 * 规则：位移超过 1/4 页 → 按位移方向翻一页；否则看甩动速度（≥ 0.5 px/ms
 * 且与位移同方向）→ 翻一页；都不满足则回弹。**无论如何最多只翻一页**。
 */
export function resolvePageAfterRelease(
    pageIndex: number,
    dx: number,
    pageWidth: number,
    velocity = 0,
    pageCount = 1,
): number {
    if (pageWidth <= 0 || pageCount <= 1) return 0;
    const ratio = dx / pageWidth;
    let delta = 0;
    if (Math.abs(ratio) >= PAGE_SWIPE_THRESHOLD_RATIO) {
        delta = ratio > 0 ? -1 : 1;
    } else if (Math.abs(velocity) >= PAGE_FLING_VELOCITY && Math.sign(velocity) === Math.sign(dx)) {
        delta = velocity > 0 ? -1 : 1;
    }
    return clamp(pageIndex + delta, 0, pageCount - 1);
}

// ---------------------------------------------------------------------------
// 拖动排序的避让
// ---------------------------------------------------------------------------

/**
 * 单个格子往前 / 往后挪一格的位移。
 *
 * 行首往前挪会回到上一行末尾，行尾往后挪会去下一行开头。
 */
export function oneSlotOffset(
    entryIndex: number,
    direction: -1 | 1,
    cellWidth: number,
    cellHeight: number,
    columns = GRID_COLUMNS,
): { x: number; y: number } {
    const column = entryIndex % columns;
    if (direction === -1) {
        return column > 0
            ? { x: -cellWidth, y: 0 }
            : { x: (columns - 1) * cellWidth, y: -cellHeight };
    }
    return column < columns - 1
        ? { x: cellWidth, y: 0 }
        : { x: -(columns - 1) * cellWidth, y: cellHeight };
}

/**
 * 拖动中的避让偏移：被拖走的格子腾出的空位，由它后面的格子补上。
 *
 * - 往后拖（source < drop）：`(source, drop]` 这些格子往前挪一格；
 * - 往前拖（source > drop）：`[drop, source)` 这些格子往后挪一格；
 * - 拖动项自己返回 null（它跟着手指走）。
 *
 * 只在「同页」时使用：跨页拖动不避让（避免跨页边界处出现半格残影），
 * 改用虚线落点提示。
 */
export function avoidanceOffset(
    entryIndex: number,
    sourceIndex: number,
    dropIndex: number,
    cellWidth: number,
    cellHeight: number,
    columns = GRID_COLUMNS,
): { x: number; y: number } | null {
    if (entryIndex === sourceIndex || sourceIndex === dropIndex) return null;
    if (sourceIndex < dropIndex) {
        if (entryIndex > sourceIndex && entryIndex <= dropIndex) {
            return oneSlotOffset(entryIndex, -1, cellWidth, cellHeight, columns);
        }
        return null;
    }
    if (entryIndex >= dropIndex && entryIndex < sourceIndex) {
        return oneSlotOffset(entryIndex, 1, cellWidth, cellHeight, columns);
    }
    return null;
}

/** 两个下标是否在同一页（跨页拖动不避让）。 */
export function isSamePage(a: number, b: number, pageSize = GRID_PAGE_SIZE): boolean {
    if (a < 0 || b < 0) return false;
    return Math.floor(a / pageSize) === Math.floor(b / pageSize);
}

/**
 * 账单时间戳：选中日期 + 当前时钟（本地时区）。
 *
 * BRD 3.3：账单同时保存日期与时间；日期是用户选的日历日，
 * 时间是记账当下的时分秒。
 */
export function occurredAtMs(date: CalendarDate, now: Date = new Date()): number {
    return new Date(
        date.year,
        date.month - 1,
        date.day,
        now.getHours(),
        now.getMinutes(),
        now.getSeconds(),
        now.getMilliseconds(),
    ).getTime();
}

/** 把未知异常转成可展示文案（Rust 命令层返回的是字符串）。 */
export function describeError(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string' && error.trim() !== '') return error;
    return '未知错误，请重试';
}

/** 两个日期相差的天数（同一天 = 0）。 */
export function dayDiff(from: CalendarDate, to: CalendarDate): number {
    const a = new Date(from.year, from.month - 1, from.day).getTime();
    const b = new Date(to.year, to.month - 1, to.day).getTime();
    return Math.round((b - a) / 86_400_000);
}

/** 键盘日期键上的短文案：今天 / 明天 / 昨天 / MM-DD。 */
export function shortDateLabel(date: CalendarDate, today: CalendarDate = todayDate()): string {
    const diff = dayDiff(today, date);
    if (diff === 0) return '今天';
    if (diff === 1) return '明天';
    if (diff === -1) return '昨天';
    const month = String(date.month).padStart(2, '0');
    const day = String(date.day).padStart(2, '0');
    return date.year === today.year ? `${month}-${day}` : `${date.year}-${month}-${day}`;
}

/** 组内排序提交时用的 id 顺序（「+」卡位不参与）。 */
export function categoryIdsOf(entries: ReadonlyArray<GridEntry>): string[] {
    return entries
        .filter((entry): entry is { type: 'category'; category: Category } => entry.type === 'category')
        .map((entry) => entry.category.id);
}
