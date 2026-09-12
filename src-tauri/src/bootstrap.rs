//! 应用启动快照与数据根解析。
//!
//! Android 上没有任何"安装目录"概念：应用只能写自己的私有沙箱。
//! 因此数据根直接取 Tauri 的 app_data_dir（`/data/user/0/<包名>/files` 下），
//! 环境变量 `YAMDS_BILL_DATA_ROOT` 仅用于本机调试覆盖。

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};
use tk_config::{LocalConfigStore, MigrationOrchestrator};
use tk_domain::BootstrapSnapshot;

/// 桌面预览（非 Android）兜底目录名。
const APP_DATA_DIR_NAME: &str = "YamdsBill";
/// 本机调试用的数据根覆盖变量。
pub const DATA_ROOT_ENV: &str = "YAMDS_BILL_DATA_ROOT";

pub(crate) fn resolve_data_root(app: &AppHandle) -> PathBuf {
    if let Some(value) = std::env::var_os(DATA_ROOT_ENV) {
        let path = PathBuf::from(value);
        if path.is_absolute() {
            return path;
        }
    }

    if let Ok(dir) = app.path().app_data_dir() {
        return dir;
    }

    dirs::data_local_dir()
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| std::env::temp_dir()))
        .join(APP_DATA_DIR_NAME)
}

pub fn build_snapshot_for_data_root(data_root: &Path) -> BootstrapSnapshot {
    let store = LocalConfigStore::new(data_root);
    let mut snapshot = MigrationOrchestrator::new(&store).bootstrap();
    snapshot.data_root = data_root.to_string_lossy().into_owned();
    snapshot
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_contains_data_root() {
        let root = tempfile::tempdir().expect("temp dir");
        let snapshot = build_snapshot_for_data_root(root.path());
        assert_eq!(snapshot.data_root, root.path().to_string_lossy());
    }
}
