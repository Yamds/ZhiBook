//! 将 tracing target 压成可读的短模块名与日志来源。

pub fn short_module_from_target(target: &str) -> String {
    let trimmed = target.trim();
    if trimmed.is_empty() {
        return "app".to_string();
    }
    trimmed.rsplit("::").next().unwrap_or(trimmed).to_string()
}

pub fn log_source_from_target(target: &str) -> crate::facet::LogSource {
    use crate::facet::LogSource;
    if target.contains("tauri") || target.contains("ui") {
        LogSource::Ui
    } else {
        LogSource::Core
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn short_module() {
        assert_eq!(short_module_from_target("tk_runtime::worker"), "worker");
    }
}
