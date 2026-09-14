//! 记账数据层的错误类型。
//!
//! 命令层把它转成 [`ErrorPayload`] 返回给前端（失败必须可见，不静默）：
//! 前端按 `code` 查语言文件，查不到就展示 `message`（中文兜底）。
//!
//! 迁移策略：老写法 `LedgerError::validation(format!(...))` 仍然可用（码是档位级的
//! `ledger.validation`）；新写法用 `LedgerError::reported(error_payload!(...))` 带上
//! 具体错误码与插值参数，界面上就能翻译。**新代码一律用后者。**

use std::path::PathBuf;

use tk_domain::{ErrorPayload, error_payload};

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
    /// 带具体错误码的结构化错误（新代码走这条）。
    #[error("{0}")]
    Reported(Box<ErrorPayload>),
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

    /// 带错误码 + 具名参数的结构化错误。
    pub fn reported(payload: ErrorPayload) -> Self {
        Self::Reported(Box::new(payload))
    }

    pub fn io_at(path: &std::path::Path, error: std::io::Error) -> Self {
        Self::Io(std::io::Error::new(
            error.kind(),
            format!("{}（{}）", error, path.display()),
        ))
    }

    /// 缺少附件文件时的展示路径。
    pub fn missing_path(path: PathBuf) -> Self {
        Self::reported(
            error_payload!("ledger.attachment.missing", "附件文件不存在：{path}"; path = path.display()),
        )
    }

    /// 转成跨 IPC 的结构化载荷。
    pub fn payload(&self) -> ErrorPayload {
        match self {
            Self::Sqlite(error) => ErrorPayload::new("ledger.db", format!("数据库错误：{error}"))
                .with_param("detail", error),
            Self::Io(error) => ErrorPayload::new("ledger.io", format!("文件读写失败：{error}"))
                .with_param("detail", error),
            Self::Validation(message) => {
                ErrorPayload::new("ledger.validation", format!("数据校验失败：{message}"))
                    .with_param("detail", message)
            }
            Self::NotFound(message) => {
                ErrorPayload::new("ledger.not_found", format!("找不到记录：{message}"))
                    .with_param("detail", message)
            }
            Self::Corrupt(message) => {
                ErrorPayload::new("ledger.corrupt", format!("数据损坏：{message}"))
                    .with_param("detail", message)
            }
            Self::Reported(payload) => (**payload).clone(),
        }
    }

    /// 稳定错误码（日志 / 测试用；界面走 [`Self::payload`]）。
    pub fn code(&self) -> &str {
        match self {
            Self::Sqlite(_) => "ledger.db",
            Self::Io(_) => "ledger.io",
            Self::Validation(_) => "ledger.validation",
            Self::NotFound(_) => "ledger.not_found",
            Self::Corrupt(_) => "ledger.corrupt",
            Self::Reported(payload) => payload.code.as_str(),
        }
    }
}

impl From<ErrorPayload> for LedgerError {
    fn from(payload: ErrorPayload) -> Self {
        Self::reported(payload)
    }
}

/// 与其它 crate 统一：命令层只需 `.map_err(IntoErrorPayload::into_error_payload)`。
impl tk_domain::IntoErrorPayload for LedgerError {
    fn into_error_payload(self) -> ErrorPayload {
        self.payload()
    }
}

pub type LedgerResult<T> = Result<T, LedgerError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 结构化错误原样透出() {
        let error = LedgerError::reported(error_payload!(
            "ledger.book.not_found", "账本不存在：{id}"; id = "book_x"
        ));
        let payload = error.payload();
        assert_eq!(payload.code, "ledger.book.not_found");
        assert_eq!(payload.message, "账本不存在：book_x");
        assert_eq!(payload.params.get("id").map(String::as_str), Some("book_x"));
    }

    #[test]
    fn 老写法给出档位级错误码() {
        let error = LedgerError::validation("账本名不能为空");
        assert_eq!(error.code(), "ledger.validation");
        assert!(error.payload().message.contains("账本名不能为空"));
    }
}
