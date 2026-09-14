//! 宿主编译期注册的 IPC 命令。
//!
//! 约定：command 只做参数转换、状态取得和错误边界；业务规则进入 tk-runtime
//! 或独立业务 crate。命令名只在前端 `src/core/services` 里出现。
//!
//! **错误一律返回 [`tk_domain::ErrorPayload`]**（错误码 + 插值参数 + 中文兑底），
//! 前端按错误码查语言文件；不要再把错误 `to_string()` 后当字符串抛出去。

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
use tk_domain::{BootstrapSnapshot, ErrorPayload, error_payload};

use crate::AppState;

/// 命令统一的错误返回类型。
pub type CommandResult<T> = Result<T, ErrorPayload>;

/// `spawn_blocking` 的 JoinError（线程 panic / 取消）：不是业务错误，单独一个码。
pub fn join_error(error: impl std::fmt::Display) -> ErrorPayload {
    error_payload!("app.task_join_failed", "后台任务异常：{error}"; error = error)
}

/// 启动快照：数据根、Schema 版本、迁移报告。
#[tauri::command]
pub fn get_bootstrap_status(state: State<'_, AppState>) -> BootstrapSnapshot {
    state.snapshot.clone()
}

/// 把迁移报告导出到 `<data_root>/tmp/exports/`，返回落盘路径。
#[tauri::command]
pub fn export_migration_report(state: State<'_, AppState>) -> CommandResult<PathBuf> {
    let store = tk_config::DataPaths::new(&state.data_root);
    fs::create_dir_all(store.export_dir()).map_err(|error| {
        error_payload!("app.migration_report_dir_failed", "导出目录创建失败：{detail}"; detail = error)
    })?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let path = store
        .export_dir()
        .join(format!("migration-report-{stamp}.json"));
    let data = serde_json::to_vec_pretty(&state.snapshot.report).map_err(|error| {
        error_payload!("app.migration_report_serialize_failed", "迁移报告序列化失败：{detail}"; detail = error)
    })?;
    fs::write(&path, data).map_err(|error| {
        error_payload!("app.migration_report_write_failed", "迁移报告写入失败：{detail}"; detail = error)
    })?;
    Ok(path)
}
