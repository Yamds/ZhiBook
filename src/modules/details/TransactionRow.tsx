// 明细列表行：时间 + 分类（图标 + 名称）+ 备注（截断）+ 金额。

import { categoryColors } from '../../core/design/categoryColor';
import { FALLBACK_ICON_NAME, toIconName } from '../../core/design/icons';
import { formatClockTime } from '../../core/domain/date';
import { formatSignedMoney } from '../../core/domain/money';
import type { Category, Transaction } from '../../core/ipc/types';
import { AppIcon } from '../../shared/ui/AppIcon';
import { cn } from '../../shared/utils/cn';

export interface TransactionRowProps {
    transaction: Transaction;
    /** 分类元信息（可能已软删除；缺失时用兜底图标与「未知分类」）。 */
    category: Category | undefined;
    /** 主题解析后的品牌色 / 卡片面色（由页面统一读一次，避免每行做 DOM 探针）。 */
    brand: string;
    surface: string;
    /**
     * 编辑返回后的强调：`flash` = 交替闪烁两次（动效开启），
     * `ring` = 静态高亮环（动效关闭时也要看得出是哪一条）。
     */
    highlight?: 'flash' | 'ring';
    onOpen: () => void;
}

export function TransactionRow({
    transaction,
    category,
    brand,
    surface,
    highlight,
    onOpen,
}: TransactionRowProps) {
    const colors = categoryColors(category?.color ?? 'theme', brand, surface);
    const isIncome = transaction.kind === 'income';

    return (
        <button
            type="button"
            data-transaction-id={transaction.id}
            onClick={onOpen}
            className={cn(
                'flex w-full items-center gap-3 rounded-lg bg-surface px-3 py-2.5 text-left shadow-card',
                'active:bg-muted',
                highlight === 'flash' && 'ndf-row-flash',
                highlight === 'ring' && 'ring-2 ring-brand',
            )}
        >
            <span
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                style={{ background: colors.background, color: colors.foreground }}
            >
                <AppIcon
                    name={toIconName(category?.iconName ?? FALLBACK_ICON_NAME)}
                    size={22}
                />
            </span>

            <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-baseline gap-2">
                    <span className="truncate text-[14px] font-medium text-text">
                        {category?.name ?? '未知分类'}
                    </span>
                    <span className="shrink-0 text-[11px] text-text-tertiary tabular-nums">
                        {formatClockTime(transaction.occurredAtMs)}
                    </span>
                </span>
                {transaction.note ? (
                    <span className="truncate text-[12px] text-text-tertiary">{transaction.note}</span>
                ) : null}
            </span>

            <span
                className={cn(
                    'shrink-0 text-[15px] font-semibold tabular-nums',
                    isIncome ? 'text-success' : 'text-text',
                )}
            >
                {formatSignedMoney(transaction.amountCents, transaction.kind)}
            </span>
        </button>
    );
}

export default TransactionRow;
