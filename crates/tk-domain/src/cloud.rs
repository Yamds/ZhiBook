//! 云端备份（P15）的跨 IPC 类型。
//!
//! 实际的 git 协议、加密与包组装在 `tk-cloud` / `tk-crypto` crate，
//! 这里只放前端需要展示的摘要类型。

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::backup::BackupCounts;

/// 单类实体的合并增减计数。
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct MergeDelta {
    #[ts(type = "number")]
    pub added: i64,
    #[ts(type = "number")]
    pub updated: i64,
    #[ts(type = "number")]
    pub deleted: i64,
}

impl MergeDelta {
    /// 是否发生了变化（三向都为零 = 无变化）。
    pub fn is_empty(&self) -> bool {
        self.added == 0 && self.updated == 0 && self.deleted == 0
    }
}

/// 与另一台设备的备份包合并的结果（备份前自动合并时返回）。
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct MergeSummary {
    pub books: MergeDelta,
    pub accounts: MergeDelta,
    pub categories: MergeDelta,
    pub transactions: MergeDelta,
    pub attachments: MergeDelta,
    pub recurring_rules: MergeDelta,
    pub recurring_runs: MergeDelta,
}

impl MergeSummary {
    /// 是否合并了任何内容。
    pub fn is_empty(&self) -> bool {
        self.books.is_empty()
            && self.accounts.is_empty()
            && self.categories.is_empty()
            && self.transactions.is_empty()
            && self.attachments.is_empty()
            && self.recurring_rules.is_empty()
            && self.recurring_runs.is_empty()
    }

    /// 账单维度的净变化（前端提示文案用）。
    pub fn transaction_net(&self) -> i64 {
        self.transactions.added + self.transactions.updated - self.transactions.deleted
    }
}

/// 本机密钥信息（不含密钥内容）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct CloudKeyInfo {
    pub key_id: String,
    pub fingerprint: String,
    pub has_passphrase: bool,
    #[ts(type = "number")]
    pub created_at_ms: i64,
}

/// 云端备份的整体状态（设置页用）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct CloudBackupState {
    /// 是否已保存仓库配置。
    pub configured: bool,
    pub repo_url: String,
    pub username: String,
    pub branch: String,
    pub server_kind: String,
    /// 主密钥（未生成时为 null）。
    pub key: Option<CloudKeyInfo>,
    /// 上次备份时间 / 提交。
    #[ts(type = "number | null")]
    pub last_backup_at_ms: Option<i64>,
    pub last_commit: Option<String>,
    /// 是否开启「自动备份」（每个逻辑日首次打开 App 时备份一次）。
    pub auto_backup_enabled: bool,
    /// 最近一次自动备份的逻辑日（YYYY-MM-DD，本地 05:00 起算）；未跑过为 null。
    pub last_auto_backup_day: Option<String>,
}

/// 保存配置 / 测试连接的结果。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct CloudConnectionInfo {
    pub server_kind: String,
    pub branch_exists: bool,
    pub head: Option<String>,
    /// 已存在的远端提交是否属于制账（manifest 校验通过）。
    pub backup_ready: bool,
}

/// 新建密钥的结果（恢复密钥只在这一次返回，前端负责提醒用户抄下）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct CloudCreatedKey {
    pub recovery_key: String,
    pub key: CloudKeyInfo,
}

/// 恢复 / 换机时要提交的密钥解锁方式。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct CloudKeyInput {
    /// `passphrase` | `recovery`
    pub kind: String,
    pub value: String,
}

/// 云端恢复的预览（未解锁时 counts 为空）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct CloudRestorePreview {
    pub key_id: String,
    pub fingerprint: String,
    #[ts(type = "number")]
    pub created_at_ms: i64,
    /// 本机没有这把密钥，需要先输入口令或恢复密钥。
    pub needs_key: bool,
    /// 云端是否提供口令解锁路径。
    pub has_passphrase: bool,
    pub counts: Option<BackupCounts>,
    /// 预览是否用的是本机已有密钥。
    pub from_local_key: bool,
}

/// 一次备份的结果。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct CloudBackupSummary {
    /// 本次是否真的产生了新提交（内容没变时为 false）。
    pub pushed: bool,
    pub commit: Option<String>,
    /// 推送前自动合并的结果（没有合并时为 null）。
    pub merged: Option<MergeSummary>,
    #[ts(type = "number")]
    pub uploaded_bytes: i64,
    #[ts(type = "number")]
    pub file_count: i64,
    #[ts(type = "number")]
    pub backed_up_at_ms: i64,
    /// 读了但不存在的附件数量（不影响备份成功）。
    #[ts(type = "number")]
    pub attachments_missing: i64,
}

/// 一次云端恢复的结果。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct CloudRestoreSummary {
    pub counts: BackupCounts,
    pub pre_import_backup_path: Option<String>,
    /// 下载失败的附件数量（数据库记录保留）。
    #[ts(type = "number")]
    pub attachments_failed: i64,
    /// 恢复时是否把云端密钥导入到了本机（换机场景）。
    pub key_imported: bool,
}
