// 数据导入 / 导出：导出全量 zip（含附件）；导入为**覆盖式恢复**（导入前自动快照）。

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { formatDateLabel } from '../../../core/domain/date';
import { t as translate } from '../../../core/i18n';
import type { BackupCounts, BackupPreview } from '../../../core/ipc/types';
import { fileBridge, registerImportFileHandler } from '../../../core/platform/fileBridge';
import { backupService } from '../../../core/services/backup.service';
import { ledgerKeys } from '../../../hooks/ledger/queryKeys';
import { pushInfoBar } from '../../../hooks/ui/globalInfoBarStore';
import { BottomSheet } from '../../../shared/ui/BottomSheet';
import { ConfirmSheet } from '../../../shared/ui/ConfirmSheet';
import { cn } from '../../../shared/utils/cn';

export interface DataTransferSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

function showError(error: unknown) {
    pushInfoBar({
        key: 'backup-error',
        tone: 'danger',
        title: translate('settings.transfer.failedTitle'),
        content: error instanceof Error ? error.message : String(error),
    });
}

function countsText(counts: BackupCounts): string {
    return [
        translate('unit.book', { count: counts.books }),
        translate('unit.transaction', { count: counts.transactions }),
        translate('unit.attachment', { count: counts.attachments }),
        translate('unit.recurringRule', { count: counts.recurringRules }),
    ].join(translate('common.dotSeparator'));
}

export function DataTransferSheet({ open, onOpenChange }: DataTransferSheetProps) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [exporting, setExporting] = useState(false);
    const [importing, setImporting] = useState(false);
    const [preview, setPreview] = useState<{ path: string; info: BackupPreview } | null>(null);

    // 原生选完文件后回调路径 → 先预览再确认。
    useEffect(() => {
        if (!open) return;
        return registerImportFileHandler((path) => {
            void backupService
                .previewBackup(path)
                .then((info) => setPreview({ path, info }))
                .catch(showError);
        });
    }, [open]);

    const handleExport = async () => {
        setExporting(true);
        try {
            const summary = await backupService.exportData();
            const stamp = new Date().toISOString().slice(0, 10);
            fileBridge.saveFile(summary.path, t('settings.transfer.exportFileName', { stamp }));
            pushInfoBar({
                key: 'backup-export',
                tone: 'success',
                title: t('settings.transfer.exportDone'),
                content: t('settings.transfer.exportDoneBody'),
            });
        } catch (error) {
            showError(error);
        } finally {
            setExporting(false);
        }
    };

    const handleImport = async () => {
        if (!preview) return;
        setImporting(true);
        try {
            const result = await backupService.importData(preview.path);
            await queryClient.invalidateQueries({ queryKey: ledgerKeys.all });
            pushInfoBar({
                key: 'backup-import',
                tone: 'success',
                title: t('settings.transfer.restoredCount', { count: result.counts.transactions }),
                content: result.preImportBackupPath ? t('settings.transfer.preImportSnapshot') : undefined,
            });
            setPreview(null);
            onOpenChange(false);
        } catch (error) {
            showError(error);
        } finally {
            setImporting(false);
        }
    };

    const available = fileBridge.isAvailable();

    return (
        <>
            <BottomSheet
                open={open}
                onOpenChange={onOpenChange}
                title={t('settings.feature.dataTransfer')}
                description={t('settings.transfer.sheetDesc')}
            >
                <div className="flex flex-col gap-3">
                    <button
                        type="button"
                        disabled={exporting || !available}
                        onClick={() => void handleExport()}
                        className={cn(
                            'flex flex-col items-start gap-1 rounded-md bg-inset px-4 py-4 text-left active:bg-muted',
                            (exporting || !available) && 'opacity-50',
                        )}
                    >
                        <span className="text-[14px] font-medium text-text">
                            {exporting ? t('settings.transfer.exporting') : t('settings.transfer.exportAll')}
                        </span>
                        <span className="text-[11.5px] leading-relaxed text-text-tertiary">
                            {t('settings.transfer.exportAllDesc')}
                        </span>
                    </button>

                    <button
                        type="button"
                        disabled={importing || !available}
                        onClick={() => fileBridge.pickImportFile()}
                        className={cn(
                            'flex flex-col items-start gap-1 rounded-md bg-inset px-4 py-4 text-left active:bg-muted',
                            (importing || !available) && 'opacity-50',
                        )}
                    >
                        <span className="text-[14px] font-medium text-text">{t('settings.transfer.importBackup')}</span>
                        <span className="text-[11.5px] leading-relaxed text-text-tertiary">
                            <span className="font-medium text-danger">{t('settings.transfer.importOverwriteWarn')}</span>
                            {t('settings.transfer.importBackupDesc')}
                        </span>
                    </button>

                    {!available ? (
                        <p className="text-[11.5px] text-text-tertiary">
                            {t('settings.transfer.filePickerUnsupported')}
                        </p>
                    ) : null}
                </div>
            </BottomSheet>

            <ConfirmSheet
                open={preview !== null}
                onOpenChange={(next) => {
                    if (!next) setPreview(null);
                }}
                title={t('settings.transfer.confirmImportTitle')}
                description={
                    preview ? (
                        <div className="flex flex-col gap-2">
                            <p>{countsText(preview.info.counts)}</p>
                            <p className="text-text-tertiary">
                                {t('settings.transfer.exportedAt', {
                                    time: formatDateLabel(preview.info.exportedAtMs),
                                    version: preview.info.appVersion,
                                })}
                            </p>
                            <p className="text-danger">
                                {t('settings.transfer.importWarning')}
                            </p>
                        </div>
                    ) : null
                }
                confirmLabel={t('settings.transfer.confirmImportLabel')}
                busy={importing}
                onConfirm={() => void handleImport()}
            />
        </>
    );
}

export default DataTransferSheet;
