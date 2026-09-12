//! 通用日志格式与 target 映射。

pub mod facet;
pub mod line;
pub mod target;
pub use facet::{LogSource, LogType};
pub use line::{format_line, format_line_with_time, preview_line};
pub use target::{log_source_from_target, short_module_from_target};
