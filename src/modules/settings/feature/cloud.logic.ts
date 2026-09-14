// 云端备份的纯展示逻辑（可单测，不依赖 React / IPC）。
//
// 文案一律走 `core/i18n` 的 `t()`：本模块不是组件，拿不到 `useTranslation`
// 的订阅，但调用方都是「语言变化时会重渲染」的组件（设置页 / 云端弹层），
// 所以读「当下语言」即可。

import { t } from '../../../core/i18n';
import type { BackupCounts, CloudBackupSummary, CloudRestorePreview, MergeSummary } from '../../../core/ipc/types';

/** 单条计数的量词单位（借 i18next 的 count 复数：中文只有 other，英文会走 one/other）。 */
function unit(key: string, count: number): string {
    return t(`unit.${key}`, { count });
}

/** 迁移 / 备份计数文案（与导入导出口径一致）。 */
export function countsSummary(counts: BackupCounts): string {
    return [
        unit('book', counts.books),
        unit('transaction', counts.transactions),
        unit('attachment', counts.attachments),
        unit('recurringRule', counts.recurringRules),
    ].join(t('common.dotSeparator'));
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
    const collect = (key: string, added: number, updated: number, deleted: number) => {
        if (added > 0) parts.push(t('settings.cloud.merge.added', { item: unit(key, added) }));
        if (updated > 0) parts.push(t('settings.cloud.merge.updated', { item: unit(key, updated) }));
        if (deleted > 0) parts.push(t('settings.cloud.merge.deleted', { item: unit(key, deleted) }));
    };
    collect('transaction', merge.transactions.added, merge.transactions.updated, merge.transactions.deleted);
    collect('recurringRule', merge.recurringRules.added, merge.recurringRules.updated, merge.recurringRules.deleted);
    collect('book', merge.books.added, merge.books.updated, merge.books.deleted);
    collect('account', merge.accounts.added, merge.accounts.updated, merge.accounts.deleted);
    collect('category', merge.categories.added, merge.categories.updated, 0);
    collect('attachment', merge.attachments.added, 0, merge.attachments.deleted);
    if (parts.length === 0) return null;
    return t('settings.cloud.merge.summary', {
        parts: parts.join(t('common.enumSeparator')),
    });
}

/** 字节数 → 人类可读。 */
export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** 备份结果主文案。 */
export function backupSummaryText(summary: CloudBackupSummary): string {
    if (!summary.pushed) return t('settings.cloud.backupNoChange');
    return t('settings.cloud.backupPushed', {
        count: summary.fileCount,
        size: formatBytes(summary.uploadedBytes),
    });
}

/** 恢复预览文案（含密钥来源提示）。 */
export function restorePreviewText(preview: CloudRestorePreview): string {
    if (preview.needsKey) {
        return preview.hasPassphrase
            ? t('settings.cloud.restoreNeedKeyWithPassphrase')
            : t('settings.cloud.restoreNeedKeyRecoveryOnly');
    }
    if (!preview.counts) return t('settings.cloud.restoreReady');
    const base = countsSummary(preview.counts);
    return preview.fromLocalKey ? base : t('settings.cloud.restoreWithNewKey', { base });
}

/** 恢复密钥 / 口令输入的归一化：去掉空格与分组连字符、恢复密钥转大写。 */
export function normalizeKeyInput(kind: string, value: string): string {
    const stripped = value.replace(/[\s-]+/g, '');
    return kind === 'recovery' ? stripped.toUpperCase() : stripped;
}
