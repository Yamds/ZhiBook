//! data_root 布局 v1 路径权威。
//!
//! 业务模块只通过本模块拼路径，禁止散落 join("config") 之类的字面量。
//!
//! 布局:
//!   <data_root>/
//!   ├── config/            配置(app-settings.json、migration-report.json…)
//!   ├── logs/app/           应用会话日志(按次启动一份)
//!   ├── state/             应用模块数据
//!   └── tmp/               中间产物(migration-backup/ 迁移备份, exports/ 导出)

use std::path::{Path, PathBuf};

/// 原子写同文件最多保留的 .bak.* 份数。
pub const MAX_JSON_BAK_FILES: usize = 3;

/// migration-backup 目录最多保留份数。
pub const MAX_MIGRATION_BACKUPS: usize = 5;

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

    pub fn tmp_dir(&self) -> PathBuf {
        self.root.join("tmp")
    }

    pub fn migration_backup_dir(&self) -> PathBuf {
        self.tmp_dir().join("migration-backup")
    }

    pub fn export_dir(&self) -> PathBuf {
        self.tmp_dir().join("exports")
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
    }
}
