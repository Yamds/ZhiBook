//! 记账数据层的错误类型。
//!
//! 命令层把它转成字符串返回给前端（失败必须可见，不静默）。

use std::path::PathBuf;

/// 记账数据层错误。
#[derive(Debug, thiserror::Error)]
pub enum LedgerError {
    #[error("数据库错误：{0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("文件读写失败：{0}")]
    Io(#[from] std::io::Error),
    #[error("数据校验失败：{0}")]
    Validation(String),
    #[error("找不到记录：{0}")]
    NotFound(String),
    #[error("数据损坏：{0}")]
    Corrupt(String),
}

impl LedgerError {
    pub fn validation(message: impl Into<String>) -> Self {
        Self::Validation(message.into())
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::NotFound(message.into())
    }

    pub fn corrupt(message: impl Into<String>) -> Self {
        Self::Corrupt(message.into())
    }

    pub fn io_at(path: &std::path::Path, error: std::io::Error) -> Self {
        Self::Io(std::io::Error::new(
            error.kind(),
            format!("{}（{}）", error, path.display()),
        ))
    }

    /// 缺少附件文件时的展示路径。
    pub fn missing_path(path: PathBuf) -> Self {
        Self::not_found(format!("附件文件不存在：{}", path.display()))
    }
}

pub type LedgerResult<T> = Result<T, LedgerError>;
