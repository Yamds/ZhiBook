//! Yamds记账 Tauri 壳（Android）。
//!
//! 业务应进入 tk-runtime / 新增 crate；这里仅保留平台能力、IPC 注册与装配。

use std::path::PathBuf;
use std::sync::Arc;

use tauri::{Emitter, Manager};
use tk_domain::{AppSettings, BootstrapSnapshot};
use tk_traits::{BroadcastEventBus, EventBus, EventFilter};
use tokio::sync::RwLock;

pub mod app_log;
pub mod app_log_format;
pub mod bootstrap;
pub mod commands;

pub struct AppState {
    pub(crate) data_root: PathBuf,
    pub(crate) snapshot: BootstrapSnapshot,
    pub(crate) app_settings: Arc<RwLock<AppSettings>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let application = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            let data_root = bootstrap::resolve_data_root(app.handle());
            app_log::init(&data_root);
            let snapshot = bootstrap::build_snapshot_for_data_root(&data_root);
            let settings = commands::app_settings::read_app_settings(&data_root);
            app.manage(AppState {
                data_root,
                snapshot,
                app_settings: Arc::new(RwLock::new(settings)),
            });

            // 宿主 EventBus → WebView 事件桥。业务插件/模块发布领域事件后，
            // 前端通过 core/services/event-stream.service 订阅。
            let event_bus = BroadcastEventBus::default();
            let handle = app.handle().clone();
            let mut subscription = event_bus.subscribe(EventFilter::all());
            tauri::async_runtime::spawn(async move {
                while let Some(event) = subscription.next().await {
                    let name = event.tauri_event_name();
                    match event.to_envelope_json() {
                        Ok(payload) => {
                            let _ = handle.emit(name, payload);
                        }
                        Err(error) => {
                            app_log::write_session_line("WARN", "event_emit", &error.to_string());
                        }
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_bootstrap_status,
            commands::export_migration_report,
            commands::app_settings::get_app_settings,
            commands::app_settings::set_app_settings,
            commands::exit::prepare_exit,
            commands::exit::request_exit_app,
            commands::app_log::tail_app_log,
        ])
        .build(tauri::generate_context!());

    match application {
        Ok(application) => application.run(|_app, _event| {}),
        Err(error) => {
            app_log::write_session_line("ERROR", "lifecycle", &error.to_string());
            tracing::error!(target: "yamds_bill::lifecycle", %error, "failed to build Tauri application");
        }
    }
}
