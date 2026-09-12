use std::path::{Path, PathBuf};

use serde_json::Value;

use tk_domain::errors::ConfigError;
use tk_domain::kinds::SchemaVersion;
use tk_domain::migration::{BackupInfo, MigrationReport};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JsonWrite {
    pub path: PathBuf,
    pub payload: Value,
}

/// 一次配置写事务:多份 JSON 写 / 删,整体在迁移备份目录留快照,
/// 中途失败自动回滚已写文件。
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct JsonTransaction {
    pub writes: Vec<JsonWrite>,
    pub deletes: Vec<PathBuf>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct TransactionReport {
    pub backup: Option<BackupInfo>,
    pub written: Vec<PathBuf>,
    pub deleted: Vec<PathBuf>,
}

impl JsonTransaction {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn write(mut self, path: impl Into<PathBuf>, payload: Value) -> Self {
        self.writes.push(JsonWrite {
            path: path.into(),
            payload,
        });
        self
    }

    pub fn delete(mut self, path: impl Into<PathBuf>) -> Self {
        self.deletes.push(path.into());
        self
    }

    pub fn is_empty(&self) -> bool {
        self.writes.is_empty() && self.deletes.is_empty()
    }

    /// 合并另一个事务到本事务(追加语义)
    pub fn merge(&mut self, other: JsonTransaction) {
        self.writes.extend(other.writes);
        self.deletes.extend(other.deletes);
    }
}

pub trait ConfigStore: Send + Sync {
    fn root(&self) -> &Path;
    fn config_dir(&self) -> PathBuf;
    fn backup_dir(&self) -> PathBuf;
    fn migration_report_path(&self) -> PathBuf;
    fn load_schema_version(&self) -> Result<SchemaVersion, ConfigError>;
    fn read_json(&self, path: &Path) -> Result<Value, ConfigError>;
    /// 原子写:tmp 文件 + rename,旧文件滚动 .bak.N(上限见 MAX_JSON_BAK_FILES)
    fn write_json_atomic(&self, path: &Path, payload: &Value) -> Result<(), ConfigError>;
    fn apply_transaction(
        &self,
        transaction: JsonTransaction,
    ) -> Result<TransactionReport, ConfigError>;
    /// 内容不变的重复落盘会被跳过,避免每次启动堆 .bak
    fn save_migration_report(&self, report: &MigrationReport) -> Result<(), ConfigError>;
}
