// 附件丢失 / 读取失败：查看器要显示占位而不是白屏或抛错（BRD §7）。

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Attachment } from '../../core/ipc/types';
import { ImageViewer } from './ImageViewer';

vi.mock('../../core/services/ledger.service', () => ({
    ledgerService: {
        readAttachment: vi.fn(() => Promise.reject(new Error('attachment missing'))),
    },
}));

const ATTACHMENT: Attachment = {
    id: 'att_missing',
    transactionId: 'txn_1',
    path: 'ledger/attachments/txn_1/att_missing.jpg',
    mime: 'image/jpeg',
    byteSize: 1024,
    sortOrder: 0,
    createdAtMs: 1,
};

describe('ImageViewer 附件异常', () => {
    it('读取失败时显示占位，查看器本身仍可用', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(
            <QueryClientProvider client={client}>
                <ImageViewer items={[ATTACHMENT]} index={0} onIndexChange={() => {}} onClose={() => {}} />
            </QueryClientProvider>,
        );

        expect(await screen.findByText('这张图片读不出来')).toBeTruthy();
        // 关闭按钮与页码仍在（不阻塞查看器）
        expect(screen.getByLabelText('关闭图片查看器')).toBeTruthy();
        expect(screen.getByText('1 / 1')).toBeTruthy();
    });
});
