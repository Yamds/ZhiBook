//! 密码锁 IPC：PIN 设置 / 校验 / 修改 / 关闭。
//!
//! PBKDF2 迭代是 CPU 密集操作，统一走 `spawn_blocking`，不占主线程。
//! 命令名只允许出现在前端 `src/core/services/security.service.ts`。

use tauri::State;
use tk_domain::IntoErrorPayload;
use tk_security::{PinStore, SecurityError};

use crate::AppState;
use crate::commands::{CommandResult, join_error};

async fn run<T, F>(state: &State<'_, AppState>, task: F) -> CommandResult<T>
where
    T: Send + 'static,
    F: FnOnce(PinStore) -> Result<T, SecurityError> + Send + 'static,
{
    let data_root = state.data_root.clone();
    tauri::async_runtime::spawn_blocking(move || {
        task(PinStore::new(data_root)).map_err(IntoErrorPayload::into_error_payload)
    })
    .await
    .map_err(join_error)?
}

/// 是否已设置密码。
#[tauri::command]
pub async fn get_pin_configured(state: State<'_, AppState>) -> CommandResult<bool> {
    run(&state, |store| store.is_configured()).await
}

/// 首次设置密码（已设置时拒绝，改密走 `change_app_pin`）。
#[tauri::command]
pub async fn set_app_pin(state: State<'_, AppState>, pin: String) -> CommandResult<()> {
    run(&state, move |store| store.set_pin(&pin)).await
}

#[tauri::command]
pub async fn change_app_pin(
    state: State<'_, AppState>,
    old_pin: String,
    new_pin: String,
) -> CommandResult<()> {
    run(&state, move |store| store.change_pin(&old_pin, &new_pin)).await
}

#[tauri::command]
pub async fn verify_app_pin(state: State<'_, AppState>, pin: String) -> CommandResult<bool> {
    run(&state, move |store| store.verify(&pin)).await
}

#[tauri::command]
pub async fn clear_app_pin(state: State<'_, AppState>, pin: String) -> CommandResult<()> {
    run(&state, move |store| store.clear(&pin)).await
}
