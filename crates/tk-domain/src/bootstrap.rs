use serde::{Deserialize, Serialize};

use crate::kinds::SchemaVersion;
use crate::migration::{MigrationOutcome, MigrationReport, MigrationStage};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum BootstrapStatus {
    #[default]
    Ready,
    Migrating,
    RepairRequired,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RepairAction {
    OpenDataDir,
    ExportMigrationReport,
    RestoreBackup,
}

/// 启动快照:数据根解析 + 配置迁移结果,前端启动闸门据此决定走 Splash
/// 还是展示修复指引。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BootstrapSnapshot {
    pub status: BootstrapStatus,
    pub schema_version: SchemaVersion,
    pub report: MigrationReport,
    /// 当前数据根绝对路径(已 to_string_lossy),由 src-tauri 装配
    #[serde(default)]
    pub data_root: String,
}

impl BootstrapSnapshot {
    pub fn new(
        status: BootstrapStatus,
        schema_version: SchemaVersion,
        report: MigrationReport,
    ) -> Self {
        Self {
            status,
            schema_version,
            report,
            data_root: String::new(),
        }
    }

    pub fn from_report(report: MigrationReport) -> Self {
        let status = match (report.stage, report.outcome) {
            (MigrationStage::Failed, _) => BootstrapStatus::Failed,
            (MigrationStage::RepairRequired, _) | (_, MigrationOutcome::NeedsRepair)
                if report.stage != MigrationStage::Completed =>
            {
                BootstrapStatus::RepairRequired
            }
            (MigrationStage::Pending | MigrationStage::Running, _) => BootstrapStatus::Migrating,
            _ => BootstrapStatus::Ready,
        };

        Self::new(status, SchemaVersion::CURRENT, report)
    }

    pub fn ready() -> Self {
        Self::from_report(MigrationReport::clean())
    }
}

impl From<MigrationReport> for BootstrapSnapshot {
    fn from(report: MigrationReport) -> Self {
        Self::from_report(report)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_clean_report_to_ready_snapshot() {
        let snapshot = BootstrapSnapshot::ready();
        assert_eq!(snapshot.status, BootstrapStatus::Ready);
        assert_eq!(snapshot.schema_version, SchemaVersion::CURRENT);
        assert_eq!(snapshot.report, MigrationReport::clean());
    }

    #[test]
    fn maps_failed_report_to_failed_snapshot() {
        let snapshot = BootstrapSnapshot::from_report(MigrationReport::failed("boom"));
        assert_eq!(snapshot.status, BootstrapStatus::Failed);
    }

    /// 历史快照缓存(没有 data_root 字段)必须能反序列化回空串
    #[test]
    fn legacy_snapshot_without_data_root_deserializes() {
        let legacy_json = serde_json::json!({
            "status": "ready",
            "schema_version": 1,
            "report": MigrationReport::clean(),
        })
        .to_string();

        let decoded: BootstrapSnapshot =
            serde_json::from_str(&legacy_json).expect("legacy snapshot deserialize");

        assert_eq!(decoded.status, BootstrapStatus::Ready);
        assert!(decoded.data_root.is_empty());
    }
}
