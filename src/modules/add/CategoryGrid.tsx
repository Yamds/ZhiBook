// 分类宫格：一排 4 个、一页 3 排（12 项），末尾固定「+」卡位。
//
// 手势（自绘，不用原生滚动，保证「跟手 + 一次只过一页」）：
//   - 横向拖动 → 翻页：1:1 跟手，首尾页带阻尼，松手最多翻一页（位移 1/4 页或快甩）；
//   - 长按 500ms（位移 <8px）→ 普通模式进编辑模式；编辑模式下拾起该项拖动排序；
//   - 编辑模式也能左右翻页（不再依赖原生滚动，也不再有 touch-action 拦截）；
//   - 拖动排序时目标位置及之后的格子按「挪一格」动画避让（行尾 → 下一行开头）。
//
// 状态（BRD FR-ADD-1~9）：普通点选 / 编辑（× 删除 + 「+」新建）/ 拖动排序（松手即存）。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Category, EntryKind } from '../../core/ipc/types';
import { categoryColors } from '../../core/design/categoryColor';
import { UI_ICONS, toIconName } from '../../core/design/icons';
import { useThemeTokens } from '../../hooks/theme/useThemeTokens';
import { LONG_PRESS_DELAY_MS, LONG_PRESS_MOVE_TOLERANCE_PX } from '../../hooks/ui/useLongPress';
import { AppIcon } from '../../shared/ui/AppIcon';
import { cn } from '../../shared/utils/cn';
import {
    GRID_COLUMNS,
    GRID_PAGE_SIZE,
    GRID_ROWS,
    avoidanceOffset,
    autoPageDirection,
    buildGridEntries,
    categoryIdsOf,
    clampPageDrag,
    dropIndexAt,
    isSamePage,
    moveItem,
    paginate,
    resolvePageAfterRelease,
    type GridEntry,
} from './addPage.logic';

/** 拖动到边缘后每次自动翻页的最小间隔。 */
const AUTO_PAGE_INTERVAL_MS = 450;
/** 翻页 / 回弹动画时长（关掉动效时由 CSS 媒体查询兜底，功能不受影响）。 */
const PAGE_TRANSITION = 'transform 220ms cubic-bezier(0.33, 1, 0.68, 1)';

export interface CategoryGridProps {
    kind: EntryKind;
    categories: ReadonlyArray<Category>;
    selectedId: string | null;
    editing: boolean;
    /** 编辑模式工具栏上的按钮是否禁用（拖动提交中）。 */
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
    /** 拖起时测得的格子 / 页宽（落点换算与避让动画用）。 */
    cellWidth: number;
    cellHeight: number;
    pageWidth: number;
}

interface GestureState {
    pointerId: number;
    entryIndex: number | null;
    startX: number;
    startY: number;
    lastX: number;
    lastTime: number;
    dx: number;
    dy: number;
    velocity: number;
    axis: 'h' | 'v' | null;
    mode: 'press' | 'pan' | 'drag' | 'idle';
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
    const pageCount = pages.length;

    const containerRef = useRef<HTMLDivElement | null>(null);
    const gestureRef = useRef<GestureState | null>(null);
    const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const suppressClickRef = useRef(false);
    const dragRef = useRef<DragState | null>(null);
    const dropIndexRef = useRef<number | null>(null);
    const lastAutoPageRef = useRef(0);

    const [pageIndex, setPageIndex] = useState(0);
    const [panDx, setPanDx] = useState(0);
    const [drag, setDrag] = useState<DragState | null>(null);
    const [dropIndex, setDropIndex] = useState<number | null>(null);
    dragRef.current = drag;
    dropIndexRef.current = dropIndex;

    const editingRef = useRef(editing);
    editingRef.current = editing;

    // 分类变少（删除 / 翻页后）时收敛页码
    useEffect(() => {
        if (pageIndex > pageCount - 1) setPageIndex(Math.max(0, pageCount - 1));
    }, [pageCount, pageIndex]);

    const clearPressTimer = useCallback(() => {
        if (pressTimerRef.current !== null) {
            clearTimeout(pressTimerRef.current);
            pressTimerRef.current = null;
        }
    }, []);

    useEffect(() => clearPressTimer, [clearPressTimer]);

    const finishDrag = useCallback(() => {
        const current = dragRef.current;
        dragRef.current = null;
        setDrag(null);
        if (!current) {
            setDropIndex(null);
            return;
        }
        const target = dropIndexRef.current;
        dropIndexRef.current = null;
        setDropIndex(null);
        const clampedTarget = Math.min(
            Math.max(0, target ?? current.entryIndex),
            entries.length - 1,
        );
        if (clampedTarget === current.entryIndex) return;
        const next = moveItem(entries, current.entryIndex, clampedTarget);
        const ids = categoryIdsOf(next);
        if (ids.join('|') === categoryIdsOf(entries).join('|')) return;
        onReorder(ids);
    }, [entries, onReorder]);

    // 拖动期间：非被动 touchmove 阻止浏览器接管手势（touch-action 已放开 pan-y 给外层滚动）
    useEffect(() => {
        if (!drag) return;
        const container = containerRef.current;
        const blockTouch = (event: TouchEvent) => {
            if (dragRef.current) event.preventDefault();
        };
        container?.addEventListener('touchmove', blockTouch, { passive: false });
        return () => container?.removeEventListener('touchmove', blockTouch);
    }, [drag]);

    const updateDrag = useCallback(
        (clientX: number, clientY: number) => {
            const container = containerRef.current;
            const current = dragRef.current;
            if (!container || !current) return;
            const next: DragState = { ...current, x: clientX, y: clientY };
            dragRef.current = next;
            setDrag(next);

            const rect = container.getBoundingClientRect();
            // 自绘翻页：可见页就是 pageIndex
            const localIndex = dropIndexAt({ x: clientX, y: clientY }, rect);
            const target = Math.min(
                Math.max(0, pageIndex * GRID_PAGE_SIZE + localIndex),
                entries.length - 1,
            );
            dropIndexRef.current = target;
            setDropIndex(target);

            // 拖到左右边缘自动翻页（一次一页，带最小间隔）
            const direction = autoPageDirection({ x: clientX }, rect, pageCount);
            const now = Date.now();
            if (direction !== 0 && now - lastAutoPageRef.current > AUTO_PAGE_INTERVAL_MS) {
                lastAutoPageRef.current = now;
                setPageIndex((prev) => Math.min(Math.max(0, prev + direction), pageCount - 1));
            }
        },
        [entries.length, pageCount, pageIndex],
    );

    const handlePointerDown = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            const target = event.target as HTMLElement;
            const cell = target.closest('[data-entry-index]');
            const entryIndex = cell ? Number(cell.getAttribute('data-entry-index')) : null;
            const isCategoryCell = cell?.getAttribute('data-cell-kind') === 'category';

            gestureRef.current = {
                pointerId: event.pointerId,
                entryIndex: isCategoryCell ? entryIndex : null,
                startX: event.clientX,
                startY: event.clientY,
                lastX: event.clientX,
                lastTime: Date.now(),
                dx: 0,
                dy: 0,
                velocity: 0,
                axis: null,
                mode: 'press',
            };
            suppressClickRef.current = false;
            clearPressTimer();
            containerRef.current?.setPointerCapture(event.pointerId);

            if (isCategoryCell && entryIndex !== null) {
                pressTimerRef.current = setTimeout(() => {
                    pressTimerRef.current = null;
                    const gesture = gestureRef.current;
                    if (!gesture || gesture.mode !== 'press') return;
                    suppressClickRef.current = true;
                    if (editingRef.current) {
                        // 拾起拖动：记下格子尺寸用于落点换算与避让动画
                        const container = containerRef.current;
                        const width = container?.clientWidth ?? 0;
                        const height = container?.clientHeight ?? 0;
                        gesture.mode = 'drag';
                        const next: DragState = {
                            entryIndex: gesture.entryIndex ?? 0,
                            pointerId: gesture.pointerId,
                            startX: gesture.startX,
                            startY: gesture.startY,
                            x: gesture.startX,
                            y: gesture.startY,
                            cellWidth: width / GRID_COLUMNS,
                            cellHeight: height / GRID_ROWS,
                            pageWidth: width,
                        };
                        dragRef.current = next;
                        dropIndexRef.current = next.entryIndex;
                        setDrag(next);
                        setDropIndex(next.entryIndex);
                    } else {
                        gesture.mode = 'idle';
                        onEnterEditing();
                    }
                }, LONG_PRESS_DELAY_MS);
            }
        },
        [clearPressTimer, onEnterEditing],
    );

    const handlePointerMove = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            const gesture = gestureRef.current;
            if (!gesture || event.pointerId !== gesture.pointerId) return;

            const now = Date.now();
            const dt = now - gesture.lastTime;
            if (dt > 0) {
                gesture.velocity = (event.clientX - gesture.lastX) / dt;
                gesture.lastX = event.clientX;
                gesture.lastTime = now;
            }
            gesture.dx = event.clientX - gesture.startX;
            gesture.dy = event.clientY - gesture.startY;

            if (gesture.mode === 'drag') {
                updateDrag(event.clientX, event.clientY);
                return;
            }
            if (gesture.mode === 'idle') return;

            if (gesture.mode === 'press') {
                if (
                    Math.abs(gesture.dx) > LONG_PRESS_MOVE_TOLERANCE_PX ||
                    Math.abs(gesture.dy) > LONG_PRESS_MOVE_TOLERANCE_PX
                ) {
                    clearPressTimer();
                    gesture.axis ??= Math.abs(gesture.dx) > Math.abs(gesture.dy) ? 'h' : 'v';
                }
                if (gesture.axis === 'h') {
                    gesture.mode = 'pan';
                    suppressClickRef.current = true;
                }
            }

            if (gesture.mode === 'pan') {
                const width = containerRef.current?.clientWidth ?? 0;
                setPanDx(clampPageDrag(gesture.dx, pageIndex, pageCount, width));
            }
        },
        [clearPressTimer, pageCount, pageIndex, updateDrag],
    );

    const endGesture = useCallback(() => {
        const gesture = gestureRef.current;
        gestureRef.current = null;
        clearPressTimer();
        if (!gesture) return;

        if (gesture.mode === 'drag') {
            finishDrag();
            return;
        }
        if (gesture.mode === 'pan') {
            const width = containerRef.current?.clientWidth ?? 0;
            const nextPage = resolvePageAfterRelease(
                pageIndex,
                gesture.dx,
                width,
                gesture.velocity,
                pageCount,
            );
            setPageIndex(nextPage);
            setPanDx(0);
        }
    }, [clearPressTimer, finishDrag, pageCount, pageIndex]);

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

    const goToPage = useCallback(
        (index: number) => {
            setPageIndex(Math.min(Math.max(0, index), Math.max(0, pageCount - 1)));
        },
        [pageCount],
    );

    const offset = -pageIndex * 100;

    return (
        <div className="flex min-h-0 flex-col">
            {editing ? (
                <div className="flex items-center justify-end gap-1.5 px-4 pb-1.5">
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
            ) : null}

            <div
                ref={containerRef}
                data-swipe-scroll
                data-no-swipe
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={endGesture}
                onPointerCancel={endGesture}
                onContextMenu={(event) => event.preventDefault()}
                onClick={(event) => {
                    // FR-ADD-9：选择模式下点空白区退出
                    if (!editing) return;
                    if ((event.target as HTMLElement).closest('[data-entry-index]')) return;
                    onExitEditing();
                }}
                className="touch-pan-y select-none overflow-hidden"
            >
                <div
                    className="flex"
                    style={{
                        transform: `translate3d(calc(${offset}% + ${panDx}px), 0, 0)`,
                        // 拖动中翻页要瞬移，否则拖动项会比手指慢半拍
                        transition: panDx === 0 && !drag ? PAGE_TRANSITION : 'none',
                    }}
                >
                    {pages.map((page, index) => (
                        <div
                            key={index}
                            className="grid w-full shrink-0 grid-cols-4 auto-rows-[64px] gap-x-1 gap-y-0.5 px-3"
                        >
                            {page.map((entry, cellIndex) => {
                                const entryIndex = index * GRID_PAGE_SIZE + cellIndex;
                                const isDragged = drag?.entryIndex === entryIndex;
                                const isDropTarget =
                                    drag !== null && dropIndex === entryIndex && !isDragged;
                                const shift =
                                    drag && isSamePage(drag.entryIndex, dropIndex ?? -1)
                                        ? avoidanceOffset(
                                              entryIndex,
                                              drag.entryIndex,
                                              dropIndex ?? drag.entryIndex,
                                              drag.cellWidth,
                                              drag.cellHeight,
                                          )
                                        : null;
                                const dragDelta =
                                    isDragged && drag
                                        ? {
                                              // 翻页时把拖动项平移回可见页，保证它一直在手指下
                                              x:
                                                  drag.x -
                                                  drag.startX +
                                                  (Math.floor(drag.entryIndex / GRID_PAGE_SIZE) -
                                                      pageIndex) *
                                                      drag.pageWidth,
                                              y: drag.y - drag.startY,
                                          }
                                        : null;
                                const palette =
                                    entry.type === 'add'
                                        ? null
                                        : categoryColors(entry.category.color, brand, surface);
                                const transform = dragDelta
                                    ? `translate3d(${dragDelta.x}px, ${dragDelta.y}px, 0) scale(1.08)`
                                    : shift
                                      ? `translate3d(${shift.x}px, ${shift.y}px, 0)`
                                      : undefined;

                                return (
                                    <div
                                        key={entry.type === 'add' ? '__add__' : entry.category.id}
                                        data-entry-index={entryIndex}
                                        data-cell-kind={entry.type === 'add' ? 'add' : 'category'}
                                        style={{ transform, zIndex: dragDelta ? 30 : undefined }}
                                        className={cn(
                                            'relative flex items-center justify-center',
                                            shift && !dragDelta && 'transition-transform duration-150',
                                            dragDelta && 'opacity-95',
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
                                                dragging={Boolean(dragDelta)}
                                                foreground={palette.foreground}
                                                background={palette.background}
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
            </div>

            {pageCount > 1 ? (
                <div className="flex items-center justify-center gap-1.5 pt-1.5">
                    {pages.map((_, index) => (
                        <button
                            key={index}
                            type="button"
                            aria-label={`第 ${index + 1} 页`}
                            aria-current={index === pageIndex}
                            onClick={() => goToPage(index)}
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
    onClick,
    onDelete,
}: CategoryCellProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={selected}
            className={cn(
                'group flex w-full flex-col items-center gap-1 rounded-md px-0.5 pt-1.5 pb-1',
                dragging ? 'shadow-popover' : 'active:bg-inset',
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
