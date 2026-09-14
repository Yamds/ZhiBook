//! 跨 IPC 的结构化错误。
//!
//! 为什么要它：以前命令层把错误 `to_string()` 后直接抛给前端，缓存里只有一句
//! 拼好的中文（`账本不存在：book_x`），前端既无法翻译、也无法二次格式化。
//!
//! 现在每次失败都带三样东西：
//!   - `code`   稳定错误码（`ledger.book_not_found` 这类），**前端按它查语言文件**；
//!   - `params` 插值参数（`{ "id": "book_x" }`），让译文的语序可以自由调整；
//!   - `message` 已插值的中文成品，用于日志，以及前端没收录该 code 时降级展示。
//!
//! 前端契约见 `src/core/domain/errors.ts` 的 `describeError`：解析失败（老格式 /
//! 非本模块产生的字符串）时按纯文本处理，所以这条链路是向后兼容的。

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// 结构化错误载荷（序列化后作为 IPC 的 `Err` 值）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct ErrorPayload {
    /// 稳定错误码；命名约定 `<域>.<具体错误>`，例如 `ledger.book_not_found`。
    pub code: String,
    /// 已插值的中文成品文案（日志 + 未翻译时的降级展示）。
    pub message: String,
    /// 插值参数；值一律转成字符串，前端直接塞给 i18n。
    #[serde(default)]
    pub params: BTreeMap<String, String>,
}

impl ErrorPayload {
    /// 只有错误码与成品文案（无插值参数）。
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            params: BTreeMap::new(),
        }
    }

    /// 带上一个插值参数。
    pub fn with_param(mut self, name: &str, value: impl ToString) -> Self {
        self.params.insert(name.to_string(), value.to_string());
        self
    }

    /// 批量带插值参数。
    pub fn with_params<I, K, V>(mut self, params: I) -> Self
    where
        I: IntoIterator<Item = (K, V)>,
        K: Into<String>,
        V: ToString,
    {
        for (name, value) in params {
            self.params.insert(name.into(), value.to_string());
        }
        self
    }
}

/// `Display` 输出中文成品文案，所以 `thiserror` 里可以直接 `#[error("{0}")]`。
impl std::fmt::Display for ErrorPayload {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

/// 把各层错误类型统一收敛成 [`ErrorPayload`]。
///
/// 每个 crate 为它自己的错误枚举实现一次；命令层只需
/// `.map_err(IntoErrorPayload::into_error_payload)`，不需要逐层解构。
pub trait IntoErrorPayload {
    fn into_error_payload(self) -> ErrorPayload;
}

impl IntoErrorPayload for ErrorPayload {
    fn into_error_payload(self) -> ErrorPayload {
        self
    }
}

impl IntoErrorPayload for String {
    fn into_error_payload(self) -> ErrorPayload {
        ErrorPayload::new("app.error", self)
    }
}

impl IntoErrorPayload for &str {
    fn into_error_payload(self) -> ErrorPayload {
        ErrorPayload::new("app.error", self)
    }
}

/// 构造一个「错误码 + 中文模板 + 具名参数」的载荷。
///
/// 模板用 `{name}` 占位；插值结果只用于 `message`，语言文件里的 key 是 `code`。
///
/// ```ignore
/// error_payload!("ledger.name_empty", "账本名不能为空"; label = "账本名");
/// ```
#[macro_export]
macro_rules! error_payload {
    ($code:literal, $template:literal $(; $($name:ident = $value:expr),* $(,)?)?) => {{
        let mut params: ::std::collections::BTreeMap<String, String> =
            ::std::collections::BTreeMap::new();
        $($(
            params.insert(stringify!($name).to_string(), ($value).to_string());
        )*)?
        let mut message = String::from($template);
        for (name, value) in &params {
            message = message.replace(&format!("{{{name}}}"), value);
        }
        $crate::ErrorPayload {
            code: $code.to_string(),
            message,
            params,
        }
    }};
}
