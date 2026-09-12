//! tracing 日志格式化扩展点。

pub fn format_message(message: &str) -> String {
    message.trim().to_string()
}
