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

pub use client::{GitClient, GitCredentials, GitService, PushReport};
pub use manifest::{CloudFileEntry, CloudManifest};
pub use transport::{HttpMethod, HttpRequest, HttpResponse, HttpTransport};

/// 云端备份错误。
#[derive(Debug, thiserror::Error)]
pub enum CloudError {
    #[error("仓库地址不合法：{0}")]
    InvalidUrl(String),
    #[error("Git 协议错误：{0}")]
    Protocol(String),
    #[error("网络请求失败：{0}")]
    Http(String),
    #[error("认证失败：账号或 Token 不正确")]
    Auth,
    #[error("仓库不存在或没有访问权限")]
    NotFound,
    #[error("推送被拒绝：{0}")]
    PushRejected(String),
    #[error("云端备份不可用：{0}")]
    State(String),
    #[error("文件读写失败：{0}")]
    Io(#[from] std::io::Error),
    #[error("JSON 解析失败：{0}")]
    Json(#[from] serde_json::Error),
    #[error("加密失败：{0}")]
    Crypto(#[from] tk_crypto::CryptoError),
    #[error("数据层错误：{0}")]
    Data(String),
}

impl From<tk_backup::BackupError> for CloudError {
    fn from(error: tk_backup::BackupError) -> Self {
        Self::Data(error.to_string())
    }
}

impl From<tk_ledger::LedgerError> for CloudError {
    fn from(error: tk_ledger::LedgerError) -> Self {
        Self::Data(error.to_string())
    }
}

pub type CloudResult<T> = Result<T, CloudError>;

/// sha256 hex。
pub fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut out = String::with_capacity(64);
    for byte in digest {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}
