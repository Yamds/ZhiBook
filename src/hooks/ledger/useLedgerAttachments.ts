// 附件：元信息列表、按需读取内容（base64）、保存与删除。
//
// 保存的字节流由前端负责压缩（长边 ≤1600px、JPEG 80，Q8），这里只传 mime + base64。
// 读取是**按需**的：只有真正要显示某张图时才拉内容，避免一次性把 9 张图读进内存。

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NewAttachment } from '../../core/ipc/types';
import { ledgerService } from '../../core/services/ledger.service';
import { ledgerInvalidation, ledgerKeys } from './queryKeys';

export function useAttachments(transactionId: string | undefined) {
    return useQuery({
        queryKey: ledgerKeys.attachments(transactionId ?? ''),
        queryFn: () => ledgerService.listAttachments(transactionId ?? ''),
        enabled: Boolean(transactionId),
    });
}

/** 按需读取单张附件内容（`enabled=false` 时不发请求）。 */
export function useAttachmentData(attachmentId: string | undefined, enabled = true) {
    return useQuery({
        queryKey: ledgerKeys.attachmentData(attachmentId ?? ''),
        queryFn: () => ledgerService.readAttachment(attachmentId ?? ''),
        enabled: Boolean(attachmentId) && enabled,
        staleTime: Infinity,
    });
}

function useInvalidateAttachments() {
    const client = useQueryClient();
    return () =>
        Promise.all(
            ledgerInvalidation.afterAttachmentWrite.map((queryKey) =>
                client.invalidateQueries({ queryKey }),
            ),
        );
}

export function useSaveAttachment() {
    const invalidate = useInvalidateAttachments();
    return useMutation({
        mutationFn: (input: NewAttachment) => ledgerService.saveAttachment(input),
        onSuccess: () => void invalidate(),
    });
}

export function useDeleteAttachment() {
    const invalidate = useInvalidateAttachments();
    return useMutation({
        mutationFn: (id: string) => ledgerService.deleteAttachment(id),
        onSuccess: () => void invalidate(),
    });
}
