//! 六段日志行格式:时间 | 等级 | 类型 | 来源 | 位置 | 消息。

use crate::facet::{LogSource, LogType};
use chrono::Local;

pub fn level_tag(level: &str) -> String {
    format!("[{level}]")
}
pub fn format_line(
    level: &str,
    log_type: LogType,
    source: LogSource,
    position: &str,
    message: &str,
) -> String {
    format_line_with_time(
        &Local::now().format("%y-%m-%d %H:%M:%S").to_string(),
        level,
        log_type,
        source,
        position,
        message,
    )
}
pub fn format_line_with_time(
    time: &str,
    level: &str,
    log_type: LogType,
    source: LogSource,
    position: &str,
    message: &str,
) -> String {
    format!(
        "{time} | {} | {} | {} | [{position}] | {message}\n",
        level_tag(level),
        log_type.segment(),
        source.segment()
    )
}
pub fn preview_line(line: &str) -> String {
    line.to_string()
}
