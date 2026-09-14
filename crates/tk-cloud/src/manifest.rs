//! 云端明文 manifest（最小化）。
//!
//! 只放：格式 / 版本 / keyId / 指纹 / 算法 / 创建时间 / 文件清单（路径 + 密文大小 +
//! 密文 sha256 + nonce）。业务计数与原始文件名都不上云。

use serde::{Deserialize, Serialize};

use crate::CloudResult;

/// 云端包标识。
pub const CLOUD_FORMAT: &str = "zhizhang-cloud-backup";
/// 云端包格式版本。
pub const CLOUD_FORMAT_VERSION: i64 = 1;
/// 文件加密算法标识。
pub const CLOUD_ALG: &str = "xchacha20poly1305";
/// manifest 自身的文件名。
pub const MANIFEST_PATH: &str = "manifest.json";
/// 主密钥包装的文件名。
pub const KEY_WRAP_PATH: &str = "key.wrap.json";
/// 数据文件（deflate + 加密）的文件名。
pub const DATA_PATH: &str = "data.enc";
/// 附件目录前缀。
pub const ATTACHMENTS_PREFIX: &str = "attachments/";

/// 单个文件的密文清单项。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudFileEntry {
    /// 云端相对路径（`backup/...`）。
    pub path: String,
    /// 密文字节数。
    pub size: i64,
    /// 密文的 sha256（hex）。
    pub sha256: String,
    /// 加密 nonce（base64，24B）。
    pub nonce: String,
}

/// 明文 manifest。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudManifest {
    pub format: String,
    pub format_version: i64,
    pub key_id: String,
    pub fingerprint: String,
    pub alg: String,
    pub created_at_ms: i64,
    pub files: Vec<CloudFileEntry>,
}

impl CloudManifest {
    pub fn new(key_id: impl Into<String>, fingerprint: impl Into<String>, created_at_ms: i64) -> Self {
        Self {
            format: CLOUD_FORMAT.to_string(),
            format_version: CLOUD_FORMAT_VERSION,
            key_id: key_id.into(),
            fingerprint: fingerprint.into(),
            alg: CLOUD_ALG.to_string(),
            created_at_ms,
            files: Vec::new(),
        }
    }

    pub fn find(&self, path: &str) -> Option<&CloudFileEntry> {
        self.files.iter().find(|item| item.path == path)
    }

    /// 校验 manifest 的基本合法性（格式 / 版本 / 算法）。
    pub fn validate(&self) -> CloudResult<()> {
        if self.format != CLOUD_FORMAT {
            return Err(crate::CloudError::Protocol(
                "不是制账的云端备份（manifest 标识不匹配）".to_string(),
            ));
        }
        if self.format_version > CLOUD_FORMAT_VERSION {
            return Err(crate::CloudError::Protocol(
                "云端备份比当前 App 新，请先升级 App".to_string(),
            ));
        }
        if self.alg != CLOUD_ALG {
            return Err(crate::CloudError::Protocol(format!(
                "不支持的加密算法：{}",
                self.alg
            )));
        }
        Ok(())
    }

    pub fn to_json(&self) -> CloudResult<Vec<u8>> {
        Ok(serde_json::to_vec_pretty(self)?)
    }

    pub fn from_json(bytes: &[u8]) -> CloudResult<Self> {
        let manifest: Self = serde_json::from_slice(bytes)?;
        manifest.validate()?;
        Ok(manifest)
    }
}

/// 文件加密的 AAD：`{keyId}:{逻辑路径}`。
pub fn file_aad(key_id: &str, path: &str) -> Vec<u8> {
    format!("{key_id}:{path}").into_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_round_trips_and_rejects_foreign_format() {
        let mut manifest = CloudManifest::new("k-12345678", "aabbccdd", 123);
        manifest.files.push(CloudFileEntry {
            path: DATA_PATH.to_string(),
            size: 10,
            sha256: "00".repeat(32),
            nonce: "bm9uY2U=".to_string(),
        });
        let json = manifest.to_json().expect("json");
        let parsed = CloudManifest::from_json(&json).expect("parse");
        assert_eq!(parsed, manifest);
        assert_eq!(parsed.find(DATA_PATH).map(|item| item.size), Some(10));

        let mut foreign = manifest.clone();
        foreign.format = "something-else".to_string();
        assert!(CloudManifest::from_json(&foreign.to_json().expect("json")).is_err());

        let mut newer = manifest;
        newer.format_version = CLOUD_FORMAT_VERSION + 1;
        assert!(CloudManifest::from_json(&newer.to_json().expect("json")).is_err());
    }

    #[test]
    fn aad_binds_key_and_path() {
        assert_eq!(file_aad("k-1", "backup/data.enc"), b"k-1:backup/data.enc".to_vec());
    }
}
