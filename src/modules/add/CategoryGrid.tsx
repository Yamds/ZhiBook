// 分类宫格：一排 4 个、一页 3 排（12 项），末尾固定「+」卡位。
//
// 手势（自绘，不用原生滚动，保证「跟手 + 一次只过一页」）：
//   - 横向拖动 → 翻页：1:1 跟手、首尾阻尼、松手最多翻一页（位移过 1/4 页或快甩）；
//   - 长按 500ms（位移 <8px）→ 普通模式进编辑模式；编辑模式下拾起该项拖动排序；
//   - 编辑模式也能左右翻页（不依赖原生滚动，也不锁 touch-action）；
//   - 拖动排序：拖动项画在 **body 上的浮层**里（跟手且不受翻页裁剪影响），
//     其余格子按实测几何「挪一格」避让（行尾 → 下一行开头），空位用虚线提示。
//
// 几何全部从真实格子量（getBoundingClientRect 两两相减）：宫格有 px-3 与 gap，
// 用「容器宽 ÷ 列数」会让跨行位移积累几十 px 偏差。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Category, EntryKind } from '../../core/ipc/types';
import { categoryColors } from '../../core/design/categoryColor';
import { UI_ICONS, toIconName } from '../../core/design/icons';
import { useThemeTokens } from '../../hooks/theme/useThemeTokens';
import { useMotion } from '../../hooks/preferences/useMotion';
import { LONG_PRESS_DELAY_MS, LONG_PRESS_MOVE_TOLERANCE_PX } from '../../hooks/ui/useLongPress';
import { AppIcon } from '../../shared/ui/AppIcon';
import { BodyPortal } from '../../shared/ui/BodyPortal';
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
    type GridMetrics,
} from './addPage.logic';

/** 拖动到边缘后每次自动翻页的最小间隔。 */
const AUTO_PAGE_INTERVAL_MS = 450;
/** 翻页 / 回弹动画时长。 */
const PAGE_TRANSITION = 'transform 220ms cubic-bezier(0.33, 1, 0.68, 1)';

export interface CategoryGridProps {
    kind: EntryKind;
    categories: ReadonlyArray<Category>;
    selectedId: string | null;
    editing: boolean;
    busy?: boolean;
    onSelect: (categoryId: string) => void;
    onEnterEditing: () => void;
    onEditCategory: (category: Category) => void;
    onDeleteCategory: (category: Category) => void;
    onCreateCategory: () => void;
    onExitEditing: () => void;
    onReorder: (orderedIds: string[]) => void;
}

interface DragState {
    entryIndex: number;
    pointerId: number;
    /** 手指相对格子左上角的偏移：浮层按它对齐，保证「抓哪跟哪」。 */
    grabOffsetX: number;
    grabOffsetY: number;
    x: number;
    y: number;
    metrics: GridMetrics;
    /** 第 1 个格子相对容器左上角的偏移（空位提示用，避免渲染期读 DOM）。 */
    originInContainerX: number;
    originInContainerY: number;
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

/** 从真实格子量出宫格几何（两两相减，含 gap）；量不到就用容器尺寸估算。 */
function measureGrid(container: HTMLElement): GridMetrics {
    const rect = container.getBoundingClientRect();
    const cells = Array.from(
        container.querySelectorAll<HTMLElement>('[data-entry-index]'),
    ).slice(0, GRID_PAGE_SIZE);
    const first = cells[0];
    const second = cells[1];
    const below = cells[GRID_COLUMNS];
    if (!first || !second) {
        // 格子太少（分类被删到只剩几个）时回退到容器估算
        const cellWidth = rect.width / GRID_COLUMNS;
        return {
            originLeft: rect.left,
            originTop: rect.top,
            cellWidth,
            cellHeight: rect.height / GRID_ROWS,
            pitchX: cellWidth,
            pitchY: rect.height / GRID_ROWS,
        };
    }
    const a = first.getBoundingClientRect();
    const b = second.getBoundingClientRect();
    const c = below?.getBoundingClientRect();
    return {
        originLeft: a.left,
        originTop: a.top,
        cellWidth: a.width,
        cellHeight: a.height,
        pitchX: b.left - a.left || a.width,
        pitchY: c ? c.top - a.top : a.height,
    };
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

    // 拖动期间阻止浏览器接管手势（容器是 touch-action: pan-y，纵向仍归外层滚动）
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
            const current = dragRef.current;
            if (!current) return;
            setDrag({ ...current, x: clientX, y: clientY });

            const container = containerRef.current;
            if (!container) return;
            const localIndex = dropIndexAt({ x: clientX, y: clientY }, current.metrics);
            const target = Math.min(
                Math.max(0, pageIndex * GRID_PAGE_SIZE + localIndex),
                entries.length - 1,
            );
            dropIndexRef.current = target;
            setDropIndex(target);

            const rect = container.getBoundingClientRect();
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
            const cell = (event.target as HTMLElement).closest('[data-entry-index]');
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
                        const container = containerRef.current;
                        const cellRect = cell?.getBoundingClientRect();
                        const containerRect = container?.getBoundingClientRect();
                        if (!container || !cellRect || !containerRect) return;
                        const metrics = measureGrid(container);
                        gesture.mode = 'drag';
                        const next: DragState = {
                            entryIndex: gesture.entryIndex ?? 0,
                            pointerId: gesture.pointerId,
                            grabOffsetX: gesture.startX - cellRect.left,
                            grabOffsetY: gesture.startY - cellRect.top,
                            x: gesture.startX,
                            y: gesture.startY,
                            metrics,
                            originInContainerX: metrics.originLeft - containerRect.left,
                            originInContainerY: metrics.originTop - containerRect.top,
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
            setPageIndex(
                resolvePageAfterRelease(pageIndex, gesture.dx, width, gesture.velocity, pageCount),
            );
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

    // 拖动浮层：挂在 body 上（不受宫格裁剪 / 翻页动画影响）
    const draggedEntry = drag ? entries[drag.entryIndex] : undefined;
    const draggedColors =
        draggedEntry?.type === 'category'
            ? categoryColors(draggedEntry.category.color, brand, surface)
            : null;

    // 空位提示：同页拖动时，落点那一格是空的（格子已经挪走），在容器上画虚线圆
    const hole = useMemo(() => {
        if (!drag || dropIndex === null) return null;
        if (!isSamePage(drag.entryIndex, dropIndex)) return null;
        if (Math.floor(dropIndex / GRID_PAGE_SIZE) !== pageIndex) return null;
        const slot = dropIndex % GRID_PAGE_SIZE;
        const column = slot % GRID_COLUMNS;
        const row = Math.floor(slot / GRID_COLUMNS);
        return {
            left: drag.originInContainerX + column * drag.metrics.pitchX,
            top: drag.originInContainerY + row * drag.metrics.pitchY,
            width: drag.metrics.cellWidth,
            height: drag.metrics.cellHeight,
        };
    }, [drag, dropIndex, pageIndex]);

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
                className="relative touch-pan-y select-none overflow-hidden"
            >
                <div
                    className="flex"
                    style={{
                        transform: `translate3d(calc(${-pageIndex * 100}% + ${panDx}px), 0, 0)`,
                        transition: panDx === 0 ? PAGE_TRANSITION : 'none',
                    }}
                >
                    {pages.map((page, index) => (
                        <div
                            key={index}
                            className="grid w-full shrink-0 grid-cols-4 auto-rows-[88px] gap-x-1 px-3"
                        >
                            {page.map((entry, cellIndex) => {
                                const entryIndex = index * GRID_PAGE_SIZE + cellIndex;
                                const isDragged = drag?.entryIndex === entryIndex;
                                const shift =
                                    drag && isSamePage(drag.entryIndex, dropIndex ?? -1)
                                        ? avoidanceOffset(
                                              entryIndex,
                                              drag.entryIndex,
                                              dropIndex ?? drag.entryIndex,
                                              drag.metrics,
                                          )
                                        : null;
                                const palette =
                                    entry.type === 'add'
                                        ? null
                                        : categoryColors(entry.category.color, brand, surface);

                                return (
                                    <div
                                        key={entry.type === 'add' ? '__add__' : entry.category.id}
                                        data-entry-index={entryIndex}
                                        data-cell-kind={entry.type === 'add' ? 'add' : 'category'}
                                        style={{
                                            transform: shift
                                                ? `translate3d(${shift.x}px, ${shift.y}px, 0)`
                                                : undefined,
                                        }}
                                        className={cn(
                                            'relative flex items-center justify-center',
                                            shift && 'transition-transform duration-200 ease-out',
                                            isDragged && 'opacity-0',
                                        )}
                                    >
                                        {entry.type === 'add' || !palette ? (
                                            <AddCard onClick={() => handleCellClick(entry)} />
                                        ) : (
                                            <CategoryCell
                                                category={entry.category}
                                                selected={entry.category.id === selectedId}
                                                editing={editing}
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

                {hole ? (
                    <div
                        className="pointer-events-none absolute"
                        style={{
                            left: hole.left,
                            top: hole.top,
                            width: hole.width,
                            height: hole.height,
                        }}
                    >
                        <span className="flex h-full w-full items-center justify-center">
                            <span className="inline-flex h-13 w-13 rounded-full border-2 border-dashed border-brand/70" />
                        </span>
                    </div>
                ) : null}
            </div>

            {pageCount > 1 ? (
                <div className="flex items-center justify-center gap-1.5 pt-2">
                    {pages.map((_, index) => (
                        <button
                            key={index}
                            type="button"
                            aria-label={`第 ${index + 1} 页`}
                            aria-current={index === pageIndex}
                            onClick={() => setPageIndex(Math.min(Math.max(0, index), pageCount - 1))}
                            className={cn(
                                'h-1.5 rounded-pill transition-[width,background-color] duration-200',
                                index === pageIndex ? 'w-4 bg-brand' : 'w-1.5 bg-border-strong',
                            )}
                        />
                    ))}
                </div>
            ) : null}

            {drag && draggedEntry?.type === 'category' && draggedColors ? (
                <BodyPortal>
                    <div
                        className="pointer-events-none fixed z-50"
                        style={{
                            left: drag.x - drag.grabOffsetX,
                            top: drag.y - drag.grabOffsetY,
                            width: drag.metrics.cellWidth,
                            height: drag.metrics.cellHeight,
                        }}
                    >
                        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-lg bg-surface shadow-popover">
                            <span
                                className="inline-flex h-13 w-13 items-center justify-center rounded-full"
                                style={{
                                    background: draggedColors.background,
                                    color: draggedColors.foreground,
                                }}
                            >
                                <AppIcon name={toIconName(draggedEntry.category.iconName)} size={28} />
                            </span>
                            <span className="max-w-full truncate text-[12.5px] font-medium text-text">
                                {draggedEntry.category.name}
                            </span>
                        </div>
                    </div>
                </BodyPortal>
            ) : null}
        </div>
    );
}

interface CategoryCellProps {
    category: Category;
    selected: boolean;
    editing: boolean;
    foreground: string;
    background: string;
    onClick: () => void;
    onDelete: () => void;
}

function CategoryCell({
    category,
    selected,
    editing,
    foreground,
    background,
    onClick,
    onDelete,
}: CategoryCellProps) {
    // 按压反馈只给图标本身（圆底弹一下）：整格加灰色底会变成一个方块，
    // 与圆形图标 + 名称的造型不搭。
    const motion = useMotion();
    const iconRef = useRef<HTMLSpanElement | null>(null);

    return (
        <button
            type="button"
            onClick={() => {
                if (iconRef.current) motion.pop(iconRef.current);
                onClick();
            }}
            aria-pressed={selected}
            className="flex w-full flex-col items-center gap-1.5 rounded-md py-1"
        >
            <span
                ref={iconRef}
                className={cn(
                    'relative inline-flex h-13 w-13 items-center justify-center rounded-full',
                    'transition-shadow duration-150',
                    selected && 'ring-2 ring-brand ring-offset-2 ring-offset-surface',
                )}
                style={{ background, color: foreground }}
            >
                <AppIcon name={toIconName(category.iconName)} size={27} />
                {editing ? (
                    <span
                        role="button"
                        tabIndex={-1}
                        aria-label={`删除分类 ${category.name}`}
                        onClick={(event) => {
                            event.stopPropagation();
                            onDelete();
                        }}
                        className="absolute -top-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-danger text-white shadow-card"
                    >
                        <AppIcon name={UI_ICONS.close} size={13} />
                    </span>
                ) : null}
            </span>
            <span
                className={cn(
                    'max-w-full truncate text-[12.5px] leading-tight',
                    selected ? 'font-medium text-text' : 'text-text-secondary',
                )}
            >
                {category.name}
            </span>
        </button>
    );
}

function AddCard({ onClick }: { onClick: () => void }) {
    const motion = useMotion();
    const iconRef = useRef<HTMLSpanElement | null>(null);
    return (
        <button
            type="button"
            onClick={() => {
                if (iconRef.current) motion.pop(iconRef.current);
                onClick();
            }}
            aria-label="新增自定义分类"
            className="flex w-full flex-col items-center gap-1.5 rounded-md py-1"
        >
            <span
                ref={iconRef}
                className="inline-flex h-13 w-13 items-center justify-center rounded-full border border-dashed border-border-strong text-text-tertiary"
            >
                <AppIcon name={UI_ICONS.plus} size={26} />
            </span>
            <span className="text-[12.5px] leading-tight text-text-tertiary">新增</span>
        </button>
    );
}

export default CategoryGrid;
