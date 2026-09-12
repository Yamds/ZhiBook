//! 退出闸门。
//!
//! 当前模板没有内置业务需要停止；`prepare_exit` 是预留扩展点，
//! 使用方可在这里加入任务、连接或子进程清理检查。

use serde::Serialize;
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize)]
pub struct PrepareExitResponse {
    pub can_exit: bool,
    pub reason: Option<String>,
}

/// 前端「退出程序？」确认框打开前调用。
#[tauri::command]
pub fn prepare_exit() -> PrepareExitResponse {
    PrepareExitResponse {
        can_exit: true,
        reason: None,
    }
}

/// 用户确认后真正结束进程。
#[tauri::command]
pub fn request_exit_app(app: AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}
