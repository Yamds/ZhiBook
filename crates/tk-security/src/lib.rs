//! Layer 3 本地安全：PIN（数字密码）的哈希与存储。
//!
//! - 只存 `salt + hash + iterations + pinLength`（PBKDF2-HMAC-SHA256，16 字节盐）；
//!   明文密码、可逆密钥一律不落盘。
//! - 文件位置：`<data_root>/config/security.json`（`LocalConfigStore` 原子写）。
//! - 校验在 Rust 侧完成并做常量时间比较；哈希不下发前端。
//! - 不依赖 Tauri / Tokio：命令层只做参数转换与错误边界。

use std::path::{Path, PathBuf};

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;
use pbkdf2::pbkdf2_hmac;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use tk_config::{DataPaths, LocalConfigStore};
use tk_traits::ConfigStore;

/// 迭代次数：手机上一次校验约几十毫秒，兼顾安全与体验。
pub const PBKDF2_ITERATIONS: u32 = 120_000;
/// 盐长度（字节）。
pub const SALT_BYTES: usize = 16;
/// 派生密钥长度（字节）。
pub const KEY_BYTES: usize = 32;
/// PIN 长度范围（位）。
pub const PIN_MIN_LEN: usize = 4;
pub const PIN_MAX_LEN: usize = 8;

const SECURITY_FILE: &str = "security.json";

/// 安全配置错误（命令层转字符串返回前端）。
#[derive(Debug, thiserror::Error)]
pub enum SecurityError {
    #[error("校验失败：{0}")]
    Validation(String),
    #[error("安全配置读写失败：{0}")]
    Storage(String),
    #[error("安全配置损坏：{0}")]
    Corrupt(String),
}

impl SecurityError {
    pub fn validation(message: impl Into<String>) -> Self {
        Self::Validation(message.into())
    }
}

pub type SecurityResult<T> = Result<T, SecurityError>;

/// 落盘的 PIN 配置（不含任何明文）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PinConfig {
    version: u32,
    /// base64(盐)。
    salt: String,
    /// base64(PBKDF2 派生值)。
    hash: String,
    iterations: u32,
    /// PIN 位数（用于解锁时自动校验，非敏感）。
    pin_length: u32,
}

impl PinConfig {
    fn from_pin(pin: &str) -> SecurityResult<Self> {
        validate_pin(pin)?;
        let mut salt = [0u8; SALT_BYTES];
        getrandom::getrandom(&mut salt)
            .map_err(|error| SecurityError::Storage(format!("随机数生成失败：{error}")))?;
        let derived = derive(pin, &salt, PBKDF2_ITERATIONS);
        Ok(Self {
            version: 1,
            salt: STANDARD.encode(salt),
            hash: STANDARD.encode(derived),
            iterations: PBKDF2_ITERATIONS,
            pin_length: pin.chars().count() as u32,
        })
    }

    fn verify(&self, pin: &str) -> bool {
        let Ok(salt) = STANDARD.decode(&self.salt) else {
            return false;
        };
        let Ok(expected) = STANDARD.decode(&self.hash) else {
            return false;
        };
        let derived = derive(pin, &salt, self.iterations);
        constant_time_eq(&derived, &expected)
    }
}

/// PBKDF2-HMAC-SHA256 派生固定长度密钥。
fn derive(pin: &str, salt: &[u8], iterations: u32) -> [u8; KEY_BYTES] {
    let mut out = [0u8; KEY_BYTES];
    pbkdf2_hmac::<Sha256>(pin.as_bytes(), salt, iterations, &mut out);
    out
}

/// 常量时间比较（长度不同直接 false，长度信息不敏感）。
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (left, right) in a.iter().zip(b.iter()) {
        diff |= left ^ right;
    }
    diff == 0
}

/// PIN 必须是 4~8 位纯数字。
pub fn validate_pin(pin: &str) -> SecurityResult<()> {
    let length = pin.chars().count();
    if !(PIN_MIN_LEN..=PIN_MAX_LEN).contains(&length) {
        return Err(SecurityError::validation(format!(
            "密码需要 {PIN_MIN_LEN}~{PIN_MAX_LEN} 位数字"
        )));
    }
    if !pin.chars().all(|ch| ch.is_ascii_digit()) {
        return Err(SecurityError::validation("密码只能是数字"));
    }
    Ok(())
}

/// PIN 存储：读写 `<data_root>/config/security.json`。
pub struct PinStore {
    data_root: PathBuf,
}

impl PinStore {
    pub fn new(data_root: impl AsRef<Path>) -> Self {
        Self {
            data_root: data_root.as_ref().to_path_buf(),
        }
    }

    fn path(&self) -> PathBuf {
        DataPaths::new(&self.data_root)
            .config_dir()
            .join(SECURITY_FILE)
    }

    fn load(&self) -> SecurityResult<Option<PinConfig>> {
        let path = self.path();
        if !path.exists() {
            return Ok(None);
        }
        let store = LocalConfigStore::new(&self.data_root);
        let value = store
            .read_json(&path)
            .map_err(|error| SecurityError::Storage(error.to_string()))?;
        let config: PinConfig = serde_json::from_value(value)
            .map_err(|error| SecurityError::Corrupt(error.to_string()))?;
        Ok(Some(config))
    }

    fn save(&self, config: &PinConfig) -> SecurityResult<()> {
        let store = LocalConfigStore::new(&self.data_root);
        let value = serde_json::to_value(config)
            .map_err(|error| SecurityError::Storage(error.to_string()))?;
        store
            .write_json_atomic(&self.path(), &value)
            .map_err(|error| SecurityError::Storage(error.to_string()))
    }

    /// 是否已设置密码。
    pub fn is_configured(&self) -> SecurityResult<bool> {
        Ok(self.load()?.is_some())
    }

    /// 首次设置（已设置时拒绝，走 [`Self::change_pin`]）。
    pub fn set_pin(&self, pin: &str) -> SecurityResult<()> {
        if self.load()?.is_some() {
            return Err(SecurityError::validation("已设置密码，请使用「修改密码」"));
        }
        let config = PinConfig::from_pin(pin)?;
        self.save(&config)
    }

    pub fn change_pin(&self, old_pin: &str, new_pin: &str) -> SecurityResult<()> {
        let config = self
            .load()?
            .ok_or_else(|| SecurityError::validation("尚未设置密码"))?;
        if !config.verify(old_pin) {
            return Err(SecurityError::validation("原密码不正确"));
        }
        let next = PinConfig::from_pin(new_pin)?;
        self.save(&next)
    }

    /// 校验 PIN；未设置时返回 false（不会放行也不会报错）。
    pub fn verify(&self, pin: &str) -> SecurityResult<bool> {
        let Some(config) = self.load()? else {
            return Ok(false);
        };
        Ok(config.verify(pin))
    }

    /// 关闭密码（需要正确密码）。
    pub fn clear(&self, pin: &str) -> SecurityResult<()> {
        let config = self
            .load()?
            .ok_or_else(|| SecurityError::validation("尚未设置密码"))?;
        if !config.verify(pin) {
            return Err(SecurityError::validation("密码不正确"));
        }
        let path = self.path();
        if path.exists() {
            std::fs::remove_file(&path)
                .map_err(|error| SecurityError::Storage(error.to_string()))?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> (PinStore, tempfile::TempDir) {
        let temp = tempfile::TempDir::new().expect("temp dir");
        (PinStore::new(temp.path()), temp)
    }

    #[test]
    fn pin_lifecycle_set_verify_change_clear() {
        let (store, _temp) = store();
        assert!(!store.is_configured().expect("configured"));
        assert!(!store.verify("1234").expect("verify before set"));

        store.set_pin("1234").expect("set");
        assert!(store.is_configured().expect("configured"));
        assert!(store.verify("1234").expect("verify"));
        assert!(!store.verify("4321").expect("wrong"));
        assert!(store.set_pin("5678").is_err(), "重复设置应被拒绝");

        store.change_pin("1234", "5678").expect("change");
        assert!(store.verify("5678").expect("verify new"));
        assert!(!store.verify("1234").expect("old gone"));

        assert!(store.clear("1111").is_err(), "错误密码不能关闭");
        store.clear("5678").expect("clear");
        assert!(!store.is_configured().expect("configured after clear"));
    }

    #[test]
    fn pin_format_is_validated() {
        assert!(validate_pin("1234").is_ok());
        assert!(validate_pin("12345678").is_ok());
        assert!(validate_pin("123").is_err());
        assert!(validate_pin("123456789").is_err());
        assert!(validate_pin("12a4").is_err());
    }

    #[test]
    fn stored_file_never_contains_plaintext_pin() {
        let (store, temp) = store();
        store.set_pin("2468").expect("set");
        let raw = std::fs::read_to_string(temp.path().join("config").join("security.json"))
            .expect("read file");
        assert!(!raw.contains("2468"));
        assert!(raw.contains("hash"));
        assert!(raw.contains("salt"));
    }
}
