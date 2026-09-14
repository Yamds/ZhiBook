//! 宿主编译期注册的 IPC 命令。
//!
//! 约定：command 只做参数转换、状态取得和错误边界；业务规则进入 tk-runtime
//! 或独立业务 crate。命令名只在前端 `src/core/services` 里出现。

pub mod app_log;
pub mod app_settings;
pub mod backup;
pub mod cloud;
pub mod exit;
pub mod ledger;
pub mod security;

use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::State;
use tk_domain::BootstrapSnapshot;

use crate::AppState;

/// 启动快照：数据根、Schema 版本、迁移报告。
#[tauri::command]
pub fn get_bootstrap_status(state: State<'_, AppState>) -> BootstrapSnapshot {
    state.snapshot.clone()
}

/// 把迁移报告导出到 `<data_root>/tmp/exports/`，返回落盘路径。
#[tauri::command]
pub fn export_migration_report(state: State<'_, AppState>) -> Result<PathBuf, String> {
    let store = tk_config::DataPaths::new(&state.data_root);
    fs::create_dir_all(store.export_dir()).map_err(|error| error.to_string())?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let path = store
        .export_dir()
        .join(format!("migration-report-{stamp}.json"));
    let data =
        serde_json::to_vec_pretty(&state.snapshot.report).map_err(|error| error.to_string())?;
    fs::write(&path, data).map_err(|error| error.to_string())?;
    Ok(path)
}
