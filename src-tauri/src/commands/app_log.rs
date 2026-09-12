//! 应用日志 IPC。
//!
//! Android 应用私有目录对其他应用不可见，所以只提供"读取当前会话日志"，
//! 不提供"在文件管理器中打开目录"（桌面模板里的 open_desktop_log_location）。

use serde::Serialize;
use tauri::State;

use crate::AppState;

#[derive(Debug, Clone, Serialize)]
pub struct AppLogTail {
    pub lines: Vec<String>,
    pub total_lines: usize,
}

/// 返回当前会话日志的尾部若干行。
#[tauri::command]
pub fn tail_app_log(
    state: State<'_, AppState>,
    lines: Option<usize>,
) -> Result<AppLogTail, String> {
    let path =
        crate::app_log::active_log_path().ok_or_else(|| "当前会话尚未创建日志文件".to_string())?;
    let text = crate::app_log::read_tail_text(&path, 256 * 1024)?;
    let mut values: Vec<String> = text.lines().map(str::to_string).collect();
    let take = lines.unwrap_or(300);
    if values.len() > take {
        values = values.split_off(values.len() - take);
    }
    let _ = state;
    let total_lines = values.len();
    Ok(AppLogTail {
        lines: values,
        total_lines,
    })
}
