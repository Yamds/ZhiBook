//! Git 云端备份 IPC（P15）。
//!
//! 命令名只允许出现在前端 `src/core/services/cloud.service.ts`。
//! 除查询状态外全部走 `spawn_blocking`：网络与加密都是阻塞 / CPU 操作。

use std::sync::Arc;

use tauri::State;
use tk_cloud::service::CloudService;
use tk_domain::{
    CloudBackupState, CloudBackupSummary, CloudConnectionInfo, CloudCreatedKey, CloudKeyInfo,
    CloudKeyInput, CloudRestorePreview, CloudRestoreSummary, IntoErrorPayload,
};
use tk_ledger::Ledger;

use crate::AppState;
use crate::commands::{CommandResult, join_error};

fn service(state: &State<'_, AppState>) -> Arc<CloudService> {
    state.cloud.clone()
}

fn ledger(state: &State<'_, AppState>) -> CommandResult<Arc<Ledger>> {
    state.ledger.clone().map_err(|error| {
        tk_domain::error_payload!("ledger.db.unavailable", "记账库打不开：{detail}"; detail = error)
    })
}

async fn run<T, F>(task: F) -> CommandResult<T>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, tk_cloud::CloudError> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(join_error)?
        .map_err(IntoErrorPayload::into_error_payload)
}

/// 云端备份状态（是否配置 / 密钥 / 上次备份）。
#[tauri::command]
pub async fn get_cloud_backup_state(state: State<'_, AppState>) -> CommandResult<CloudBackupState> {
    let service = service(&state);
    run(move || service.state()).await
}

/// 保存仓库配置并测试连接。
#[tauri::command]
pub async fn save_cloud_backup_config(
    state: State<'_, AppState>,
    repo_url: String,
    username: String,
    token: String,
    branch: String,
) -> CommandResult<CloudConnectionInfo> {
    let service = service(&state);
    run(move || service.save_config(&repo_url, &username, &token, &branch)).await
}

/// 测试当前已保存的配置。
#[tauri::command]
pub async fn test_cloud_backup_connection(
    state: State<'_, AppState>,
) -> CommandResult<CloudConnectionInfo> {
    let service = service(&state);
    run(move || service.test_connection()).await
}

/// 首次生成主密钥（返回恢复密钥，仅此一次）。
#[tauri::command]
pub async fn create_cloud_backup_key(
    state: State<'_, AppState>,
    passphrase: Option<String>,
) -> CommandResult<CloudCreatedKey> {
    let service = service(&state);
    run(move || service.create_key(passphrase.as_deref())).await
}

/// 查看恢复密钥（需 PIN 由前端负责）。
#[tauri::command]
pub async fn view_cloud_recovery_key(state: State<'_, AppState>) -> CommandResult<String> {
    let service = service(&state);
    run(move || service.view_recovery_key()).await
}

/// 设置 / 更新口令包装。
#[tauri::command]
pub async fn set_cloud_backup_passphrase(
    state: State<'_, AppState>,
    passphrase: String,
) -> CommandResult<CloudKeyInfo> {
    let service = service(&state);
    run(move || service.set_passphrase(&passphrase)).await
}

/// 移除口令包装。
#[tauri::command]
pub async fn clear_cloud_backup_passphrase(
    state: State<'_, AppState>,
) -> CommandResult<CloudKeyInfo> {
    let service = service(&state);
    run(move || service.clear_passphrase()).await
}

/// 开关自动备份（每个逻辑日首次打开 App 时自动备份一次）。
#[tauri::command]
pub async fn set_cloud_auto_backup(
    state: State<'_, AppState>,
    enabled: bool,
) -> CommandResult<CloudBackupState> {
    let service = service(&state);
    run(move || service.set_auto_backup(enabled)).await
}

/// 自动备份：`day` 是前端按本地 05:00 边界算好的逻辑日。
#[tauri::command]
pub async fn run_cloud_auto_backup(
    state: State<'_, AppState>,
    day: String,
) -> CommandResult<Option<CloudBackupSummary>> {
    let service = service(&state);
    let ledger = ledger(&state)?;
    run(move || service.maybe_run_auto_backup(&day, &ledger)).await
}

/// 执行一次备份（必要时先合并其它设备）。
#[tauri::command]
pub async fn run_cloud_backup(state: State<'_, AppState>) -> CommandResult<CloudBackupSummary> {
    let service = service(&state);
    let ledger = ledger(&state)?;
    run(move || service.run_backup(&ledger)).await
}

/// 预览云端备份（本机缺密钥时返回 needsKey）。
#[tauri::command]
pub async fn preview_cloud_restore(
    state: State<'_, AppState>,
    key_input: Option<CloudKeyInput>,
) -> CommandResult<CloudRestorePreview> {
    let service = service(&state);
    run(move || service.preview_restore(key_input.as_ref())).await
}

/// 覆盖式恢复（导入前自动快照）。
#[tauri::command]
pub async fn run_cloud_restore(
    state: State<'_, AppState>,
    key_input: Option<CloudKeyInput>,
) -> CommandResult<CloudRestoreSummary> {
    let service = service(&state);
    let ledger = ledger(&state)?;
    run(move || service.run_restore(key_input.as_ref(), &ledger)).await
}

/// 断开云端备份（可选同时删除本机密钥与密文缓存）。
#[tauri::command]
pub async fn disconnect_cloud_backup(
    state: State<'_, AppState>,
    remove_key: bool,
) -> CommandResult<()> {
    let service = service(&state);
    run(move || service.disconnect(remove_key)).await
}
