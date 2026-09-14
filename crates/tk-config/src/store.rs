//! 本地 JSON 配置存储。
//!
//! 约束:
//! - 所有路径必须落在 data_root 内,阻止 `..` 和越界绝对路径
//! - 写入采用同目录临时文件 + rename,尽量避免半写文件
//! - 覆盖与事务写入会保留有限备份,方便排障与迁移恢复

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::Value;
use tk_domain::errors::ConfigError;
use tk_domain::kinds::SchemaVersion;
use tk_domain::migration::{BackupInfo, MigrationReport};
use tk_traits::{ConfigStore, JsonTransaction, TransactionReport};

use crate::data_paths::{DataPaths, MAX_JSON_BAK_FILES, MAX_MIGRATION_BACKUPS};

#[derive(Debug, Clone)]
pub struct LocalConfigStore {
    paths: DataPaths,
}

impl LocalConfigStore {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self {
            paths: DataPaths::new(root),
        }
    }

    pub fn paths(&self) -> &DataPaths {
        &self.paths
    }

    pub fn app_settings_path(&self) -> PathBuf {
        self.paths.app_settings_path()
    }

    fn ensure_within_root(&self, path: &Path) -> Result<(), ConfigError> {
        if path
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
        {
            return Err(ConfigError::OutsideAllowedRoots(path.display().to_string()));
        }

        let root = self.paths.root();
        let target = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
        let root_canon = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
        if target.starts_with(&root_canon) || path.starts_with(root) {
            Ok(())
        } else {
            Err(ConfigError::OutsideAllowedRoots(path.display().to_string()))
        }
    }

    fn unique_sibling(path: &Path, marker: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        path.with_file_name(format!(
            "{}.{}.{}",
            path.file_name().unwrap_or_default().to_string_lossy(),
            marker,
            stamp
        ))
    }

    fn create_backup_root(&self) -> Result<PathBuf, ConfigError> {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let backup = self
            .paths
            .migration_backup_dir()
            .join(format!("migration-{stamp}"));
        fs::create_dir_all(&backup).map_err(to_io_error)?;
        prune_migration_backups(&self.paths.migration_backup_dir(), MAX_MIGRATION_BACKUPS);
        Ok(backup)
    }

    fn snapshot_existing(
        &self,
        backup_root: &Path,
        path: &Path,
    ) -> Result<Option<PathBuf>, ConfigError> {
        if !path.is_file() {
            return Ok(None);
        }
        let name = path.file_name().ok_or_else(|| {
            ConfigError::InvalidPayloadDetail(format!("missing file name: {}", path.display()))
        })?;
        let target = backup_root.join(name);
        fs::copy(path, &target).map_err(to_io_error)?;
        Ok(Some(target))
    }
}

impl ConfigStore for LocalConfigStore {
    fn root(&self) -> &Path {
        self.paths.root()
    }

    fn config_dir(&self) -> PathBuf {
        self.paths.config_dir()
    }

    fn backup_dir(&self) -> PathBuf {
        self.paths.migration_backup_dir()
    }

    fn migration_report_path(&self) -> PathBuf {
        self.paths.migration_report_path()
    }

    fn load_schema_version(&self) -> Result<SchemaVersion, ConfigError> {
        let path = self.paths.migration_report_path();
        if !path.is_file() {
            return Ok(SchemaVersion::V1);
        }
        let payload = self.read_json(&path)?;
        Ok(payload
            .get("schema_version")
            .and_then(Value::as_u64)
            .map(|value| SchemaVersion::new(value as u16))
            .unwrap_or(SchemaVersion::V1))
    }

    fn read_json(&self, path: &Path) -> Result<Value, ConfigError> {
        self.ensure_within_root(path)?;
        let text = match fs::read_to_string(path) {
            Ok(text) => text,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Err(ConfigError::NotFound(path.display().to_string()));
            }
            Err(error) => return Err(to_io_error(error)),
        };
        serde_json::from_str(&text).map_err(|error| ConfigError::Json(error.to_string()))
    }

    fn write_json_atomic(&self, path: &Path, payload: &Value) -> Result<(), ConfigError> {
        self.ensure_within_root(path)?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(to_io_error)?;
        }

        let temp = Self::unique_sibling(path, "tmp");
        let backup = Self::unique_sibling(path, "bak");
        let bytes = serde_json::to_vec_pretty(payload)
            .map_err(|error| ConfigError::Json(error.to_string()))?;
        fs::write(&temp, bytes).map_err(to_io_error)?;

        let moved_to_backup = if path.exists() {
            fs::rename(path, &backup).map_err(to_io_error)?;
            true
        } else {
            false
        };

        match fs::rename(&temp, path) {
            Ok(()) => {
                prune_json_bak_files(path, MAX_JSON_BAK_FILES);
                Ok(())
            }
            Err(error) => {
                let _ = fs::remove_file(&temp);
                if moved_to_backup && backup.exists() && !path.exists() {
                    let _ = fs::rename(&backup, path);
                }
                Err(to_io_error(error))
            }
        }
    }

    fn apply_transaction(
        &self,
        transaction: JsonTransaction,
    ) -> Result<TransactionReport, ConfigError> {
        if transaction.is_empty() {
            return Ok(TransactionReport::default());
        }

        let backup_root = self.create_backup_root()?;
        let mut backup_files = Vec::new();
        for write in &transaction.writes {
            self.ensure_within_root(&write.path)?;
            if let Some(snapshot) = self.snapshot_existing(&backup_root, &write.path)? {
                backup_files.push(snapshot);
            }
        }
        for delete in &transaction.deletes {
            self.ensure_within_root(delete)?;
            if let Some(snapshot) = self.snapshot_existing(&backup_root, delete)? {
                backup_files.push(snapshot);
            }
        }

        let mut written = Vec::new();
        for write in transaction.writes {
            if let Err(error) = self.write_json_atomic(&write.path, &write.payload) {
                restore_written_state(&backup_root, &written);
                return Err(error);
            }
            written.push(write.path);
        }

        let mut deleted = Vec::new();
        for path in transaction.deletes {
            if path.exists() {
                if let Err(error) = fs::remove_file(&path).map_err(to_io_error) {
                    restore_written_state(&backup_root, &written);
                    return Err(error);
                }
                deleted.push(path);
            }
        }

        Ok(TransactionReport {
            backup: Some(BackupInfo {
                root: backup_root,
                files: backup_files,
            }),
            written,
            deleted,
        })
    }

    fn save_migration_report(&self, report: &MigrationReport) -> Result<(), ConfigError> {
        let mut payload =
            serde_json::to_value(report).map_err(|error| ConfigError::Json(error.to_string()))?;
        if let Value::Object(map) = &mut payload {
            map.insert(
                "schema_version".to_string(),
                Value::from(SchemaVersion::CURRENT.get()),
            );
        }

        let path = self.paths.migration_report_path();
        if path.is_file() && self.read_json(&path).ok().as_ref() == Some(&payload) {
            return Ok(());
        }
        self.write_json_atomic(&path, &payload)
    }
}

fn restore_written_state(backup_root: &Path, written: &[PathBuf]) {
    for path in written.iter().rev() {
        let Some(file_name) = path.file_name() else {
            continue;
        };
        let backup = backup_root.join(file_name);
        if backup.is_file() {
            if let Some(parent) = path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::copy(&backup, path);
        } else {
            let _ = fs::remove_file(path);
        }
    }
}

fn to_io_error(error: std::io::Error) -> ConfigError {
    ConfigError::Io(error.to_string())
}

/// 保留同文件最新 keep 个 `name.bak.*`。
pub fn prune_json_bak_files(path: &Path, keep: usize) {
    let Some(parent) = path.parent() else {
        return;
    };
    let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
        return;
    };
    let prefix = format!("{file_name}.bak.");
    let Ok(entries) = fs::read_dir(parent) else {
        return;
    };
    let mut backups: Vec<(SystemTime, PathBuf)> = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            let name = path.file_name()?.to_str()?;
            if !path.is_file() || !name.starts_with(&prefix) {
                return None;
            }
            Some((entry.metadata().ok()?.modified().ok()?, path))
        })
        .collect();
    if backups.len() <= keep {
        return;
    }
    backups.sort_by_key(|item| std::cmp::Reverse(item.0));
    for (_, path) in backups.into_iter().skip(keep) {
        let _ = fs::remove_file(path);
    }
}

/// 保留目录下最新的 `keep` 个以 `prefix` 开头的**普通文件**，其余逐个删除。
///
/// 不通配、不递归（全局约束）：只 `remove_file` 明确命中的那一个。
pub fn prune_prefixed_files(dir: &Path, prefix: &str, keep: usize) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut files: Vec<(SystemTime, PathBuf)> = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            let name = path.file_name()?.to_str()?;
            if !path.is_file() || !name.starts_with(prefix) {
                return None;
            }
            Some((entry.metadata().ok()?.modified().ok()?, path))
        })
        .collect();
    if files.len() <= keep {
        return;
    }
    files.sort_by_key(|item| std::cmp::Reverse(item.0));
    for (_, path) in files.into_iter().skip(keep) {
        let _ = fs::remove_file(path);
    }
}

/// 保留目录下最新的 `keep` 个以 `prefix` 开头的**子目录**，其余递归删除。
///
/// 只用于我们自己创建并在内部穷举过的临时目录（如 `tmp/cloud-pull-*`）。
pub fn prune_prefixed_dirs(dir: &Path, prefix: &str, keep: usize) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut dirs: Vec<(SystemTime, PathBuf)> = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            let name = path.file_name()?.to_str()?;
            if !path.is_dir() || !name.starts_with(prefix) {
                return None;
            }
            Some((entry.metadata().ok()?.modified().ok()?, path))
        })
        .collect();
    if dirs.len() <= keep {
        return;
    }
    dirs.sort_by_key(|item| std::cmp::Reverse(item.0));
    for (_, path) in dirs.into_iter().skip(keep) {
        let _ = fs::remove_dir_all(path);
    }
}

/// 保留最新 keep 个 migration-* 目录。
pub fn prune_migration_backups(backup_dir: &Path, keep: usize) {
    let Ok(entries) = fs::read_dir(backup_dir) else {
        return;
    };
    let mut dirs: Vec<(SystemTime, PathBuf)> = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            let name = path.file_name()?.to_str()?;
            if !path.is_dir() || !name.starts_with("migration-") {
                return None;
            }
            Some((entry.metadata().ok()?.modified().ok()?, path))
        })
        .collect();
    if dirs.len() <= keep {
        return;
    }
    dirs.sort_by_key(|item| std::cmp::Reverse(item.0));
    for (_, path) in dirs.into_iter().skip(keep) {
        let _ = fs::remove_dir_all(path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_json_atomically() {
        let temp = tempfile::tempdir().expect("temp dir");
        let store = LocalConfigStore::new(temp.path());
        let path = store.config_dir().join("config.json");
        store
            .write_json_atomic(&path, &serde_json::json!({"a": 1}))
            .expect("write");
        assert_eq!(store.read_json(&path).expect("read")["a"], 1);
    }

    #[test]
    fn rejects_paths_outside_root() {
        let temp = tempfile::tempdir().expect("temp dir");
        let store = LocalConfigStore::new(temp.path());
        let result = store.read_json(Path::new("../outside.json"));
        assert!(matches!(result, Err(ConfigError::OutsideAllowedRoots(_))));
    }

    #[test]
    fn prune_prefixed_files_keeps_the_newest() {
        let temp = tempfile::tempdir().expect("temp dir");
        let dir = temp.path();
        for index in 0..5 {
            let path = dir.join(format!("zz-backup-{index}.zip"));
            fs::write(&path, b"x").expect("write");
            // 让 modified 时间可靠地拉开（文件系统时间戳精度有限）
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        fs::write(dir.join("keep-me.txt"), b"x").expect("write other");
        prune_prefixed_files(dir, "zz-backup-", 2);

        let mut left: Vec<String> = fs::read_dir(dir)
            .expect("read")
            .filter_map(Result::ok)
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .filter(|name| name.starts_with("zz-backup-"))
            .collect();
        left.sort();
        assert_eq!(left, vec!["zz-backup-3.zip", "zz-backup-4.zip"]);
        assert!(dir.join("keep-me.txt").exists(), "不该动别的文件");
    }
}
