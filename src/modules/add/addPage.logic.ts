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

/** 由滚动位置反推当前页（四舍五入，容忍半页回弹）。 */
export function pageIndexFromScroll(scrollLeft: number, pageWidth: number, pageCount: number): number {
    if (pageWidth <= 0 || pageCount <= 0) return 0;
    return clamp(Math.round(scrollLeft / pageWidth), 0, pageCount - 1);
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
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
