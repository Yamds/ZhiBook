// 数据导入 / 导出：导出全量 zip（含附件）；导入为**覆盖式恢复**（导入前自动快照）。

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { formatDateLabel } from '../../../core/domain/date';
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
        title: '操作失败',
        content: error instanceof Error ? error.message : String(error),
    });
}

function countsText(counts: BackupCounts): string {
    return `${counts.books} 个账本 · ${counts.transactions} 笔账单 · ${counts.attachments} 张附件 · ${counts.recurringRules} 条固定收支`;
}

export function DataTransferSheet({ open, onOpenChange }: DataTransferSheetProps) {
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
            fileBridge.saveFile(summary.path, `制账备份-${stamp}.zip`);
            pushInfoBar({
                key: 'backup-export',
                tone: 'success',
                title: '备份已生成',
                content: '请在系统弹窗里选择保存位置',
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
                title: `已恢复 ${result.counts.transactions} 笔账单`,
                content: result.preImportBackupPath ? '导入前的数据已自动备份到本机' : undefined,
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
                title="导入 / 导出"
                description="备份包为 zip（manifest.json + data.json + 附件）"
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
                            {exporting ? '正在导出…' : '导出全部数据'}
                        </span>
                        <span className="text-[11.5px] leading-relaxed text-text-tertiary">
                            生成 zip 备份包（含账单、账户、分类、固定收支与图片附件）
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
                        <span className="text-[14px] font-medium text-text">导入备份</span>
                        <span className="text-[11.5px] leading-relaxed text-text-tertiary">
                            <span className="font-medium text-danger">覆盖当前全部数据</span>
                            ；导入前会自动在本机存一份快照
                        </span>
                    </button>

                    {!available ? (
                        <p className="text-[11.5px] text-text-tertiary">
                            当前环境不支持文件选择（仅在 Android App 内生效）。
                        </p>
                    ) : null}
                </div>
            </BottomSheet>

            <ConfirmSheet
                open={preview !== null}
                onOpenChange={(next) => {
                    if (!next) setPreview(null);
                }}
                title="确认覆盖导入？"
                description={
                    preview ? (
                        <div className="flex flex-col gap-2">
                            <p>{countsText(preview.info.counts)}</p>
                            <p className="text-text-tertiary">
                                导出时间：{formatDateLabel(preview.info.exportedAtMs)} · App {preview.info.appVersion}
                            </p>
                            <p className="text-danger">
                                导入会清空并替换当前全部账本数据；导入前的数据会先自动备份到本机。
                            </p>
                        </div>
                    ) : null
                }
                confirmLabel="覆盖导入"
                busy={importing}
                onConfirm={() => void handleImport()}
            />
        </>
    );
}

export default DataTransferSheet;
