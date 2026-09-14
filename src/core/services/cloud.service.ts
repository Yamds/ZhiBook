// Git 云端备份 IPC 服务（P15）。
//
// 命令名只在这里出现。云端协议 / 加密 / 合并全在 Rust（tk-cloud / tk-crypto），
// 前端只负责：配置、触发备份 / 恢复、展示状态与结果。

import type {
    CloudBackupState,
    CloudBackupSummary,
    CloudConnectionInfo,
    CloudCreatedKey,
    CloudKeyInfo,
    CloudKeyInput,
    CloudRestorePreview,
    CloudRestoreSummary,
} from '../ipc/types';
import { invoke, isTauri } from '../ipc/transport';

export const cloudService = {
    /** 当前状态：是否配置 / 密钥 / 上次备份。 */
    async getState(): Promise<CloudBackupState> {
        if (!isTauri) throw new Error('浏览器预览不支持云端备份');
        return invoke<CloudBackupState>('get_cloud_backup_state');
    },

    /** 保存仓库配置并测试连接。 */
    async saveConfig(input: {
        repoUrl: string;
        username: string;
        token: string;
        branch: string;
    }): Promise<CloudConnectionInfo> {
        return invoke<CloudConnectionInfo>('save_cloud_backup_config', input);
    },

    /** 用已保存的配置测试连接。 */
    async testConnection(): Promise<CloudConnectionInfo> {
        return invoke<CloudConnectionInfo>('test_cloud_backup_connection');
    },

    /** 开关自动备份（每个逻辑日首次打开 App 时自动备份一次）。 */
    async setAutoBackup(enabled: boolean): Promise<CloudBackupState> {
        return invoke<CloudBackupState>('set_cloud_auto_backup', { enabled });
    },

    /**
     * 自动备份：`day` 为前端按本地 05:00 边界算好的逻辑日。
     * 返回 null = 按规则跳过（未开启 / 未配置 / 今天已跑 / 已有备份在跑）。
     */
    async runAutoBackup(day: string): Promise<CloudBackupSummary | null> {
        return invoke<CloudBackupSummary | null>('run_cloud_auto_backup', { day });
    },

    /** 首次生成主密钥（恢复密钥只在返回值里出现一次）。 */
    async createKey(passphrase: string | null): Promise<CloudCreatedKey> {
        return invoke<CloudCreatedKey>('create_cloud_backup_key', { passphrase });
    },

    /** 查看恢复密钥（调用方先用 PIN 校验）。 */
    async viewRecoveryKey(): Promise<string> {
        return invoke<string>('view_cloud_recovery_key');
    },

    async setPassphrase(passphrase: string): Promise<CloudKeyInfo> {
        return invoke<CloudKeyInfo>('set_cloud_backup_passphrase', { passphrase });
    },

    async clearPassphrase(): Promise<CloudKeyInfo> {
        return invoke<CloudKeyInfo>('clear_cloud_backup_passphrase');
    },

    /** 立即备份（远端有其它设备的新提交时自动合并后再推）。 */
    async runBackup(): Promise<CloudBackupSummary> {
        return invoke<CloudBackupSummary>('run_cloud_backup');
    },

    /** 预览云端备份；本机缺密钥时返回 `needsKey`。 */
    async previewRestore(keyInput: CloudKeyInput | null): Promise<CloudRestorePreview> {
        return invoke<CloudRestorePreview>('preview_cloud_restore', { keyInput });
    },

    /** 覆盖式恢复（恢复前自动快照）。 */
    async runRestore(keyInput: CloudKeyInput | null): Promise<CloudRestoreSummary> {
        return invoke<CloudRestoreSummary>('run_cloud_restore', { keyInput });
    },

    /** 断开云端备份；`removeKey` 会同时删除本机密钥与密文缓存。 */
    async disconnect(removeKey: boolean): Promise<void> {
        return invoke<void>('disconnect_cloud_backup', { removeKey });
    },
};
