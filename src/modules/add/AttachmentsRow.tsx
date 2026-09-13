// 待保存附件的缩略图行：可横滑浏览、逐张删除。
//
// 图片此时还只是 base64（没落盘），保存成功后才由后端写文件。

import { UI_ICONS } from '../../core/design/icons';
import { AppIcon } from '../../shared/ui/AppIcon';
import { formatBytes, type PendingAttachment } from './image';

export interface AttachmentsRowProps {
    attachments: ReadonlyArray<PendingAttachment>;
    onRemove: (localId: string) => void;
}

export function AttachmentsRow({ attachments, onRemove }: AttachmentsRowProps) {
    if (attachments.length === 0) return null;
    return (
        <div
            data-swipe-scroll
            className="scrollbar-hide flex gap-2 overflow-x-auto overscroll-x-contain px-3 pt-1.5"
        >
            {attachments.map((attachment) => (
                <div key={attachment.localId} className="relative shrink-0">
                    <img
                        src={attachment.dataUrl}
                        alt="待保存的附件"
                        className="h-14 w-14 rounded-md border border-border-subtle object-cover"
                    />
                    <button
                        type="button"
                        aria-label="删除这张图"
                        onClick={() => onRemove(attachment.localId)}
                        className="absolute -top-1.5 -right-1.5 inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-danger text-white shadow-card"
                    >
                        <AppIcon name={UI_ICONS.close} size={11} />
                    </button>
                    <span className="absolute bottom-0.5 left-0.5 rounded-xs bg-black/55 px-1 text-[9px] text-white">
                        {formatBytes(attachment.byteSize)}
                    </span>
                </div>
            ))}
        </div>
    );
}

export default AttachmentsRow;
