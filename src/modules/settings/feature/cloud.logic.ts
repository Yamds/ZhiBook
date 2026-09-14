// 云端备份的纯展示逻辑（可单测，不依赖 React / IPC）。

import type { BackupCounts, CloudBackupSummary, CloudRestorePreview, MergeSummary } from '../../../core/ipc/types';

/** 迁移 / 备份计数文案（与导入导出口径一致）。 */
export function countsSummary(counts: BackupCounts): string {
    return `${counts.books} 个账本 · ${counts.transactions} 笔账单 · ${counts.attachments} 张附件 · ${counts.recurringRules} 条固定收支`;
}

/** 密钥指纹：8 位 hex → 两组 4 位（便于肉眼核对）。 */
export function formatFingerprint(fingerprint: string): string {
    const trimmed = fingerprint.trim();
    if (trimmed.length <= 4) return trimmed;
    return `${trimmed.slice(0, 4)} ${trimmed.slice(4)}`;
}

/** 合并结果文案；没有可展示的变化时返回 null。 */
export function mergeSummaryText(merge: MergeSummary | null | undefined): string | null {
    if (!merge) return null;
    const parts: string[] = [];
    if (merge.transactions.added > 0) parts.push(`新增 ${merge.transactions.added} 笔账单`);
    if (merge.transactions.updated > 0) parts.push(`更新 ${merge.transactions.updated} 笔账单`);
    if (merge.transactions.deleted > 0) parts.push(`删除 ${merge.transactions.deleted} 笔账单`);
    if (merge.recurringRules.added > 0) parts.push(`新增 ${merge.recurringRules.added} 条固定收支`);
    if (merge.recurringRules.updated > 0) parts.push(`更新 ${merge.recurringRules.updated} 条固定收支`);
    if (merge.recurringRules.deleted > 0) parts.push(`删除 ${merge.recurringRules.deleted} 条固定收支`);
    if (merge.books.added > 0) parts.push(`新增 ${merge.books.added} 个账本`);
    if (merge.books.updated > 0) parts.push(`更新 ${merge.books.updated} 个账本`);
    if (merge.books.deleted > 0) parts.push(`删除 ${merge.books.deleted} 个账本`);
    if (merge.accounts.added > 0) parts.push(`新增 ${merge.accounts.added} 个账户`);
    if (merge.accounts.updated > 0) parts.push(`更新 ${merge.accounts.updated} 个账户`);
    if (merge.accounts.deleted > 0) parts.push(`删除 ${merge.accounts.deleted} 个账户`);
    if (merge.categories.added > 0) parts.push(`新增 ${merge.categories.added} 个分类`);
    if (merge.categories.updated > 0) parts.push(`更新 ${merge.categories.updated} 个分类`);
    if (merge.attachments.added > 0) parts.push(`新增 ${merge.attachments.added} 张附件`);
    if (merge.attachments.deleted > 0) parts.push(`删除 ${merge.attachments.deleted} 张附件`);
    if (parts.length === 0) return null;
    return `已合并另一台设备的更新：${parts.join('、')}`;
}

/** 字节数 → 人类可读。 */
export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** 备份结果主文案。 */
export function backupSummaryText(summary: CloudBackupSummary): string {
    if (!summary.pushed) return '内容没有变化，无需新增备份';
    return `已备份 ${summary.fileCount} 个文件（上传 ${formatBytes(summary.uploadedBytes)}）`;
}

/** 恢复预览文案（含密钥来源提示）。 */
export function restorePreviewText(preview: CloudRestorePreview): string {
    if (preview.needsKey) {
        return preview.hasPassphrase
            ? '本机没有备份密钥：输入口令或恢复密钥后可预览云端内容'
            : '本机没有备份密钥：输入恢复密钥后可预览云端内容';
    }
    if (!preview.counts) return '云端内容已就绪';
    const base = countsSummary(preview.counts);
    return preview.fromLocalKey ? base : `${base}（使用新解锁的密钥）`;
}

/** 恢复密钥 / 口令输入的归一化：去掉空格与分组连字符、恢复密钥转大写。 */
export function normalizeKeyInput(kind: string, value: string): string {
    const stripped = value.replace(/[\s-]+/g, '');
    return kind === 'recovery' ? stripped.toUpperCase() : stripped;
}
