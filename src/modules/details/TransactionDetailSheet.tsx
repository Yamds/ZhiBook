// 账单详情弹层（BRD FR-DET-6 / FR-DET-7）：
// 分类与金额、日期时间与备注、图片附件网格；底部是编辑 / 删除入口。
//
// 图片按需读取（`useAttachmentData`），点缩略图交给页面打开全屏查看器——
// 查看器单独挂在页面层，避免和 BottomSheet 的焦点陷阱 / 外点关闭互相干扰。

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { categoryColors } from '../../core/design/categoryColor';
import { categoryDisplayName } from '../../core/domain/categoryName';
import { FALLBACK_ICON_NAME, toIconName, UI_ICONS } from '../../core/design/icons';
import { formatDateLabel, formatClockTime } from '../../core/domain/date';
import { formatMoney, formatSignedMoney } from '../../core/domain/money';
import type { Attachment, Category, Transaction } from '../../core/ipc/types';
import { useAttachmentData, useAttachments } from '../../hooks/ledger';
import { AppIcon } from '../../shared/ui/AppIcon';
import { BottomSheet } from '../../shared/ui/BottomSheet';
import { cn } from '../../shared/utils/cn';

export interface TransactionDetailSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    transaction: Transaction | null;
    category: Category | undefined;
    accountName: string;
    brand: string;
    surface: string;
    onEdit: () => void;
    onDelete: () => void;
    /** 点缩略图：把当前附件列表与下标交给页面开全屏查看器。 */
    onViewImages: (attachments: Attachment[], index: number) => void;
}

export function TransactionDetailSheet({
    open,
    onOpenChange,
    transaction,
    category,
    accountName,
    brand,
    surface,
    onEdit,
    onDelete,
    onViewImages,
}: TransactionDetailSheetProps) {
    const { t } = useTranslation();
    // 关闭过程中保留最后一条账单，避免退场动画里内容先是空的（一闪）
    const [shown, setShown] = useState<Transaction | null>(transaction);
    useEffect(() => {
        if (transaction) setShown(transaction);
    }, [transaction]);

    return (
        <BottomSheet
            open={open && shown !== null}
            onOpenChange={onOpenChange}
            title={t('details.sheetTitle')}
            maxHeightRatio={0.9}
        >
            {shown ? (
                <DetailBody
                    transaction={shown}
                    category={category}
                    accountName={accountName}
                    brand={brand}
                    surface={surface}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onViewImages={onViewImages}
                />
            ) : null}
        </BottomSheet>
    );
}

function DetailBody({
    transaction,
    category,
    accountName,
    brand,
    surface,
    onEdit,
    onDelete,
    onViewImages,
}: {
    transaction: Transaction;
    category: Category | undefined;
    accountName: string;
    brand: string;
    surface: string;
    onEdit: () => void;
    onDelete: () => void;
    onViewImages: (attachments: Attachment[], index: number) => void;
}) {
    const { t } = useTranslation();
    const colors = categoryColors(category?.color ?? 'theme', brand, surface);
    const { data: attachments = [] } = useAttachments(transaction.id);
    const isIncome = transaction.kind === 'income';

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
                <span
                    className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
                    style={{ background: colors.background, color: colors.foreground }}
                >
                    <AppIcon name={toIconName(category?.iconName ?? FALLBACK_ICON_NAME)} size={24} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-semibold text-text">
                        {categoryDisplayName(category, t, t('settings.recurring.unknownCategory'))}
                    </span>
                    <span className="text-[11.5px] text-text-tertiary">
                        {isIncome ? t('entryKind.income') : t('entryKind.expense')}
                    </span>
                </div>
                <span
                    className={cn(
                        'shrink-0 text-[20px] font-semibold tabular-nums',
                        isIncome ? 'text-success' : 'text-text',
                    )}
                >
                    {formatSignedMoney(transaction.amountCents, transaction.kind)}
                </span>
            </div>

            <div className="flex flex-col gap-0.5 rounded-lg bg-inset px-3">
                <InfoRow label={t('details.date')} value={formatDateLabel(transaction.occurredAtMs)} />
                <InfoRow label={t('details.time')} value={formatClockTime(transaction.occurredAtMs)} />
                <InfoRow label={t('add.account')} value={accountName} />
                <InfoRow
                    label={t('add.note')}
                    value={transaction.note || '—'}
                    valueClassName={transaction.note ? undefined : 'text-text-disabled'}
                />
                <InfoRow label={t('add.amount')} value={formatMoney(transaction.amountCents)} />
                <InfoRow
                    label={t('details.createdAt')}
                    value={`${formatDateLabel(transaction.createdAtMs)} ${formatClockTime(transaction.createdAtMs)}`}
                    valueClassName="text-text-tertiary"
                />
            </div>

            {attachments.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                    <h3 className="px-1 text-[11px] font-medium text-text-tertiary">
                        图片 · {attachments.length} 张
                    </h3>
                    <div className="grid grid-cols-3 gap-2">
                        {attachments.map((attachment, index) => (
                            <AttachmentThumb
                                key={attachment.id}
                                attachment={attachment}
                                onOpen={() => onViewImages(attachments, index)}
                            />
                        ))}
                    </div>
                </div>
            ) : null}

            <div className="flex items-center gap-2 pt-1">
                <button
                    type="button"
                    onClick={onEdit}
                    className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md bg-inset text-[13.5px] font-medium text-text-secondary active:bg-muted"
                >
                    <AppIcon name={UI_ICONS.edit} size={16} />
                    编辑
                </button>
                <button
                    type="button"
                    onClick={onDelete}
                    className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md bg-danger-soft text-[13.5px] font-medium text-danger active:opacity-90"
                >
                    <AppIcon name={UI_ICONS.trash} size={16} />
                    删除
                </button>
            </div>
        </div>
    );
}

function InfoRow({
    label,
    value,
    valueClassName,
}: {
    label: string;
    value: string;
    valueClassName?: string;
}) {
    return (
        <div className="flex items-center gap-3 border-b border-border-subtle py-2.5 last:border-b-0">
            <span className="w-10 shrink-0 text-[12px] text-text-tertiary">{label}</span>
            <span className={cn('min-w-0 flex-1 text-[13px] text-text', valueClassName)}>
                {value}
            </span>
        </div>
    );
}

function AttachmentThumb({
    attachment,
    onOpen,
}: {
    attachment: Attachment;
    onOpen: () => void;
}) {
    const { t } = useTranslation();
    const { data, isError } = useAttachmentData(attachment.id);
    const dataUrl = data ? `data:${data.attachment.mime};base64,${data.base64}` : undefined;

    return (
        <button
            type="button"
            onClick={onOpen}
            aria-label={dataUrl ? t('details.viewFullImage') : t('details.imageReadFailed')}
            className="relative aspect-square overflow-hidden rounded-md border border-border-subtle active:opacity-90"
        >
            {dataUrl ? (
                <img src={dataUrl} alt={t('details.attachmentAlt')} className="h-full w-full object-cover" />
            ) : (
                <span className="flex h-full w-full items-center justify-center bg-inset text-text-tertiary">
                    <AppIcon name={isError ? UI_ICONS.warning : UI_ICONS.image} size={18} />
                </span>
            )}
        </button>
    );
}

export default TransactionDetailSheet;
