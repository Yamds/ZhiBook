//! Layer 3 运行时编排。
//!
//! 这里承载应用服务、生命周期、事件协调等运行时行为；Tauri command
//! 只负责参数转换和错误边界，不直接操作文件或实现业务规则。

use std::path::PathBuf;

#[derive(Clone)]
pub struct AppRuntime {
    data_root: PathBuf,
}

impl AppRuntime {
    pub fn new(data_root: impl Into<PathBuf>) -> Self {
        Self {
            data_root: data_root.into(),
        }
    }

    pub fn data_root(&self) -> &std::path::Path {
        &self.data_root
    }
}
