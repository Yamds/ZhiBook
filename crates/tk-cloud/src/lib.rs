//! Git 云端备份（P15）：smart HTTP 最小客户端 + 云端加密包 + 多设备合并编排。
//!
//! 分层：
//! - [`pktline`] / [`git`] / [`pack`]：Git 协议与对象模型（纯逻辑，可单测）。
//! - [`transport`] / [`client`]：HTTP 传输抽象与 smart HTTP 客户端（refs / push / raw）。
//! - [`manifest`] / [`package`]：云端明文 manifest 与加密包组装（密文复用）。
//! - [`service`]：凭据与状态存储、备份 / 恢复 / 合并的完整流程。

pub mod client;
pub mod git;
pub mod manifest;
pub mod package;
pub mod pack;
pub mod pktline;
pub mod service;
pub mod transport;

use sha2::{Digest, Sha256};
use tk_domain::{ErrorPayload, IntoErrorPayload};

pub use client::{GitClient, GitCredentials, GitService, PushReport};
pub use manifest::{CloudFileEntry, CloudManifest};
pub use transport::{HttpMethod, HttpRequest, HttpResponse, HttpTransport};

/// 云端备份错误。
#[derive(Debug, thiserror::Error)]
pub enum CloudError {
    /// 底层协议 / 解析诊断（pkt-line 长度域、pack 对象数、对象 id 形态、manifest nonce…）。
    ///
    /// 这些 `{detail}` 是**技术诊断**：内部不变量违例，与操作系统 / SQLite / JSON
    /// 抛出的错误同类。语言文件只负责外层句子（`rust.cloud.protocol`），细节作为
    /// 参数透出；用户能据此采取不同行动的错误一律走 [`Self::Reported`] 提码。
    #[error("Git 协议错误：{0}")]
    Protocol(String),
    /// 网络层诊断（HTTP 状态码 + 请求动作），同上：状态码本身无法翻译。
    #[error("网络请求失败：{0}")]
    Http(String),
    #[error("认证失败：账号或 Token 不正确")]
    Auth,
    #[error("仓库不存在或没有访问权限")]
    NotFound,
    #[error("推送被拒绝：{0}")]
    PushRejected(String),
    /// 带具体错误码的结构化错误（新代码走这条）。
    ///
    /// 名字与 `tk_ledger::LedgerError::Reported` 保持一致：同一个概念在 workspace 里
    /// 只有一个叫法。业务态提示（未配置 / 密钥不一致 / 分支不对…）全部走它，
    /// 这样每条提示都能在语言文件里逐条翻译，而不是共用一个 `cloud.state`。
    #[error("{0}")]
    Reported(Box<ErrorPayload>),
    #[error("文件读写失败：{0}")]
    Io(#[from] std::io::Error),
    #[error("JSON 解析失败：{0}")]
    Json(#[from] serde_json::Error),
    #[error("加密失败：{0}")]
    Crypto(#[from] tk_crypto::CryptoError),
}

impl CloudError {
    /// 带错误码 + 具名参数的结构化错误。
    pub fn reported(payload: ErrorPayload) -> Self {
        Self::Reported(Box::new(payload))
    }
}

// 内层 crate 的错误原样透出（保留它们的错误码与参数），不再压成一句中文：
// 以前是 `Data(error.to_string())`，前端只能看到 `cloud.data` + 一长串拼接文本。
impl From<tk_backup::BackupError> for CloudError {
    fn from(error: tk_backup::BackupError) -> Self {
        Self::reported(error.into_error_payload())
    }
}

impl From<tk_ledger::LedgerError> for CloudError {
    fn from(error: tk_ledger::LedgerError) -> Self {
        Self::reported(error.into_error_payload())
    }
}

pub type CloudResult<T> = Result<T, CloudError>;

impl IntoErrorPayload for CloudError {
    fn into_error_payload(self) -> ErrorPayload {
        use tk_domain::error_payload;
        match self {
            Self::Protocol(detail) => {
                error_payload!("cloud.protocol", "Git 协议错误：{detail}"; detail = detail)
            }
            Self::Http(detail) => {
                error_payload!("cloud.http", "网络请求失败：{detail}"; detail = detail)
            }
            Self::Auth => error_payload!("cloud.auth", "认证失败：账号或 Token 不正确"),
            Self::NotFound => error_payload!("cloud.not_found", "仓库不存在或没有访问权限"),
            Self::PushRejected(detail) => error_payload!(
                "cloud.push_rejected", "推送被拒绝：{detail}"; detail = detail
            ),
            // 业务态错误：码与参数在产生处就定好了（`service.rs` / `package.rs`），
            // 这里原样透出，不做二次包装。
            Self::Reported(payload) => *payload,
            Self::Io(error) => {
                error_payload!("cloud.io", "文件读写失败：{detail}"; detail = error)
            }
            Self::Json(error) => {
                error_payload!("cloud.json", "JSON 解析失败：{detail}"; detail = error)
            }
            Self::Crypto(error) => error.into_error_payload(),
        }
    }
}

/// sha256 hex。
pub fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut out = String::with_capacity(64);
    for byte in digest {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 内层错误码穿透到前端() {
        // 账本/备份层的结构化错误穿过 tk-cloud 时要原样透出（码 + 参数都在），
        // 而不是被压成 `cloud.data` 的一串中文——否则前端只能整条翻译。
        let error = CloudError::from(tk_ledger::LedgerError::validation("账本名不能为空"));
        let payload = error.into_error_payload();
        assert_eq!(payload.code, "ledger.validation");
        assert_eq!(
            payload.params.get("detail").map(String::as_str),
            Some("账本名不能为空")
        );
    }

    #[test]
    fn 业务态错误原样透出码与参数() {
        let payload = CloudError::reported(tk_domain::error_payload!(
            "cloud.branch.unknown",
            "远端分支 {branch} 不是制账的备份分支";
            branch = "main"
        ))
        .into_error_payload();
        assert_eq!(payload.code, "cloud.branch.unknown");
        assert_eq!(payload.message, "远端分支 main 不是制账的备份分支");
        assert_eq!(payload.params.get("branch").map(String::as_str), Some("main"));
    }
}
