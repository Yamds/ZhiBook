//! AppSettings IPC:磁盘持久化 + 内存热更新。

use std::path::Path;

use tauri::State;
use tk_config::LocalConfigStore;
use tk_domain::{AppSettings, ErrorPayload, error_payload};
use tk_traits::ConfigStore;

use crate::AppState;
use crate::commands::CommandResult;

const APP_SETTINGS_FILE: &str = "app-settings.json";

fn load_from_store(store: &LocalConfigStore) -> AppSettings {
    let path = store.config_dir().join(APP_SETTINGS_FILE);
    let mut settings = match store.read_json(&path) {
        Ok(payload) => serde_json::from_value(payload).unwrap_or_default(),
        Err(_) => AppSettings::default(),
    };
    settings.normalize();
    settings
}

pub fn read_app_settings(data_root: &Path) -> AppSettings {
    load_from_store(&LocalConfigStore::new(data_root))
}

/// 把 AppSettings 原子写入 `config/app-settings.json`。启动装配层与命令层共用。
pub fn write_app_settings(data_root: &Path, settings: &AppSettings) -> Result<(), ErrorPayload> {
    let store = LocalConfigStore::new(data_root);
    let payload = serde_json::to_value(settings).map_err(|error| {
        error_payload!("app.settings.serialize_failed", "设置序列化失败：{detail}"; detail = error)
    })?;
    store
        .write_json_atomic(&store.config_dir().join(APP_SETTINGS_FILE), &payload)
        .map_err(|error| {
            error_payload!("app.settings.write_failed", "设置保存失败：{detail}"; detail = error)
        })
}

#[tauri::command]
pub fn get_app_settings(state: State<'_, AppState>) -> AppSettings {
    state.app_settings.blocking_read().clone()
}

#[tauri::command]
pub fn set_app_settings(
    state: State<'_, AppState>,
    mut settings: AppSettings,
) -> CommandResult<()> {
    settings.normalize();
    write_app_settings(&state.data_root, &settings)?;
    *state.app_settings.blocking_write() = settings;
    Ok(())
}
