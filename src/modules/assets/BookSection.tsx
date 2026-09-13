// 账本区（FR-AST-3 / FR-AST-4 / FR-AST-5）：列出账本、切换、新建、重命名、删除。
//
// 切换账本 = 全应用换一套数据（账单 / 明细 / 统计 / 日历 / 资产），
// 失效矩阵在 `hooks/ledger/queryKeys.ts` 的 `afterBookWrite` 里已覆盖。

import type { Book } from '../../core/ipc/types';
import { UI_ICONS } from '../../core/design/icons';
import { AppIcon } from '../../shared/ui/AppIcon';
import { Badge, Card } from '../../shared/ui';
import { cn } from '../../shared/utils/cn';

export interface BookSectionProps {
    books: readonly Book[];
    currentBookId: string | undefined;
    busyBookId: string | null;
    onSwitch: (book: Book) => void;
    onCreate: () => void;
    onEdit: (book: Book) => void;
}

export function BookSection({
    books,
    currentBookId,
    busyBookId,
    onSwitch,
    onCreate,
    onEdit,
}: BookSectionProps) {
    return (
        <Card className="flex flex-col gap-2 rounded-lg p-3.5">
            <header className="flex items-center justify-between gap-2">
                <h2 className="text-[13px] font-semibold text-text">账本</h2>
                <button
                    type="button"
                    onClick={onCreate}
                    className="inline-flex h-7 items-center gap-1 rounded-pill bg-brand-soft px-2.5 text-[11.5px] font-medium text-brand active:opacity-80"
                >
                    <AppIcon name={UI_ICONS.plus} size={13} />
                    新建账本
                </button>
            </header>

            <p className="text-[11px] leading-relaxed text-text-tertiary">
                切换账本会同时切换账单、明细、统计与资产数据；分类是所有账本共用的。
            </p>

            <div className="flex flex-col divide-y divide-border-subtle/70">
                {books.map((book) => {
                    const current = book.id === currentBookId;
                    return (
                        <div key={book.id} className="flex items-center gap-2 py-1">
                            <button
                                type="button"
                                onClick={() => onSwitch(book)}
                                aria-current={current ? 'true' : undefined}
                                data-book-id={book.id}
                                className={cn(
                                    'flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1.5 text-left',
                                    !current && 'active:bg-inset',
                                )}
                            >
                                <span className="min-w-0 flex-1 truncate text-[13px] text-text">
                                    {book.name}
                                </span>
                                {current ? (
                                    <Badge tone="brand" appearance="soft">
                                        {busyBookId === book.id ? '切换中…' : '当前'}
                                    </Badge>
                                ) : null}
                            </button>
                            <button
                                type="button"
                                onClick={() => onEdit(book)}
                                aria-label={`管理账本 ${book.name}`}
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-tertiary active:bg-inset"
                            >
                                <AppIcon name={UI_ICONS.edit} size={16} />
                            </button>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}

export default BookSection;
