// 分类宫格：一排 4 个、一页 3 排（12 项），可左右翻页；末尾固定「+」卡位。
//
// 三种状态（BRD FR-ADD-1~9）：
//   1. 普通：点选分类；
//   2. 编辑：长按任意分类进入，出现「×」删除角标与「完成 / 取消」工具条；
//   3. 拖动：编辑模式下再次长按某项拾起，拖到目标格放下（拖到左右边缘自动翻页），
//      松手即提交整组顺序。
//
// 手势说明：格子上的长按自己实现（不用 useLongPress，因为它是一个 hook、
// 不能按格子循环使用），阈值与位移容差复用同一组常量，保证与全应用一致。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Category, EntryKind } from '../../core/ipc/types';
import { categoryColors } from '../../core/design/categoryColor';
import { UI_ICONS, toIconName } from '../../core/design/icons';
import { useThemeTokens } from '../../hooks/theme/useThemeTokens';
import { LONG_PRESS_DELAY_MS, LONG_PRESS_MOVE_TOLERANCE_PX } from '../../hooks/ui/useLongPress';
import { AppIcon } from '../../shared/ui/AppIcon';
import { cn } from '../../shared/utils/cn';
import {
    GRID_PAGE_SIZE,
    autoPageDirection,
    buildGridEntries,
    categoryIdsOf,
    dropIndexAt,
    moveItem,
    pageIndexFromScroll,
    paginate,
    type GridEntry,
} from './addPage.logic';

/** 拖动到边缘后每次自动翻页的最小间隔。 */
const AUTO_PAGE_INTERVAL_MS = 450;

export interface CategoryGridProps {
    kind: EntryKind;
    categories: ReadonlyArray<Category>;
    selectedId: string | null;
    editing: boolean;
    /** 编辑模式工具条上的「完成」是否可用（拖动提交中时禁用）。 */
    busy?: boolean;
    onSelect: (categoryId: string) => void;
    /** 普通模式下长按：进入编辑模式。 */
    onEnterEditing: () => void;
    /** 编辑模式下点击分类：打开分类编辑器。 */
    onEditCategory: (category: Category) => void;
    onDeleteCategory: (category: Category) => void;
    onCreateCategory: () => void;
    onExitEditing: () => void;
    /** 拖动结束：提交该组的新顺序。 */
    onReorder: (orderedIds: string[]) => void;
}

interface DragState {
    entryIndex: number;
    pointerId: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
}

interface PressState {
    entryIndex: number;
    x: number;
    y: number;
    pointerId: number;
}

export function CategoryGrid({
    kind,
    categories,
    selectedId,
    editing,
    busy = false,
    onSelect,
    onEnterEditing,
    onEditCategory,
    onDeleteCategory,
    onCreateCategory,
    onExitEditing,
    onReorder,
}: CategoryGridProps) {
    const { brand, surface } = useThemeTokens({
        brand: { name: '--brand-500', fallback: '#ff6b3d' },
        surface: { name: '--surface-card', fallback: '#ffffff' },
    });

    const entries = useMemo(() => buildGridEntries(categories, kind), [categories, kind]);
    const pages = useMemo(() => paginate(entries), [entries]);

    const scrollRef = useRef<HTMLDivElement | null>(null);
    const [pageIndex, setPageIndex] = useState(0);
    const [drag, setDrag] = useState<DragState | null>(null);
    const [dropIndex, setDropIndex] = useState<number | null>(null);

    const pressRef = useRef<PressState | null>(null);
    const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const suppressClickRef = useRef(false);
    const dragRef = useRef<DragState | null>(null);
    const dropIndexRef = useRef<number | null>(null);
    const lastAutoPageRef = useRef(0);
    dragRef.current = drag;
    dropIndexRef.current = dropIndex;

    // 编辑模式退出 / 分类变化（翻页后数组变短）时，收敛页码。
    const pageCount = pages.length;
    useEffect(() => {
        if (pageIndex > pageCount - 1) setPageIndex(Math.max(0, pageCount - 1));
    }, [pageCount, pageIndex]);

    const clearPress = useCallback(() => {
        if (pressTimerRef.current !== null) {
            clearTimeout(pressTimerRef.current);
            pressTimerRef.current = null;
        }
        pressRef.current = null;
    }, []);

    useEffect(() => clearPress, [clearPress]);

    const scrollToPage = useCallback((index: number, smooth = true) => {
        const container = scrollRef.current;
        if (!container) return;
        const target = index * container.clientWidth;
        container.scrollTo({ left: target, behavior: smooth ? 'smooth' : 'auto' });
    }, []);

    const startDrag = useCallback((entryIndex: number, x: number, y: number, pointerId: number) => {
        // 「+」卡位不能拖动
        dropIndexRef.current = entryIndex;
        setDrag({ entryIndex, pointerId, startX: x, startY: y, x, y });
        setDropIndex(entryIndex);
        suppressClickRef.current = true;
    }, []);

    const finishDrag = useCallback(() => {
        const current = dragRef.current;
        dragRef.current = null;
        setDrag(null);
        if (!current) {
            setDropIndex(null);
            return;
        }
        const target = dropIndexRef.current;
        setDropIndex(null);
        dropIndexRef.current = null;
        const clampedTarget = Math.min(Math.max(0, target ?? current.entryIndex), entries.length - 1);
        if (clampedTarget === current.entryIndex) return;
        const next = moveItem(entries, current.entryIndex, clampedTarget);
        const ids = categoryIdsOf(next);
        const currentIds = categoryIdsOf(entries);
        if (ids.join('|') === currentIds.join('|')) return;
        onReorder(ids);
    }, [entries, onReorder]);

    // 拖动期间的全局监听：指针可能移出格子（甚至移出宫格）后继续拖。
    useEffect(() => {
        if (!drag) return;
        const handleMove = (event: PointerEvent) => {
            const container = scrollRef.current;
            const current = dragRef.current;
            if (!container || !current || event.pointerId !== current.pointerId) return;
            const next: DragState = { ...current, x: event.clientX, y: event.clientY };
            dragRef.current = next;
            setDrag(next);

            const rect = container.getBoundingClientRect();
            const visiblePage = pageIndexFromScroll(
                container.scrollLeft,
                container.clientWidth,
                Math.max(1, pageCount),
            );
            const localIndex = dropIndexAt({ x: event.clientX, y: event.clientY }, rect);
            const target = Math.min(visiblePage * GRID_PAGE_SIZE + localIndex, entries.length - 1);
            dropIndexRef.current = target;
            setDropIndex(target);

            const direction = autoPageDirection({ x: event.clientX }, rect, pageCount);
            const now = Date.now();
            if (direction !== 0 && now - lastAutoPageRef.current > AUTO_PAGE_INTERVAL_MS) {
                lastAutoPageRef.current = now;
                const nextPage = Math.min(Math.max(0, visiblePage + direction), pageCount - 1);
                if (nextPage !== visiblePage) scrollToPage(nextPage, false);
            }
        };
        const handleUp = (event: PointerEvent) => {
            const current = dragRef.current;
            if (current && event.pointerId !== current.pointerId) return;
            finishDrag();
        };
        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', handleUp);
        window.addEventListener('pointercancel', handleUp);
        return () => {
            window.removeEventListener('pointermove', handleMove);
            window.removeEventListener('pointerup', handleUp);
            window.removeEventListener('pointercancel', handleUp);
        };
    }, [drag, entries.length, finishDrag, pageCount, scrollToPage]);

    const handleCellPointerDown = useCallback(
        (event: React.PointerEvent<HTMLElement>, entry: GridEntry, entryIndex: number) => {
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            if (entry.type === 'add') {
                // 「+」只做点击，不参与长按 / 拖动
                pressRef.current = null;
                return;
            }
            // 先清掉上一次的按压跟踪，再登记这次（clearPress 会把 pressRef 置空）
            clearPress();
            pressRef.current = {
                entryIndex,
                x: event.clientX,
                y: event.clientY,
                pointerId: event.pointerId,
            };
            suppressClickRef.current = false;
            const point = { x: event.clientX, y: event.clientY };
            pressTimerRef.current = setTimeout(() => {
                pressTimerRef.current = null;
                if (editing) startDrag(entryIndex, point.x, point.y, event.pointerId);
                else {
                    suppressClickRef.current = true;
                    onEnterEditing();
                }
            }, LONG_PRESS_DELAY_MS);
        },
        [clearPress, editing, onEnterEditing, startDrag],
    );

    const handleCellPointerMove = useCallback(
        (event: React.PointerEvent<HTMLElement>) => {
            const press = pressRef.current;
            if (!press || pressTimerRef.current === null) return;
            if (
                Math.abs(event.clientX - press.x) > LONG_PRESS_MOVE_TOLERANCE_PX ||
                Math.abs(event.clientY - press.y) > LONG_PRESS_MOVE_TOLERANCE_PX
            ) {
                clearPress();
            }
        },
        [clearPress],
    );

    const handleCellClick = useCallback(
        (entry: GridEntry) => {
            if (suppressClickRef.current) {
                suppressClickRef.current = false;
                return;
            }
            if (entry.type === 'add') {
                onCreateCategory();
                return;
            }
            if (editing) onEditCategory(entry.category);
            else onSelect(entry.category.id);
        },
        [editing, onCreateCategory, onEditCategory, onSelect],
    );

    const handleScroll = useCallback(() => {
        const container = scrollRef.current;
        if (!container) return;
        const next = pageIndexFromScroll(container.scrollLeft, container.clientWidth, pageCount);
        setPageIndex((prev) => (prev === next ? prev : next));
    }, [pageCount]);

    return (
        <div className="flex min-h-0 flex-col">
            {editing ? (
                <div className="flex items-center justify-between gap-2 px-4 pb-1.5">
                    <p className="text-[11.5px] text-text-tertiary">
                        长按图标可拖动排序；点「×」删除，点分类可改名 / 换图标
                    </p>
                    <div className="flex shrink-0 items-center gap-1.5">
                        <button
                            type="button"
                            onClick={onExitEditing}
                            disabled={busy}
                            className="h-7 rounded-pill bg-inset px-2.5 text-[12px] font-medium text-text-secondary active:bg-muted disabled:opacity-50"
                        >
                            取消
                        </button>
                        <button
                            type="button"
                            onClick={onExitEditing}
                            disabled={busy}
                            className="h-7 rounded-pill bg-brand px-2.5 text-[12px] font-medium text-white active:opacity-90 disabled:opacity-50"
                        >
                            完成
                        </button>
                    </div>
                </div>
            ) : null}

            <div
                ref={scrollRef}
                data-swipe-scroll
                onScroll={handleScroll}
                onClick={(event) => {
                    // FR-ADD-9：选择模式下点空白区退出（点分类不算空白）
                    if (!editing) return;
                    const target = event.target as HTMLElement;
                    if (target.closest('[data-category-cell]')) return;
                    onExitEditing();
                }}
                className={cn(
                    'scrollbar-hide flex w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain',
                )}
            >
                {pages.map((page, index) => (
                    <div
                        key={index}
                        className={cn(
                            'grid w-full shrink-0 snap-center grid-cols-4 auto-rows-[68px]',
                            'gap-x-1 gap-y-0.5 px-3',
                        )}
                    >
                        {page.map((entry, cellIndex) => {
                            const entryIndex = index * GRID_PAGE_SIZE + cellIndex;
                            const dragging = drag?.entryIndex === entryIndex;
                            const isDropTarget = drag !== null && dropIndex === entryIndex && !dragging;
                            const delta = dragging && drag
                                ? { x: drag.x - drag.startX, y: drag.y - drag.startY }
                                : null;
                            const palette = entry.type === 'add'
                                ? null
                                : categoryColors(entry.category.color, brand, surface);
                            return (
                                <div
                                    key={entry.type === 'add' ? '__add__' : entry.category.id}
                                    data-category-cell
                                    style={
                                        delta
                                            ? {
                                                  transform: `translate3d(${delta.x}px, ${delta.y}px, 0) scale(1.08)`,
                                                  zIndex: 30,
                                              }
                                            : undefined
                                    }
                                    className={cn(
                                        'relative flex items-center justify-center',
                                        dragging && 'opacity-95',
                                    )}
                                >
                                    {entry.type === 'add' || !palette ? (
                                        <AddCard onClick={() => handleCellClick(entry)} />
                                    ) : (
                                        <CategoryCell
                                            category={entry.category}
                                            selected={entry.category.id === selectedId}
                                            editing={editing}
                                            dropTarget={isDropTarget}
                                            foreground={palette.foreground}
                                            background={palette.background}
                                            dragging={dragging}
                                            onPointerDown={(event) =>
                                                handleCellPointerDown(event, entry, entryIndex)
                                            }
                                            onPointerMove={handleCellPointerMove}
                                            onPointerUp={clearPress}
                                            onPointerLeave={clearPress}
                                            onClick={() => handleCellClick(entry)}
                                            onDelete={() => onDeleteCategory(entry.category)}
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>

            {pageCount > 1 ? (
                <div className="flex items-center justify-center gap-1.5 pt-1.5">
                    {pages.map((_, index) => (
                        <button
                            key={index}
                            type="button"
                            aria-label={`第 ${index + 1} 页`}
                            aria-current={index === pageIndex}
                            onClick={() => scrollToPage(index)}
                            className={cn(
                                'h-1.5 rounded-pill transition-[width,background-color] duration-200',
                                index === pageIndex ? 'w-4 bg-brand' : 'w-1.5 bg-border-strong',
                            )}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    );
}

interface CategoryCellProps {
    category: Category;
    selected: boolean;
    editing: boolean;
    dropTarget: boolean;
    dragging: boolean;
    foreground: string;
    background: string;
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerUp: () => void;
    onPointerLeave: () => void;
    onClick: () => void;
    onDelete: () => void;
}

function CategoryCell({
    category,
    selected,
    editing,
    dropTarget,
    dragging,
    foreground,
    background,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerLeave,
    onClick,
    onDelete,
}: CategoryCellProps) {
    return (
        <button
            type="button"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={onPointerLeave}
            onContextMenu={(event) => event.preventDefault()}
            onClick={onClick}
            aria-pressed={selected}
            style={editing ? { touchAction: 'none' } : undefined}
            className={cn(
                'group flex w-full flex-col items-center gap-1 rounded-md px-0.5 pt-1.5 pb-1',
                'active:bg-inset',
                dragging && 'shadow-popover',
            )}
        >
            <span
                className={cn(
                    'relative inline-flex h-10 w-10 items-center justify-center rounded-full',
                    'transition-[box-shadow,transform] duration-150',
                    selected && 'ring-2 ring-brand ring-offset-2 ring-offset-surface',
                    dropTarget && 'outline-2 outline-dashed outline-offset-2 outline-brand',
                )}
                style={{ background, color: foreground }}
            >
                <AppIcon name={toIconName(category.iconName)} size={20} />
                {editing ? (
                    <span
                        role="button"
                        tabIndex={-1}
                        aria-label={`删除分类 ${category.name}`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                            event.stopPropagation();
                            onDelete();
                        }}
                        className="absolute -top-1 -right-1 inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-danger text-white shadow-card"
                    >
                        <AppIcon name={UI_ICONS.close} size={12} />
                    </span>
                ) : null}
            </span>
            <span
                className={cn(
                    'max-w-full truncate text-[11.5px] leading-tight',
                    selected ? 'font-medium text-text' : 'text-text-secondary',
                )}
            >
                {category.name}
            </span>
        </button>
    );
}

function AddCard({ onClick }: { onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label="新增自定义分类"
            className="flex w-full flex-col items-center gap-1 rounded-md px-0.5 pt-1.5 pb-1 active:bg-inset"
        >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-border-strong text-text-tertiary">
                <AppIcon name={UI_ICONS.plus} size={20} />
            </span>
            <span className="text-[11.5px] leading-tight text-text-tertiary">新增</span>
        </button>
    );
}

export default CategoryGrid;
