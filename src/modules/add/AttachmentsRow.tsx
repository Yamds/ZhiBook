// 附件缩略图行：可横滑浏览、逐张删除。
//
// 两种来源（Q3 编辑复用）：
//   - pending：刚选中、还没落盘的图（base64 在页面状态里）；
//   - existing：账单已经存过的图（编辑模式才出现，按需读取内容）。
//
// 删除在页面层是「延迟生效」的：编辑模式下先把 id 记进待删清单，
// 点保存才真正删文件，避免「删了图又取消编辑」导致图片已经没了。

import type { Attachment } from '../../core/ipc/types';
import { useTranslation } from 'react-i18next';
import { UI_ICONS } from '../../core/design/icons';
import { useAttachmentData } from '../../hooks/ledger';
import { AppIcon } from '../../shared/ui/AppIcon';
import { formatBytes, type PendingAttachment } from './image';

export type AttachmentStripItem =
    | { readonly kind: 'pending'; readonly attachment: PendingAttachment }
    | { readonly kind: 'existing'; readonly attachment: Attachment };

export interface AttachmentsRowProps {
    items: ReadonlyArray<AttachmentStripItem>;
    /** 参数是待删项的 localId（pending）或附件 id（existing）。 */
    onRemove: (key: string) => void;
}

export function AttachmentsRow({ items, onRemove }: AttachmentsRowProps) {
    if (items.length === 0) return null;
    return (
        <div
            data-swipe-scroll
            className="scrollbar-hide flex gap-2 overflow-x-auto overscroll-x-contain px-3 pt-1.5"
        >
            {items.map((item) =>
                item.kind === 'pending' ? (
                    <Thumb
                        key={item.attachment.localId}
                        dataUrl={item.attachment.dataUrl}
                        label={formatBytes(item.attachment.byteSize)}
                        onRemove={() => onRemove(item.attachment.localId)}
                    />
                ) : (
                    <ExistingThumb
                        key={item.attachment.id}
                        attachment={item.attachment}
                        onRemove={() => onRemove(item.attachment.id)}
                    />
                ),
            )}
        </div>
    );
}

function ExistingThumb({
    attachment,
    onRemove,
}: {
    attachment: Attachment;
    onRemove: () => void;
}) {
    // 只加载当前这一张：9 张全量读进内存没必要（T3.9 附件方案）
    const { data } = useAttachmentData(attachment.id);
    const dataUrl = data ? `data:${data.attachment.mime};base64,${data.base64}` : undefined;
    return <Thumb dataUrl={dataUrl} label={formatBytes(attachment.byteSize)} onRemove={onRemove} />;
}

function Thumb({
    dataUrl,
    label,
    onRemove,
}: {
    dataUrl: string | undefined;
    label: string;
    onRemove: () => void;
}) {
    const { t } = useTranslation();
    return (
        <div className="relative shrink-0">
            {dataUrl ? (
                <img
                    src={dataUrl}
                    alt={t('add.pendingAttachmentAlt')}
                    className="h-14 w-14 rounded-md border border-border-subtle object-cover"
                />
            ) : (
                <div className="h-14 w-14 animate-pulse rounded-md border border-border-subtle bg-inset" />
            )}
            <button
                type="button"
                aria-label={t('add.removeThisImage')}
                onClick={onRemove}
                className="absolute -top-1.5 -right-1.5 inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-danger text-white shadow-card"
            >
                <AppIcon name={UI_ICONS.close} size={11} />
            </button>
            <span className="absolute bottom-0.5 left-0.5 rounded-xs bg-black/55 px-1 text-[9px] text-white">
                {label}
            </span>
        </div>
    );
}

export default AttachmentsRow;
