//! Yamds记账 Tauri 壳（Android）。
//!
//! 业务应进入 tk-runtime / 新增 crate；这里仅保留平台能力、IPC 注册与装配。

use std::path::PathBuf;
use std::sync::Arc;

use tauri::{Emitter, Manager};
use tk_domain::{AppSettings, BootstrapSnapshot};
use tk_ledger::Ledger;
use tk_traits::{BroadcastEventBus, EventBus, EventFilter};
use tokio::sync::RwLock;

pub mod app_log;
pub mod app_log_format;
pub mod bootstrap;
pub mod commands;
pub mod http_transport;

pub struct AppState {
    pub(crate) data_root: PathBuf,
    pub(crate) snapshot: BootstrapSnapshot,
    pub(crate) app_settings: Arc<RwLock<AppSettings>>,
    /// 记账库句柄。打开失败时保留错误信息，命令层把它转换成可展示的提示，
    /// 而不是让整个应用启动失败。
    pub(crate) ledger: Result<Arc<Ledger>, String>,
    /// Git 云端备份服务（P15）。
    pub(crate) cloud: Arc<tk_cloud::service::CloudService>,
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
            let ledger = match Ledger::open(&data_root) {
                Ok(ledger) => Ok(Arc::new(ledger)),
                Err(error) => {
                    let message = error.to_string();
                    app_log::write_session_line("ERROR", "ledger_open", &message);
                    Err(message)
                }
            };
            let cloud = Arc::new(tk_cloud::service::CloudService::new(
                http_transport::build_http_transport(),
                data_root.clone(),
            ));
            app.manage(AppState {
                data_root,
                snapshot,
                app_settings: Arc::new(RwLock::new(settings)),
                ledger,
                cloud,
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
            // 记账数据底座（books / accounts / categories / transactions / stats / attachments）
            commands::ledger::list_books,
            commands::ledger::get_current_book,
            commands::ledger::create_book,
            commands::ledger::update_book,
            commands::ledger::delete_book,
            commands::ledger::set_current_book,
            commands::ledger::list_accounts,
            commands::ledger::create_account,
            commands::ledger::update_account,
            commands::ledger::delete_account,
            commands::ledger::reorder_accounts,
            commands::ledger::list_categories,
            commands::ledger::create_category,
            commands::ledger::update_category,
            commands::ledger::hide_category,
            commands::ledger::reorder_categories,
            commands::ledger::list_transactions_by_day,
            commands::ledger::list_transactions_range,
            commands::ledger::search_transactions,
            commands::ledger::get_transaction,
            commands::ledger::create_transaction,
            commands::ledger::update_transaction,
            commands::ledger::delete_transaction,
            commands::ledger::get_month_stats,
            commands::ledger::get_year_summary,
            commands::ledger::get_month_shares,
            commands::ledger::get_period_shares,
            commands::ledger::get_transaction_ranks,
            commands::ledger::get_year_transaction_ranks,
            commands::ledger::list_day_summaries,
            commands::ledger::get_assets_overview,
            commands::ledger::list_attachments,
            commands::ledger::save_attachment,
            commands::ledger::read_attachment,
            commands::ledger::delete_attachment,
            // 固定收支（每日）
            commands::ledger::list_recurring_rules,
            commands::ledger::create_recurring_rule,
            commands::ledger::update_recurring_rule,
            commands::ledger::delete_recurring_rule,
            commands::ledger::run_recurring_entries,
            // 密码锁（PIN）
            commands::security::get_pin_configured,
            commands::security::set_app_pin,
            commands::security::change_app_pin,
            commands::security::verify_app_pin,
            commands::security::clear_app_pin,
            // 数据导入 / 导出
            commands::backup::export_data,
            commands::backup::preview_backup,
            commands::backup::import_data,
            // Git 云端备份（P15）
            commands::cloud::get_cloud_backup_state,
            commands::cloud::save_cloud_backup_config,
            commands::cloud::test_cloud_backup_connection,
            commands::cloud::set_cloud_auto_backup,
            commands::cloud::run_cloud_auto_backup,
            commands::cloud::create_cloud_backup_key,
            commands::cloud::view_cloud_recovery_key,
            commands::cloud::set_cloud_backup_passphrase,
            commands::cloud::clear_cloud_backup_passphrase,
            commands::cloud::run_cloud_backup,
            commands::cloud::preview_cloud_restore,
            commands::cloud::run_cloud_restore,
            commands::cloud::disconnect_cloud_backup,
        ])
        .build(tauri::generate_context!());

    match application {
        Ok(application) => application.run(|_app, _event| {}),
        Err(error) => {
            app_log::write_session_line("ERROR", "lifecycle", &error.to_string());
            tracing::error!(target: "zhibook::lifecycle", %error, "failed to build Tauri application");
        }
    }
}
