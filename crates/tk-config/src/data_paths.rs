//! data_root 布局 v1 路径权威。
//!
//! 业务模块只通过本模块拼路径，禁止散落 join("config") 之类的字面量。
//!
//! 布局:
//!   <data_root>/
//!   ├── config/            配置(app-settings.json、migration-report.json…)
//!   ├── ledger/            记账数据(SQLite 库 + 附件)
//!   │   ├── ledger.db
//!   │   └── attachments/   <transaction_id>/<attachment_id>.<ext>
//!   ├── logs/app/           应用会话日志(按次启动一份)
//!   ├── state/             应用模块数据
//!   └── tmp/               中间产物(migration-backup/ 迁移备份, exports/ 导出)

use std::path::{Path, PathBuf};

/// 原子写同文件最多保留的 .bak.* 份数。
pub const MAX_JSON_BAK_FILES: usize = 3;

/// migration-backup 目录最多保留份数。
pub const MAX_MIGRATION_BACKUPS: usize = 5;

/// `tmp/exports` 目录最多保留的备份包份数（每份都是全量数据，包括附件）。
pub const MAX_EXPORT_FILES: usize = 3;

/// `tmp/cloud-pull-*` 目录最多保留份数（正常情况下用完即删，这里是崩溃后的保底）。
pub const MAX_CLOUD_PULL_DIRS: usize = 1;

/// 导入暂存目录前缀（`<tmp>/import-stage-<时间戳>`）。
pub const IMPORT_STAGE_PREFIX: &str = "import-stage-";

/// 导出备份包文件名前缀。
pub const EXPORT_FILE_PREFIX: &str = "zz-backup-";

/// 云端拉取临时目录前缀。
pub const CLOUD_PULL_PREFIX: &str = "cloud-pull-";

/// 应用会话日志最多保留文件数(与按天清理叠加,取更严)。
pub const MAX_LOG_FILES: usize = 30;

/// 桌面日志按天保留窗口。
pub const LOG_KEEP_DAYS: u64 = 7;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DataPaths {
    root: PathBuf,
}

impl DataPaths {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn config_dir(&self) -> PathBuf {
        self.root.join("config")
    }

    pub fn app_settings_path(&self) -> PathBuf {
        self.config_dir().join("app-settings.json")
    }

    pub fn migration_report_path(&self) -> PathBuf {
        self.config_dir().join("migration-report.json")
    }

    pub fn logs_dir(&self) -> PathBuf {
        self.root.join("logs")
    }

    pub fn app_log_dir(&self) -> PathBuf {
        self.logs_dir().join("app")
    }

    pub fn state_dir(&self) -> PathBuf {
        self.root.join("state")
    }

    /// 记账数据目录(SQLite 库与附件都在这下面)。
    pub fn ledger_dir(&self) -> PathBuf {
        self.root.join("ledger")
    }

    /// 记账主库。
    pub fn ledger_db_path(&self) -> PathBuf {
        self.ledger_dir().join("ledger.db")
    }

    /// 附件根目录(数据库里存的是相对 data_root 的路径)。
    pub fn attachments_dir(&self) -> PathBuf {
        self.ledger_dir().join("attachments")
    }

    pub fn tmp_dir(&self) -> PathBuf {
        self.root.join("tmp")
    }

    pub fn migration_backup_dir(&self) -> PathBuf {
        self.tmp_dir().join("migration-backup")
    }

    pub fn export_dir(&self) -> PathBuf {
        self.tmp_dir().join("exports")
    }

    pub fn cloud_cache_dir(&self) -> PathBuf {
        self.tmp_dir().join("cloud-cache")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn layout_v1_paths_are_stable() {
        let p = DataPaths::new(PathBuf::from("D:/data"));
        assert_eq!(p.config_dir(), PathBuf::from("D:/data/config"));
        assert_eq!(
            p.app_settings_path(),
            PathBuf::from("D:/data/config/app-settings.json")
        );
        assert_eq!(p.app_log_dir(), PathBuf::from("D:/data/logs/app"));
        assert_eq!(
            p.migration_backup_dir(),
            PathBuf::from("D:/data/tmp/migration-backup")
        );
        assert_eq!(p.ledger_db_path(), PathBuf::from("D:/data/ledger/ledger.db"));
        assert_eq!(
            p.attachments_dir(),
            PathBuf::from("D:/data/ledger/attachments")
        );
    }
}
