// 迁移数据模型 + 报告:配置 schema 升级流程的数据契约

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::bootstrap::RepairAction;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum MigrationStage {
    #[default]
    Pending,
    Running,
    Completed,
    RepairRequired,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum MigrationOutcome {
    #[default]
    NoChange,
    Updated,
    NeedsRepair,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MigrationWarning {
    pub code: String,
    pub message: String,
}

impl MigrationWarning {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct MigrationSource {
    pub root: PathBuf,
    #[serde(default)]
    pub app_config: Option<PathBuf>,
    #[serde(default)]
    pub auxiliary_files: Vec<PathBuf>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct BackupInfo {
    pub root: PathBuf,
    #[serde(default)]
    pub files: Vec<PathBuf>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MigrationReport {
    pub stage: MigrationStage,
    pub outcome: MigrationOutcome,
    #[serde(default)]
    pub warnings: Vec<MigrationWarning>,
    #[serde(default)]
    pub source: Option<MigrationSource>,
    #[serde(default)]
    pub backup: Option<BackupInfo>,
    #[serde(default)]
    pub rules_applied: Vec<String>,
    #[serde(default)]
    pub repair_actions: Vec<RepairAction>,
}

impl MigrationReport {
    pub fn clean() -> Self {
        Self {
            stage: MigrationStage::Completed,
            outcome: MigrationOutcome::NoChange,
            warnings: Vec::new(),
            source: None,
            backup: None,
            rules_applied: Vec::new(),
            repair_actions: Vec::new(),
        }
    }

    pub fn migrated(rules_applied: Vec<String>) -> Self {
        Self {
            stage: MigrationStage::Completed,
            outcome: MigrationOutcome::Updated,
            warnings: Vec::new(),
            source: None,
            backup: None,
            rules_applied,
            repair_actions: Vec::new(),
        }
    }

    #[cfg(test)]
    fn migrating() -> Self {
        Self {
            stage: MigrationStage::Running,
            outcome: MigrationOutcome::NoChange,
            warnings: Vec::new(),
            source: None,
            backup: None,
            rules_applied: Vec::new(),
            repair_actions: Vec::new(),
        }
    }

    pub fn repair_required(warnings: Vec<MigrationWarning>) -> Self {
        Self {
            stage: MigrationStage::RepairRequired,
            outcome: MigrationOutcome::NeedsRepair,
            warnings,
            source: None,
            backup: None,
            rules_applied: Vec::new(),
            repair_actions: vec![
                RepairAction::OpenDataDir,
                RepairAction::ExportMigrationReport,
            ],
        }
    }

    pub fn failed(message: impl Into<String>) -> Self {
        Self {
            stage: MigrationStage::Failed,
            outcome: MigrationOutcome::NeedsRepair,
            warnings: vec![MigrationWarning::new("migration_failed", message)],
            source: None,
            backup: None,
            rules_applied: Vec::new(),
            repair_actions: vec![
                RepairAction::OpenDataDir,
                RepairAction::ExportMigrationReport,
            ],
        }
    }

    pub fn with_source(mut self, source: MigrationSource) -> Self {
        self.source = Some(source);
        self
    }

    pub fn with_backup(mut self, backup: BackupInfo) -> Self {
        self.backup = Some(backup);
        self
    }

    pub fn with_warnings(mut self, warnings: Vec<MigrationWarning>) -> Self {
        self.warnings = warnings;
        self
    }

    pub fn with_repair_action(mut self, action: RepairAction) -> Self {
        if !self.repair_actions.contains(&action) {
            self.repair_actions.push(action);
        }
        self
    }
}

impl Default for MigrationReport {
    fn default() -> Self {
        Self::clean()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clean_report_is_completed_and_warning_free() {
        let report = MigrationReport::clean();
        assert_eq!(report.stage, MigrationStage::Completed);
        assert_eq!(report.outcome, MigrationOutcome::NoChange);
        assert!(report.warnings.is_empty());
    }

    #[test]
    fn migrating_report_is_running() {
        assert_eq!(MigrationReport::migrating().stage, MigrationStage::Running);
    }

    #[test]
    fn failed_report_carries_warning() {
        let report = MigrationReport::failed("boom");
        assert_eq!(report.stage, MigrationStage::Failed);
        assert_eq!(report.outcome, MigrationOutcome::NeedsRepair);
        assert_eq!(report.warnings[0].code, "migration_failed");
        assert!(report.repair_actions.contains(&RepairAction::OpenDataDir));
    }
}
