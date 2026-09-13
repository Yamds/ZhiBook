//! 数据导入 / 导出的跨 IPC 类型。
//!
//! 备份包的实际格式（zip 内部结构、校验、落库）在 `tk-backup` crate，
//! 这里只放前端需要展示的摘要类型。

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// 备份内容计数。
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct BackupCounts {
    #[ts(type = "number")]
    pub books: i64,
    #[ts(type = "number")]
    pub accounts: i64,
    #[ts(type = "number")]
    pub categories: i64,
    #[ts(type = "number")]
    pub transactions: i64,
    #[ts(type = "number")]
    pub attachments: i64,
    #[ts(type = "number")]
    pub recurring_rules: i64,
}

/// 导出结果：zip 落在应用沙箱，再由原生桥复制到用户选择的位置。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct BackupSummary {
    pub counts: BackupCounts,
    #[ts(type = "number")]
    pub exported_at_ms: i64,
    pub path: String,
}

/// 导入前预览（先看内容再决定是否覆盖）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct BackupPreview {
    pub counts: BackupCounts,
    #[ts(type = "number")]
    pub exported_at_ms: i64,
    pub app_version: String,
    #[ts(type = "number")]
    pub format_version: i64,
}

/// 导入结果。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct ImportSummary {
    pub counts: BackupCounts,
    /// 导入前自动生成的快照路径（失败时为 null）。
    pub pre_import_backup_path: Option<String>,
}
