// 数据导入 / 导出 IPC 服务。
//
// 命令名只在这里出现。导出在应用沙箱生成 zip（路径返回给前端，再由原生桥复制到用户位置）；
// 导入由原生桥把用户选的文件复制到缓存后回调路径，这里只负责预览与落库。

import type { BackupPreview, BackupSummary, ImportSummary } from '../ipc/types';
import { invoke, isTauri } from '../ipc/transport';

export const backupService = {
    /** 导出全量数据到沙箱，返回 zip 路径与内容计数。 */
    async exportData(): Promise<BackupSummary> {
        if (!isTauri) throw new Error('浏览器预览不支持导出数据');
        return invoke<BackupSummary>('export_data');
    },

    /** 只读预览备份包（不落库）。 */
    async previewBackup(path: string): Promise<BackupPreview> {
        return invoke<BackupPreview>('preview_backup', { path });
    },

    /** 覆盖式恢复（导入前自动快照）。 */
    async importData(path: string): Promise<ImportSummary> {
        return invoke<ImportSummary>('import_data', { path });
    },
};
