// 明细页（BRD FR-DET-1 ~ 12）：按年 / 月 / 日浏览账单 + 关键字搜索 + 账单详情。
//
// 数据流：
//   - 浏览：`useTransactionWindows` 按「互不重叠的 7 天窗口」懒加载（每窗 ≤50 条），
//     页面把各窗结果按 id 去重合并后按日分组；滚到底自动推进窗口（FR-DET-4 / Q9）；
//   - 搜索：`useSearchTransactions` 命中当前账本全部账单（备注 / 分类名，FR-DET-10），
//     搜索期间收起日期选择器；
//   - 详情：BottomSheet（编辑复用添加页表单 / 删除二次确认 / 附图全屏查看）。
//
// 分组头、窗口推进、合并去重都是纯逻辑（`detailsPage.logic.ts`）并有单测。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    clampDay,
    daysOfMonth,
    formatShortDay,
    MONTH_SELECTOR_VALUES,
    parseDayKey,
    toDayKey,
    todayDate,
    weekdayLabel,
    YEAR_SELECTOR_SPAN,
    yearOptions,
} from '../../core/domain/date';
import { UI_ICONS } from '../../core/design/icons';
import type { Attachment, Category, Transaction } from '../../core/ipc/types';
import {
    useAccounts,
    useCategoryLookup,
    useDeleteTransaction,
    useSearchTransactions,
    useTransactionWindows,
} from '../../hooks/ledger';
import { useCurrentBook } from '../../hooks/ledger/useLedgerBooks';
import { useDebouncedValue } from '../../hooks/ui/useDebouncedValue';
import { useMotion } from '../../hooks/preferences/useMotion';
import { pushInfoBar } from '../../hooks/ui/globalInfoBarStore';
import { CATEGORY_VISUAL_TOKENS, useThemeTokens } from '../../hooks/theme/useThemeTokens';
import { clearNavigationIntent, navigateTo, useNavigation, useRetapHandler } from '../../app/navigationStore';
import { usePageBackHandler } from '../../app/pageBackHandler';
import { AppIcon } from '../../shared/ui/AppIcon';
import { EmptyState } from '../../shared/ui/EmptyState';
import { PeriodSelector } from '../../shared/ui/PeriodSelector';
import { Spinner } from '../../shared/ui';
import { SEARCH_RESULT_LIMIT } from '../../core/services/ledger.service';
import { ConfirmSheet } from '../../shared/ui/ConfirmSheet';
import { describeError } from '../../core/domain/errors';
import { ImageViewer } from './ImageViewer';
import { TransactionDetailSheet } from './TransactionDetailSheet';
import { TransactionRow } from './TransactionRow';
import {
    formatDayTotal,
    groupByDayWithTotals,
    initialWindow,
    isBatchTruncated,
    mergeTransactions,
    nextWindow,
    windowsToCover,
    type DayWindow,
} from './detailsPage.logic';

export function DetailsPage() {
    const navigation = useNavigation();
    const { currentBook } = useCurrentBook();
    const bookId = currentBook?.id;
    const { byId: categoryById } = useCategoryLookup();
    const { data: accounts = [] } = useAccounts(bookId);
    const { brand, surface } = useThemeTokens(CATEGORY_VISUAL_TOKENS);

    const today = useMemo(() => todayDate(), []);

    // 挂载时的一次性意图（页面切换会重建本页，所以意图只会在挂载时到达）：
    //   restoreAnchorDay 编辑返回 → 保留用户原来的选择器位置
    //   focusDay / focusTransactionId 编辑返回 → 一次把窗口铺到那天，并定位高亮
    //   date 日历跳转（P7）→ 直接定位到该日
    const mountIntentRef = useRef(navigation.intent);
    const mountIntent = mountIntentRef.current;
    const restoreAnchor = mountIntent?.restoreAnchorDay
        ? parseDayKey(mountIntent.restoreAnchorDay)
        : null;
    const jumpDate = !restoreAnchor && mountIntent?.date ? parseDayKey(mountIntent.date) : null;
    const initialDate = restoreAnchor ?? jumpDate ?? today;

    const [year, setYear] = useState(initialDate.year);
    const [month, setMonth] = useState(initialDate.month);
    const [day, setDay] = useState(initialDate.day);

    const [windows, setWindows] = useState<DayWindow[]>(() =>
        mountIntent?.restoreAnchorDay && mountIntent.focusDay
            ? windowsToCover(mountIntent.restoreAnchorDay, mountIntent.focusDay)
            : [initialWindow(toDayKey(initialDate))],
    );
    const [atEnd, setAtEnd] = useState(false);
    const [overflowed, setOverflowed] = useState(false);
    /** 编辑返回后要定位并高亮的账单 id。 */
    const [focusId, setFocusId] = useState<string | null>(() =>
        restoreAnchor && mountIntent?.focusTransactionId ? mountIntent.focusTransactionId : null,
    );
    const [flashOn, setFlashOn] = useState(false);

    const [searchInput, setSearchInput] = useState('');
    const searchKeyword = useDebouncedValue(searchInput, 250);
    const searchActive = searchKeyword.trim().length > 0;

    const [detail, setDetail] = useState<Transaction | null>(null);
    const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [viewer, setViewer] = useState<{ items: Attachment[]; index: number } | null>(null);

    const anchorKey = toDayKey({ year, month, day });
    const yearValues = useMemo(() => yearOptions(undefined, YEAR_SELECTOR_SPAN), []);
    const dayValues = useMemo(() => daysOfMonth(year, month), [year, month]);

    // 换年 / 换月：把「日」夹到当月合法范围（含闰年 2 月、月末 30/31 天）
    useEffect(() => {
        setDay((previous) => clampDay(year, month, previous));
    }, [year, month]);

    // 锚定日变化：窗口重置为该日往前 7 天（FR-DET-4：从该日最新一笔开始）
    useEffect(() => {
        setWindows([initialWindow(anchorKey)]);
        setAtEnd(false);
        setOverflowed(false);
    }, [anchorKey]);

    // 挂载意图消费完毕就清掉（避免下次进入被旧参数污染）
    useEffect(() => {
        if (mountIntent) clearNavigationIntent('details');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 重复点「明细」页签：回到最新（窗口重置；滚动到顶部由壳负责）
    useRetapHandler('details', () => {
        setWindows([initialWindow(toDayKey({ year, month, day }))]);
        setAtEnd(false);
        setOverflowed(false);
    });

    const windowQueries = useTransactionWindows(bookId, windows, !searchActive);
    const batches = useMemo(
        () => windowQueries.map((query) => query.data ?? []),
        [windowQueries],
    );
    const merged = useMemo(() => mergeTransactions(batches), [batches]);
    const groups = useMemo(() => groupByDayWithTotals(merged), [merged]);

    const firstQuery = windowQueries[0];
    const lastQuery = windowQueries.at(-1);
    const initialLoading = !searchActive && (firstQuery?.isLoading ?? false);
    const loadingMore = !searchActive && (lastQuery?.isFetching ?? false) && merged.length > 0;
    const listError = windowQueries.find((query) => query.error)?.error;

    const searchQuery = useSearchTransactions(bookId, searchKeyword);
    const searchResults = searchQuery.data ?? [];
    const searchGroups = useMemo(
        () => (searchActive ? groupByDayWithTotals(searchResults) : []),
        [searchActive, searchResults],
    );
    const searchTruncated = searchResults.length >= SEARCH_RESULT_LIMIT;

    const deleteTransaction = useDeleteTransaction();
    const motion = useMotion();

    // 继续加载更早的窗口。用 ref 让 IntersectionObserver 始终调用最新闭包。
    const loadMoreRef = useRef<() => void>(() => undefined);
    loadMoreRef.current = () => {
        if (searchActive || atEnd) return;
        const currentWindow = windows.at(-1);
        const query = windowQueries.at(-1);
        if (!currentWindow || !query) return;
        if (query.isFetching || query.data === undefined) return;
        const next = nextWindow(currentWindow, query.data);
        if (!next) {
            setAtEnd(true);
            setOverflowed(isBatchTruncated(query.data));
            return;
        }
        setWindows((previous) => [...previous, next]);
    };

    const sentinelRef = useRef<HTMLDivElement | null>(null);
    const lastLoadedAt = lastQuery?.dataUpdatedAt ?? 0;
    const lastFetching = lastQuery?.isFetching ?? false;
    useEffect(() => {
        const node = sentinelRef.current;
        if (!node || searchActive || atEnd) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) loadMoreRef.current();
            },
            { rootMargin: '240px 0px' },
        );
        observer.observe(node);
        return () => observer.disconnect();
        // 每次窗口推进 / 拉取完成都重新观察：观察时会立刻回调一次，从而继续补足屏幕
    }, [atEnd, lastFetching, lastLoadedAt, searchActive, windows.length]);

    const handleSearchClear = useCallback(() => setSearchInput(''), []);

    // 编辑返回：滚到刚改的那条账单并闪烁两次（动效关闭时用静态高亮环）
    const sectionRef = useRef<HTMLElement | null>(null);
    const focusHandledRef = useRef(false);
    useEffect(() => {
        if (!focusId || focusHandledRef.current) return;
        if (!merged.some((item) => item.id === focusId)) return;
        const node = sectionRef.current?.querySelector(`[data-transaction-id="${focusId}"]`);
        if (!node) return;
        focusHandledRef.current = true;
        setFlashOn(true);
        node.scrollIntoView({ block: 'center', behavior: motion.enabled ? 'smooth' : 'auto' });
    }, [focusId, merged, motion.enabled]);

    useEffect(() => {
        if (!flashOn) return;
        const timer = window.setTimeout(() => {
            setFlashOn(false);
            setFocusId(null);
        }, 1500);
        return () => window.clearTimeout(timer);
    }, [flashOn]);

    const handleDelete = useCallback(async () => {
        if (!pendingDelete) return;
        setDeleting(true);
        try {
            await deleteTransaction.mutateAsync(pendingDelete.id);
            pushInfoBar({
                key: 'details-delete',
                tone: 'success',
                title: '账单已删除',
                content: '相关图片附件也一并清理了',
            });
            setPendingDelete(null);
        } catch (error) {
            pushInfoBar({
                key: 'details-delete-error',
                tone: 'danger',
                title: '删除失败',
                content: describeError(error),
            });
        } finally {
            setDeleting(false);
        }
    }, [deleteTransaction, pendingDelete]);

    const handleEdit = useCallback(
        (transaction: Transaction) => {
            setDetail(null);
            // 带上当前锚定日：回程保留用户的选择器位置（不跳到被编辑账单那天）
            navigateTo('add', { editTransactionId: transaction.id, restoreAnchorDay: anchorKey });
        },
        [anchorKey],
    );

    // 返回键：全屏图片 → 删除确认 → 详情弹层 → 壳
    usePageBackHandler(() => {
        if (viewer) {
            setViewer(null);
            return true;
        }
        if (pendingDelete) {
            setPendingDelete(null);
            return true;
        }
        if (detail) {
            setDetail(null);
            return true;
        }
        return false;
    });

    const detailAccountName = detail
        ? accounts.find((account) => account.id === detail.accountId)?.name ?? '未指定账户'
        : '未指定账户';

    const shownGroups = searchActive ? searchGroups : groups;

    return (
        <section ref={sectionRef} className="flex min-h-full flex-col">
            {/* 吸附头部：上排是周期（非搜索态）/ 搜索状态摘要，下排才是搜索输入框 */}
            <div className="sticky top-0 z-10 -mx-4 bg-canvas px-4 pt-5 pb-2">
                {searchActive ? (
                    <div className="flex items-center gap-2 px-1 pb-0.5">
                        <span className="min-w-0 flex-1 truncate text-[12px] text-text-secondary">
                            搜索「{searchKeyword.trim()}」
                            <span className="ml-1 text-text-tertiary tabular-nums">
                                {searchQuery.isFetching ? '查询中…' : `${searchResults.length} 条`}
                            </span>
                        </span>
                        <button
                            type="button"
                            onClick={handleSearchClear}
                            className="shrink-0 rounded-pill bg-inset px-2.5 py-1 text-[11.5px] text-text-secondary active:bg-muted"
                        >
                            清除
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col">
                        <PeriodSelector
                            values={yearValues}
                            value={year}
                            onChange={setYear}
                            visible={3}
                            unit="年"
                            ariaLabel="选择年份"
                        />
                        <PeriodSelector
                            values={MONTH_SELECTOR_VALUES}
                            value={month}
                            onChange={setMonth}
                            unit="月"
                            ariaLabel="选择月份"
                        />
                        <PeriodSelector
                            values={dayValues}
                            value={day}
                            onChange={setDay}
                            unit="日"
                            ariaLabel="选择日期"
                            isMarked={(value) =>
                                year === today.year && month === today.month && value === today.day
                            }
                        />
                    </div>
                )}

                <div
                    data-no-swipe
                    className="mt-4 flex h-9 items-center gap-1.5 rounded-pill bg-inset px-3"
                >
                    <AppIcon name={UI_ICONS.search} size={15} className="shrink-0 text-text-tertiary" />
                    <input
                        value={searchInput}
                        onChange={(event) => setSearchInput(event.target.value)}
                        maxLength={32}
                        placeholder="搜索备注 / 分类"
                        aria-label="搜索账单"
                        className="min-w-0 flex-1 bg-transparent text-[13px] text-text placeholder:text-text-disabled focus:outline-none"
                    />
                    {searchInput.length > 0 ? (
                        <button
                            type="button"
                            onClick={handleSearchClear}
                            aria-label="清空搜索"
                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-text-tertiary active:bg-muted"
                        >
                            <AppIcon name={UI_ICONS.close} size={13} />
                        </button>
                    ) : null}
                </div>
            </div>

            <div className="flex flex-col gap-1.5 pt-3">
                {listError && !searchActive ? (
                    <EmptyState
                        icon={UI_ICONS.danger}
                        title="账单加载失败"
                        description={describeError(listError)}
                    />
                ) : searchActive && searchQuery.isError ? (
                    <EmptyState
                        icon={UI_ICONS.danger}
                        title="搜索失败"
                        description={describeError(searchQuery.error)}
                    />
                ) : initialLoading || (searchActive && searchQuery.isLoading) ? (
                    <div className="flex justify-center py-10">
                        <Spinner size="lg" />
                    </div>
                ) : shownGroups.length === 0 ? (
                    <EmptyState
                        icon={searchActive ? UI_ICONS.search : UI_ICONS.details}
                        title={searchActive ? '没有匹配的账单' : '这天及更早的 7 天都没有账单'}
                        description={
                            searchActive
                                ? '换个关键字试试（支持备注与分类名）'
                                : '换个日期，或到「添加」页记一笔'
                        }
                    />
                ) : (
                    shownGroups.map((group) => (
                        <DayGroupBlock
                            key={group.day}
                            day={group.day}
                            balanceCents={group.balanceCents}
                            items={group.items}
                            categoryById={categoryById}
                            brand={brand}
                            surface={surface}
                            focusId={focusId}
                            flashOn={flashOn}
                            flashMode={motion.enabled ? 'flash' : 'ring'}
                            onOpen={setDetail}
                        />
                    ))
                )}

                {searchActive && searchTruncated ? (
                    <p className="py-3 text-center text-[11.5px] text-text-tertiary">
                        只显示前 {SEARCH_RESULT_LIMIT} 条，缩小关键字范围更准
                    </p>
                ) : null}

                {!searchActive && !listError ? (
                    <>
                        <div ref={sentinelRef} className="h-6" aria-hidden />
                        {loadingMore ? (
                            <div className="flex justify-center py-1">
                                <Spinner size="sm" />
                            </div>
                        ) : null}
                        {atEnd && shownGroups.length > 0 ? (
                            <p className="py-3 text-center text-[11.5px] text-text-tertiary">
                                {overflowed ? '这一天记录太多，只显示了最近的一部分' : '没有更早的账单了'}
                            </p>
                        ) : null}
                    </>
                ) : null}
            </div>

            <TransactionDetailSheet
                open={detail !== null}
                onOpenChange={(open) => {
                    if (!open) setDetail(null);
                }}
                transaction={detail}
                category={detail ? categoryById.get(detail.categoryId) : undefined}
                accountName={detailAccountName}
                brand={brand}
                surface={surface}
                onEdit={() => detail && handleEdit(detail)}
                onDelete={() => {
                    const target = detail;
                    setDetail(null);
                    setPendingDelete(target);
                }}
                onViewImages={(items, index) => {
                    setDetail(null);
                    setViewer({ items, index });
                }}
            />

            <ConfirmSheet
                open={pendingDelete !== null}
                onOpenChange={(open) => {
                    if (!open) setPendingDelete(null);
                }}
                title="删除这条账单？"
                description="账单与其图片附件会被一并删除，且无法恢复；统计与账户余额会同步更新。"
                busy={deleting}
                onConfirm={() => void handleDelete()}
            />

            {viewer ? (
                <ImageViewer
                    items={viewer.items}
                    index={viewer.index}
                    onIndexChange={(index) => setViewer((previous) => (previous ? { ...previous, index } : previous))}
                    onClose={() => setViewer(null)}
                />
            ) : null}
        </section>
    );
}

function DayGroupBlock({
    day,
    balanceCents,
    items,
    categoryById,
    brand,
    surface,
    focusId,
    flashOn,
    flashMode,
    onOpen,
}: {
    day: string;
    balanceCents: number;
    items: ReadonlyArray<Transaction>;
    categoryById: Map<string, Category>;
    brand: string;
    surface: string;
    /** 编辑返回后要高亮的账单 id。 */
    focusId: string | null;
    flashOn: boolean;
    flashMode: 'flash' | 'ring';
    onOpen: (transaction: Transaction) => void;
}) {
    const date = parseDayKey(day);
    return (
        <section className="flex flex-col gap-1.5">
            <header className="flex items-baseline gap-2 px-1 pt-2">
                <span className="h-3 w-[3px] shrink-0 self-center rounded-full bg-brand" aria-hidden />
                <span className="text-[13px] font-semibold text-text tabular-nums">
                    {formatShortDay(day)}
                </span>
                {date ? (
                    <span className="text-[12px] text-text-tertiary">{weekdayLabel(date)}</span>
                ) : null}
                <span className="ml-auto text-[11.5px] text-text-tertiary">
                    总计 <span className="tabular-nums">{formatDayTotal(balanceCents)}</span>
                </span>
            </header>
            {items.map((item) => (
                <TransactionRow
                    key={item.id}
                    transaction={item}
                    category={categoryById.get(item.categoryId)}
                    brand={brand}
                    surface={surface}
                    highlight={flashOn && focusId === item.id ? flashMode : undefined}
                    onOpen={() => onOpen(item)}
                />
            ))}
        </section>
    );
}

export default DetailsPage;
