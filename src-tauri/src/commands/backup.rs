//! 数据导入 / 导出 IPC：备份包在应用沙箱生成 / 读取，再由原生桥复制到用户位置。
//!
//! 命令名只允许出现在前端 `src/core/services/backup.service.ts`。

use std::path::Path;
use std::sync::Arc;

use tauri::State;
use tk_domain::{BackupPreview, BackupSummary, ImportSummary};
use tk_ledger::Ledger;

use crate::AppState;

type CommandResult<T> = Result<T, String>;

fn handle(state: &State<'_, AppState>) -> CommandResult<Arc<Ledger>> {
    state.ledger.clone().map_err(|error| error.to_owned())
}

/// 导出全量数据到 `tmp/exports/zz-backup-<时间戳>.zip`。
#[tauri::command]
pub async fn export_data(state: State<'_, AppState>) -> CommandResult<BackupSummary> {
    let ledger = handle(&state)?;
    let data_root = state.data_root.clone();
    tauri::async_runtime::spawn_blocking(move || {
        tk_backup::export_to_zip(&ledger, &data_root).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("后台任务异常：{error}"))?
}

/// 只读预览备份包内容（不落库）。
#[tauri::command]
pub async fn preview_backup(path: String) -> CommandResult<BackupPreview> {
    tauri::async_runtime::spawn_blocking(move || {
        tk_backup::preview_zip(Path::new(&path)).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("后台任务异常：{error}"))?
}

/// 覆盖式恢复（导入前自动快照）。
#[tauri::command]
pub async fn import_data(state: State<'_, AppState>, path: String) -> CommandResult<ImportSummary> {
    let ledger = handle(&state)?;
    let data_root = state.data_root.clone();
    tauri::async_runtime::spawn_blocking(move || {
        tk_backup::import_from_zip(&ledger, &data_root, Path::new(&path))
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("后台任务异常：{error}"))?
}
