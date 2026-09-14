import { describe, expect, it } from 'vitest';
import type { CloudBackupSummary, MergeSummary } from '../../../core/ipc/types';
import {
    backupSummaryText,
    countsSummary,
    formatBytes,
    formatFingerprint,
    mergeSummaryText,
    normalizeKeyInput,
    restorePreviewText,
} from './cloud.logic';

const emptyMerge: MergeSummary = {
    books: { added: 0, updated: 0, deleted: 0 },
    accounts: { added: 0, updated: 0, deleted: 0 },
    categories: { added: 0, updated: 0, deleted: 0 },
    transactions: { added: 0, updated: 0, deleted: 0 },
    attachments: { added: 0, updated: 0, deleted: 0 },
    recurringRules: { added: 0, updated: 0, deleted: 0 },
    recurringRuns: { added: 0, updated: 0, deleted: 0 },
};

describe('cloud.logic', () => {
    it('countsSummary 汇总四类计数', () => {
        expect(
            countsSummary({ books: 2, accounts: 3, categories: 10, transactions: 42, attachments: 5, recurringRules: 1 }),
        ).toBe('2 个账本 · 42 笔账单 · 5 张附件 · 1 条固定收支');
    });

    it('formatFingerprint 按 4 位分组', () => {
        expect(formatFingerprint('a1b2c3d4')).toBe('a1b2 c3d4');
        expect(formatFingerprint('ab')).toBe('ab');
    });

    it('mergeSummaryText 只展示实际发生的变化', () => {
        expect(mergeSummaryText(null)).toBeNull();
        expect(mergeSummaryText(emptyMerge)).toBeNull();
        const merge: MergeSummary = {
            ...emptyMerge,
            transactions: { added: 2, updated: 1, deleted: 1 },
            recurringRules: { added: 0, updated: 1, deleted: 0 },
        };
        expect(mergeSummaryText(merge)).toBe(
            '已合并另一台设备的更新：新增 2 笔账单、更新 1 笔账单、删除 1 笔账单、更新 1 条固定收支',
        );
    });

    it('formatBytes 使用合适单位', () => {
        expect(formatBytes(512)).toBe('512 B');
        expect(formatBytes(2048)).toBe('2.0 KB');
        expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
    });

    it('backupSummaryText 区分「无变化」与真实推送', () => {
        const base: CloudBackupSummary = {
            pushed: false,
            commit: null,
            merged: null,
            uploadedBytes: 0,
            fileCount: 3,
            backedUpAtMs: 0,
            attachmentsMissing: 0,
        };
        expect(backupSummaryText(base)).toBe('内容没有变化，无需新增备份');
        expect(backupSummaryText({ ...base, pushed: true, uploadedBytes: 2048 })).toBe(
            '已备份 3 个文件（上传 2.0 KB）',
        );
    });

    it('restorePreviewText 覆盖三种状态', () => {
        const locked = {
            keyId: 'k-1',
            fingerprint: 'aabbccdd',
            createdAtMs: 0,
            needsKey: true,
            hasPassphrase: true,
            counts: null,
            fromLocalKey: false,
        };
        expect(restorePreviewText(locked)).toContain('输入口令或恢复密钥');
        expect(restorePreviewText({ ...locked, hasPassphrase: false })).toContain('输入恢复密钥');
        expect(
            restorePreviewText({
                ...locked,
                needsKey: false,
                fromLocalKey: false,
                counts: { books: 1, accounts: 0, categories: 0, transactions: 2, attachments: 0, recurringRules: 0 },
            }),
        ).toContain('使用新解锁的密钥');
        expect(
            restorePreviewText({
                ...locked,
                needsKey: false,
                fromLocalKey: true,
                counts: { books: 1, accounts: 0, categories: 0, transactions: 2, attachments: 0, recurringRules: 0 },
            }),
        ).toBe('1 个账本 · 2 笔账单 · 0 张附件 · 0 条固定收支');
    });

    it('normalizeKeyInput 去分组并统一大小写', () => {
        expect(normalizeKeyInput('recovery', 'abcd-efgh ijkl')).toBe('ABCDEFGHIJKL');
        expect(normalizeKeyInput('passphrase', ' my pass phrase ')).toBe('mypassphrase');
    });
});
