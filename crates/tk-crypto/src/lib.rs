//! 云端备份加密（P15.3）。
//!
//! - 文件加密：**XChaCha20-Poly1305**，每文件随机 24B nonce，AAD = 逻辑路径 + keyId。
//! - 主密钥：32B CSPRNG 随机（不是从口令派生）；本地 `config/backup-key.json` 明文保存
//!   （应用私有沙箱；Android Keystore 包装放二期）。
//! - 两条恢复路径（用于换机）：**口令包装**（Argon2id）与**恢复密钥**（32B 随机 + 校验位，
//!   base32 展示，HKDF-SHA256 派生包装密钥）。
//! - 云端只放包装结果（`KeyWrapFile`），**主密钥本身绝不上云**。
//!
//! 本 crate 只做纯逻辑（无文件 IO、无 Tauri / 网络依赖），便于单测。

use argon2::{Algorithm, Argon2, Params, Version};
use base32::{Alphabet, decode as base32_decode, encode as base32_encode};
use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use chacha20poly1305::aead::{Aead, Payload};
use chacha20poly1305::{KeyInit, XChaCha20Poly1305, XNonce};
use hkdf::Hkdf;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use zeroize::Zeroizing;

/// 主密钥长度。
pub const KEY_BYTES: usize = 32;
/// XChaCha20 nonce 长度。
pub const NONCE_BYTES: usize = 24;
/// 恢复密钥的随机部分长度。
const RECOVERY_SECRET_BYTES: usize = 32;
/// 恢复密钥的校验位长度（SHA-256 前 2 字节）。
const RECOVERY_CHECK_BYTES: usize = 2;
/// Argon2id 默认内存参数（KiB）。
pub const DEFAULT_ARGON2_M_KIB: u32 = 32 * 1024;
/// Argon2id 默认迭代次数。
pub const DEFAULT_ARGON2_ITERATIONS: u32 = 3;
/// Argon2id 默认并行度。
pub const DEFAULT_ARGON2_PARALLELISM: u32 = 1;
/// 包装 AAD 的前缀（固定上下文，防止不同用途的密文互串）。
const WRAP_CONTEXT: &[u8] = b"zhizhang-cloud-backup:key-wrap:v1";
/// 恢复密钥 HKDF info。
const RECOVERY_HKDF_INFO: &[u8] = b"zhizhang-cloud-backup:recovery:v1";

#[derive(Debug, thiserror::Error)]
pub enum CryptoError {
    #[error("密钥材料不合法：{0}")]
    InvalidKey(String),
    #[error("密文已损坏或被篡改")]
    Tampered,
    #[error("口令不正确")]
    WrongPassphrase,
    #[error("恢复密钥不正确或格式错误")]
    WrongRecoveryKey,
    #[error("随机数生成失败")]
    Random,
    #[error("密钥包装失败")]
    Wrap,
    #[error("JSON 解析失败：{0}")]
    Json(#[from] serde_json::Error),
}

pub type CryptoResult<T> = Result<T, CryptoError>;

impl tk_domain::IntoErrorPayload for CryptoError {
    fn into_error_payload(self) -> tk_domain::ErrorPayload {
        use tk_domain::error_payload;
        match self {
            Self::InvalidKey(detail) => error_payload!(
                "crypto.invalid_key", "密钥材料不合法：{detail}"; detail = detail
            ),
            Self::Tampered => error_payload!("crypto.tampered", "密文已损坏或被篡改"),
            Self::WrongPassphrase => error_payload!("crypto.wrong_passphrase", "口令不正确"),
            Self::WrongRecoveryKey => {
                error_payload!("crypto.wrong_recovery_key", "恢复密钥不正确或格式错误")
            }
            Self::Random => error_payload!("crypto.random", "随机数生成失败"),
            Self::Wrap => error_payload!("crypto.wrap", "密钥包装失败"),
            Self::Json(error) => {
                error_payload!("crypto.json", "JSON 解析失败：{detail}"; detail = error)
            }
        }
    }
}

/// 主密钥：32B 随机字节，Drop 时清零。
pub struct MasterKey(Zeroizing<[u8; KEY_BYTES]>);

impl MasterKey {
    /// 生成新的随机主密钥。
    pub fn generate() -> CryptoResult<Self> {
        let mut bytes = [0u8; KEY_BYTES];
        getrandom::getrandom(&mut bytes).map_err(|_| CryptoError::Random)?;
        Ok(Self(Zeroizing::new(bytes)))
    }

    pub fn from_bytes(bytes: [u8; KEY_BYTES]) -> Self {
        Self(Zeroizing::new(bytes))
    }

    pub fn as_bytes(&self) -> &[u8; KEY_BYTES] {
        &self.0
    }

    pub fn to_base64(&self) -> String {
        BASE64.encode(self.0.as_slice())
    }

    /// base64 → 主密钥（长度不合法直接报错）。
    pub fn from_base64(text: &str) -> CryptoResult<Self> {
        let bytes = BASE64
            .decode(text.trim())
            .map_err(|_| CryptoError::InvalidKey("不是合法的 base64".to_string()))?;
        let bytes: [u8; KEY_BYTES] = bytes
            .try_into()
            .map_err(|_| CryptoError::InvalidKey(format!("主密钥必须是 {KEY_BYTES} 字节")))?;
        Ok(Self::from_bytes(bytes))
    }

    /// 密钥指纹：SHA-256 前 4 字节的 hex（8 字符），用于明文 manifest 里的对账。
    pub fn fingerprint(&self) -> String {
        fingerprint_of(self.as_bytes())
    }
}

impl std::fmt::Debug for MasterKey {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // 不打印任何密钥内容。
        formatter.write_str("MasterKey(***)")
    }
}

pub fn fingerprint_of(key: &[u8; KEY_BYTES]) -> String {
    let digest = Sha256::digest(key);
    let mut out = String::with_capacity(8);
    for byte in &digest[..4] {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

/// 随机 keyId：`k-` + 8 位 hex。
pub fn random_key_id() -> CryptoResult<String> {
    let mut bytes = [0u8; 4];
    getrandom::getrandom(&mut bytes).map_err(|_| CryptoError::Random)?;
    let mut out = String::from("k-");
    for byte in bytes {
        out.push_str(&format!("{byte:02x}"));
    }
    Ok(out)
}

/// keyId 是否合法：`k-` + 8 位小写十六进制。
///
/// `key.wrap.json` 来自网络（云端仓库），而 keyId 会被拼进本地目录名
/// （`tmp/cloud-cache/<keyId>`）并配合 `remove_dir_all` 使用，
/// 因此导入 / 读取密钥文件前必须先过这里。
pub fn is_valid_key_id(value: &str) -> bool {
    value.len() == 10
        && value.starts_with("k-")
        && value[2..]
            .chars()
            .all(|ch| ch.is_ascii_digit() || ('a'..='f').contains(&ch))
}

// ---------------------------------------------------------------------------
// 文件加密
// ---------------------------------------------------------------------------

/// 加密结果：nonce + 密文（明文长度 + 16B tag）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Sealed {
    pub nonce: [u8; NONCE_BYTES],
    pub ciphertext: Vec<u8>,
}

/// 加密：`aad` 绑定逻辑路径与 keyId（防止密文被挪到别的文件下重放）。
pub fn seal(key: &[u8; KEY_BYTES], aad: &[u8], plaintext: &[u8]) -> CryptoResult<Sealed> {
    let cipher = XChaCha20Poly1305::new_from_slice(key)
        .map_err(|_| CryptoError::InvalidKey("主密钥长度不正确".to_string()))?;
    let mut nonce = [0u8; NONCE_BYTES];
    getrandom::getrandom(&mut nonce).map_err(|_| CryptoError::Random)?;
    let ciphertext = cipher
        .encrypt(
            XNonce::from_slice(&nonce),
            Payload {
                msg: plaintext,
                aad,
            },
        )
        .map_err(|_| CryptoError::Wrap)?;
    Ok(Sealed { nonce, ciphertext })
}

/// 解密；任何篡改 / 错误密钥都会走到 [`CryptoError::Tampered`]。
pub fn open(
    key: &[u8; KEY_BYTES],
    aad: &[u8],
    nonce: &[u8; NONCE_BYTES],
    ciphertext: &[u8],
) -> CryptoResult<Vec<u8>> {
    let cipher = XChaCha20Poly1305::new_from_slice(key)
        .map_err(|_| CryptoError::InvalidKey("主密钥长度不正确".to_string()))?;
    cipher
        .decrypt(
            XNonce::from_slice(nonce),
            Payload {
                msg: ciphertext,
                aad,
            },
        )
        .map_err(|_| CryptoError::Tampered)
}

// ---------------------------------------------------------------------------
// 恢复密钥
// ---------------------------------------------------------------------------

/// 生成恢复密钥：32B 随机 + 2B 校验，base32（无填充）大写展示。
/// 返回（展示用字符串，原始字节）。
pub fn generate_recovery_key() -> CryptoResult<(String, [u8; RECOVERY_SECRET_BYTES])> {
    let mut secret = [0u8; RECOVERY_SECRET_BYTES];
    getrandom::getrandom(&mut secret).map_err(|_| CryptoError::Random)?;
    Ok((format_recovery_key(&secret)?, secret))
}

/// 原始字节 → 展示字符串（含校验位，`XXXXX-XXXXX-…` 分组）。
pub fn format_recovery_key(secret: &[u8; RECOVERY_SECRET_BYTES]) -> CryptoResult<String> {
    let mut bytes = Vec::with_capacity(RECOVERY_SECRET_BYTES + RECOVERY_CHECK_BYTES);
    bytes.extend_from_slice(secret);
    let digest = Sha256::digest(secret);
    bytes.extend_from_slice(&digest[..RECOVERY_CHECK_BYTES]);
    let encoded = base32_encode(Alphabet::Rfc4648 { padding: false }, &bytes);
    Ok(group_recovery_text(&encoded))
}

/// 展示字符串 → 原始字节；校验位不匹配 / 字符不合法 / 长度不对都返回 [`CryptoError::WrongRecoveryKey`]。
pub fn parse_recovery_key(display: &str) -> CryptoResult<[u8; RECOVERY_SECRET_BYTES]> {
    let normalized: String = display
        .chars()
        .filter(|item| !item.is_whitespace() && *item != '-')
        .collect::<String>()
        .to_ascii_uppercase();
    let bytes = base32_decode(Alphabet::Rfc4648 { padding: false }, &normalized)
        .ok_or(CryptoError::WrongRecoveryKey)?;
    if bytes.len() != RECOVERY_SECRET_BYTES + RECOVERY_CHECK_BYTES {
        return Err(CryptoError::WrongRecoveryKey);
    }
    let (secret, check) = bytes.split_at(RECOVERY_SECRET_BYTES);
    let secret: [u8; RECOVERY_SECRET_BYTES] =
        secret.try_into().map_err(|_| CryptoError::WrongRecoveryKey)?;
    let digest = Sha256::digest(secret);
    if digest[..RECOVERY_CHECK_BYTES] != check[..] {
        return Err(CryptoError::WrongRecoveryKey);
    }
    Ok(secret)
}

/// 每 5 个字符一组，方便手抄。
fn group_recovery_text(text: &str) -> String {
    let mut out = String::with_capacity(text.len() + text.len() / 5);
    for (index, ch) in text.chars().enumerate() {
        if index > 0 && index % 5 == 0 {
            out.push('-');
        }
        out.push(ch);
    }
    out
}

// ---------------------------------------------------------------------------
// 密钥包装（口令 / 恢复密钥）
// ---------------------------------------------------------------------------

/// 一条包装记录：把主密钥用「口令派生密钥」或「恢复密钥派生密钥」加密。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WrapBlob {
    /// `passphrase` | `recovery`
    pub kind: String,
    /// `argon2id` | `hkdf-sha256`
    pub kdf: String,
    pub salt: String,
    pub nonce: String,
    pub ciphertext: String,
    #[serde(default)]
    pub m_kib: u32,
    #[serde(default)]
    pub iterations: u32,
    #[serde(default)]
    pub parallelism: u32,
}

impl WrapBlob {
    fn aad(kind: &str) -> Vec<u8> {
        let mut aad = WRAP_CONTEXT.to_vec();
        aad.extend_from_slice(b":");
        aad.extend_from_slice(kind.as_bytes());
        aad
    }

    fn from_sealed(kind: &str, kdf: &str, salt: &[u8], sealed: Sealed, params: Option<(u32, u32, u32)>) -> Self {
        let (m_kib, iterations, parallelism) = params.unwrap_or((0, 0, 0));
        Self {
            kind: kind.to_string(),
            kdf: kdf.to_string(),
            salt: BASE64.encode(salt),
            nonce: BASE64.encode(sealed.nonce),
            ciphertext: BASE64.encode(sealed.ciphertext),
            m_kib,
            iterations,
            parallelism,
        }
    }

    fn decode_salt(&self) -> CryptoResult<Vec<u8>> {
        BASE64
            .decode(self.salt.trim())
            .map_err(|_| CryptoError::InvalidKey("包装盐不是合法的 base64".to_string()))
    }

    fn decode_nonce(&self) -> CryptoResult<[u8; NONCE_BYTES]> {
        BASE64
            .decode(self.nonce.trim())
            .map_err(|_| CryptoError::InvalidKey("包装 nonce 不是合法的 base64".to_string()))?
            .try_into()
            .map_err(|_| CryptoError::InvalidKey("包装 nonce 长度不正确".to_string()))
    }

    fn decode_ciphertext(&self) -> CryptoResult<Vec<u8>> {
        BASE64
            .decode(self.ciphertext.trim())
            .map_err(|_| CryptoError::InvalidKey("包装密文不是合法的 base64".to_string()))
    }
}

/// 用口令包装主密钥（Argon2id，参数写入 blob，便于将来调整仍可解开）。
pub fn wrap_with_passphrase(master: &MasterKey, passphrase: &str) -> CryptoResult<WrapBlob> {
    if passphrase.chars().count() < 6 {
        return Err(CryptoError::InvalidKey("口令至少 6 位".to_string()));
    }
    let key = derive_passphrase_key(passphrase, None, None)?;
    let salt = key.salt;
    let sealed = seal(&key.bytes, &WrapBlob::aad("passphrase"), master.0.as_slice())?;
    Ok(WrapBlob::from_sealed(
        "passphrase",
        "argon2id",
        &salt,
        sealed,
        Some((
            DEFAULT_ARGON2_M_KIB,
            DEFAULT_ARGON2_ITERATIONS,
            DEFAULT_ARGON2_PARALLELISM,
        )),
    ))
}

/// 解开口令包装；口令错误统一报 [`CryptoError::WrongPassphrase`]。
pub fn unwrap_with_passphrase(blob: &WrapBlob, passphrase: &str) -> CryptoResult<MasterKey> {
    if blob.kind != "passphrase" || blob.kdf != "argon2id" {
        return Err(CryptoError::InvalidKey("不是口令包装".to_string()));
    }
    let salt = blob.decode_salt()?;
    let bytes = derive_argon2(
        passphrase,
        &salt,
        blob.m_kib.max(8),
        blob.iterations.max(1),
        blob.parallelism.max(1),
    )?;
    let mut plain = open(
        &bytes,
        &WrapBlob::aad("passphrase"),
        &blob.decode_nonce()?,
        &blob.decode_ciphertext()?,
    )
    .map_err(|_| CryptoError::WrongPassphrase)?;
    let key: [u8; KEY_BYTES] = plain
        .as_slice()
        .try_into()
        .map_err(|_| CryptoError::WrongPassphrase)?;
    zeroize_bytes(&mut plain);
    Ok(MasterKey::from_bytes(key))
}

/// 用恢复密钥包装主密钥（HKDF-SHA256；恢复密钥本身是 256 位随机，无需慢 KDF）。
pub fn wrap_with_recovery(
    master: &MasterKey,
    recovery: &[u8; RECOVERY_SECRET_BYTES],
) -> CryptoResult<WrapBlob> {
    let mut salt = [0u8; 16];
    getrandom::getrandom(&mut salt).map_err(|_| CryptoError::Random)?;
    let key = derive_recovery_key(recovery, &salt)?;
    let sealed = seal(&key, &WrapBlob::aad("recovery"), master.0.as_slice())?;
    Ok(WrapBlob::from_sealed(
        "recovery",
        "hkdf-sha256",
        &salt,
        sealed,
        None,
    ))
}

/// 解开恢复密钥包装；密钥错误 / 格式错误统一报 [`CryptoError::WrongRecoveryKey`]。
pub fn unwrap_with_recovery(
    blob: &WrapBlob,
    recovery: &[u8; RECOVERY_SECRET_BYTES],
) -> CryptoResult<MasterKey> {
    if blob.kind != "recovery" || blob.kdf != "hkdf-sha256" {
        return Err(CryptoError::InvalidKey("不是恢复密钥包装".to_string()));
    }
    let salt = blob.decode_salt()?;
    let key = derive_recovery_key(recovery, &salt)?;
    let mut plain = open(
        &key,
        &WrapBlob::aad("recovery"),
        &blob.decode_nonce()?,
        &blob.decode_ciphertext()?,
    )
    .map_err(|_| CryptoError::WrongRecoveryKey)?;
    let bytes: [u8; KEY_BYTES] = plain
        .as_slice()
        .try_into()
        .map_err(|_| CryptoError::WrongRecoveryKey)?;
    zeroize_bytes(&mut plain);
    Ok(MasterKey::from_bytes(bytes))
}

struct DerivedKey {
    bytes: Zeroizing<[u8; KEY_BYTES]>,
    salt: Vec<u8>,
}

fn derive_passphrase_key(
    passphrase: &str,
    salt: Option<Vec<u8>>,
    params: Option<(u32, u32, u32)>,
) -> CryptoResult<DerivedKey> {
    let salt = match salt {
        Some(value) => value,
        None => {
            let mut value = [0u8; 16];
            getrandom::getrandom(&mut value).map_err(|_| CryptoError::Random)?;
            value.to_vec()
        }
    };
    let (m_kib, iterations, parallelism) =
        params.unwrap_or((DEFAULT_ARGON2_M_KIB, DEFAULT_ARGON2_ITERATIONS, DEFAULT_ARGON2_PARALLELISM));
    let bytes = derive_argon2(passphrase, &salt, m_kib, iterations, parallelism)?;
    Ok(DerivedKey { bytes, salt })
}

fn derive_argon2(
    passphrase: &str,
    salt: &[u8],
    m_kib: u32,
    iterations: u32,
    parallelism: u32,
) -> CryptoResult<Zeroizing<[u8; KEY_BYTES]>> {
    let params = Params::new(m_kib, iterations, parallelism, Some(KEY_BYTES))
        .map_err(|error| CryptoError::InvalidKey(format!("Argon2 参数不合法：{error}")))?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut out = Zeroizing::new([0u8; KEY_BYTES]);
    argon
        .hash_password_into(passphrase.as_bytes(), salt, out.as_mut())
        .map_err(|_| CryptoError::Wrap)?;
    Ok(out)
}

fn derive_recovery_key(
    recovery: &[u8; RECOVERY_SECRET_BYTES],
    salt: &[u8],
) -> CryptoResult<[u8; KEY_BYTES]> {
    let hkdf = Hkdf::<Sha256>::new(Some(salt), recovery);
    let mut out = [0u8; KEY_BYTES];
    hkdf.expand(RECOVERY_HKDF_INFO, &mut out)
        .map_err(|_| CryptoError::Wrap)?;
    Ok(out)
}

fn zeroize_bytes(bytes: &mut [u8]) {
    use zeroize::Zeroize;
    bytes.zeroize();
}

// ---------------------------------------------------------------------------
// 密钥文件模型
// ---------------------------------------------------------------------------

/// 本地主密钥文件（`config/backup-key.json`）。
///
/// 主密钥与恢复密钥的明文只在本机沙箱；云端只上传 [`KeyWrapFile`]。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyFile {
    pub version: u32,
    pub key_id: String,
    pub fingerprint: String,
    pub created_at_ms: i64,
    /// base64(32B) 主密钥。
    pub key: String,
    /// base64(32B) 恢复密钥的原始字节（用于「之后查看」，需 PIN）。
    #[serde(default)]
    pub recovery: String,
    #[serde(default)]
    pub wraps: Vec<WrapBlob>,
}

impl KeyFile {
    /// 生成一套新的密钥材料；返回（密钥文件，展示用恢复密钥）。
    ///
    /// `passphrase` 为空时不写口令包装（只留恢复密钥这一条恢复路径）。
    pub fn create(
        now_ms: i64,
        passphrase: Option<&str>,
    ) -> CryptoResult<(Self, String)> {
        let master = MasterKey::generate()?;
        let (recovery_display, recovery_bytes) = generate_recovery_key()?;
        let mut wraps = vec![wrap_with_recovery(&master, &recovery_bytes)?];
        if let Some(passphrase) = passphrase.filter(|value| !value.trim().is_empty()) {
            wraps.push(wrap_with_passphrase(&master, passphrase)?);
        }
        Ok((
            Self {
                version: 1,
                key_id: random_key_id()?,
                fingerprint: master.fingerprint(),
                created_at_ms: now_ms,
                key: master.to_base64(),
                recovery: BASE64.encode(recovery_bytes),
                wraps,
            },
            recovery_display,
        ))
    }

    pub fn master_key(&self) -> CryptoResult<MasterKey> {
        let key = MasterKey::from_base64(&self.key)?;
        if key.fingerprint() != self.fingerprint {
            return Err(CryptoError::InvalidKey(
                "密钥指纹与主密钥不一致，密钥文件可能被改过".to_string(),
            ));
        }
        Ok(key)
    }

    /// 恢复密钥的展示形态；缺失或损坏返回 `None`。
    pub fn recovery_display(&self) -> Option<String> {
        let bytes = BASE64.decode(self.recovery.trim()).ok()?;
        let bytes: [u8; RECOVERY_SECRET_BYTES] = bytes.try_into().ok()?;
        format_recovery_key(&bytes).ok()
    }

    /// 添加 / 替换口令包装（保留恢复密钥包装）。
    pub fn set_passphrase(&mut self, master: &MasterKey, passphrase: &str) -> CryptoResult<()> {
        self.wraps.retain(|item| item.kind != "passphrase");
        self.wraps.push(wrap_with_passphrase(master, passphrase)?);
        Ok(())
    }

    /// 移除口令包装（至少保留恢复密钥包装）。
    pub fn remove_passphrase(&mut self) {
        self.wraps.retain(|item| item.kind != "passphrase");
    }

    pub fn has_passphrase(&self) -> bool {
        self.wraps.iter().any(|item| item.kind == "passphrase")
    }

    /// 上传到云端的部分（不含主密钥与恢复密钥明文）。
    pub fn to_wrap_file(&self) -> KeyWrapFile {
        KeyWrapFile {
            version: self.version,
            key_id: self.key_id.clone(),
            fingerprint: self.fingerprint.clone(),
            created_at_ms: self.created_at_ms,
            wraps: self.wraps.clone(),
        }
    }
}

/// 云端 `key.wrap.json`：只含包装，没有主密钥。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyWrapFile {
    pub version: u32,
    pub key_id: String,
    pub fingerprint: String,
    pub created_at_ms: i64,
    pub wraps: Vec<WrapBlob>,
}

impl KeyWrapFile {
    /// 用口令解开云端密钥（换机恢复路径之一）。
    pub fn unwrap_passphrase(&self, passphrase: &str) -> CryptoResult<MasterKey> {
        let blob = self
            .wraps
            .iter()
            .find(|item| item.kind == "passphrase")
            .ok_or(CryptoError::InvalidKey("云端没有口令包装".to_string()))?;
        unwrap_with_passphrase(blob, passphrase)
    }

    /// 用恢复密钥解开云端密钥（换机恢复路径之二）。
    pub fn unwrap_recovery(&self, recovery: &str) -> CryptoResult<MasterKey> {
        let secret = parse_recovery_key(recovery)?;
        let blob = self
            .wraps
            .iter()
            .find(|item| item.kind == "recovery")
            .ok_or(CryptoError::InvalidKey("云端没有恢复密钥包装".to_string()))?;
        unwrap_with_recovery(blob, &secret)
    }

    pub fn has_passphrase(&self) -> bool {
        self.wraps.iter().any(|item| item.kind == "passphrase")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seal_round_trips_and_detects_tampering() {
        let key = MasterKey::generate().expect("key");
        let aad = b"data.enc:k-12345678";
        let sealed = seal(key.as_bytes(), aad, "账本数据".as_bytes()).expect("seal");
        let plain = open(key.as_bytes(), aad, &sealed.nonce, &sealed.ciphertext).expect("open");
        assert_eq!(plain, "账本数据".as_bytes());

        // 改 AAD（等价于把密文挪到别的路径）必须失败
        assert!(matches!(
            open(key.as_bytes(), b"attachments/a.bin:k-12345678", &sealed.nonce, &sealed.ciphertext),
            Err(CryptoError::Tampered)
        ));
        // 改一个字节必须失败
        let mut tampered = sealed.ciphertext.clone();
        tampered[0] ^= 0x01;
        assert!(matches!(
            open(key.as_bytes(), aad, &sealed.nonce, &tampered),
            Err(CryptoError::Tampered)
        ));
        // 换密钥必须失败
        let other = MasterKey::generate().expect("key");
        assert!(open(other.as_bytes(), aad, &sealed.nonce, &sealed.ciphertext).is_err());
    }

    #[test]
    fn recovery_key_round_trips_and_rejects_typos() {
        let (display, secret) = generate_recovery_key().expect("recovery");
        assert!(display.contains('-'));
        let parsed = parse_recovery_key(&display).expect("parse");
        assert_eq!(parsed, secret);
        // 大小写 / 空格 / 分组都应容忍
        let messy = format!(" {} ", display.to_lowercase().replace('-', " "));
        assert_eq!(parse_recovery_key(&messy).expect("messy"), secret);

        // 改一个字符 → 校验位兜底
        let mut chars: Vec<char> = display.chars().collect();
        let index = chars.iter().position(|ch| *ch != '-').expect("char");
        chars[index] = if chars[index] == 'A' { 'B' } else { 'A' };
        let broken: String = chars.into_iter().collect();
        assert!(matches!(
            parse_recovery_key(&broken),
            Err(CryptoError::WrongRecoveryKey)
        ));
        assert!(matches!(
            parse_recovery_key("这不是密钥"),
            Err(CryptoError::WrongRecoveryKey)
        ));
    }

    #[test]
    fn passphrase_wrap_round_trips_and_rejects_wrong_passphrase() {
        let master = MasterKey::generate().expect("master");
        let blob = wrap_with_passphrase(&master, "my-passphrase").expect("wrap");
        assert_eq!(blob.kind, "passphrase");
        assert_eq!(blob.kdf, "argon2id");
        let opened = unwrap_with_passphrase(&blob, "my-passphrase").expect("unwrap");
        assert_eq!(opened.as_bytes(), master.as_bytes());
        assert!(matches!(
            unwrap_with_passphrase(&blob, "wrong-passphrase"),
            Err(CryptoError::WrongPassphrase)
        ));
        assert!(wrap_with_passphrase(&master, "123").is_err());
    }

    #[test]
    fn recovery_wrap_round_trips() {
        let master = MasterKey::generate().expect("master");
        let (_, secret) = generate_recovery_key().expect("recovery");
        let blob = wrap_with_recovery(&master, &secret).expect("wrap");
        assert_eq!(blob.kdf, "hkdf-sha256");
        let opened = unwrap_with_recovery(&blob, &secret).expect("unwrap");
        assert_eq!(opened.as_bytes(), master.as_bytes());
        let (_, other) = generate_recovery_key().expect("recovery");
        assert!(matches!(
            unwrap_with_recovery(&blob, &other),
            Err(CryptoError::WrongRecoveryKey)
        ));
    }

    #[test]
    fn key_file_create_wraps_both_paths_and_hides_plaintext_from_cloud() {
        let (file, display) = KeyFile::create(123, Some("passphrase-123")).expect("create");
        assert_eq!(file.version, 1);
        assert!(file.has_passphrase());
        let master = file.master_key().expect("master");
        assert_eq!(master.fingerprint(), file.fingerprint);
        assert_eq!(file.recovery_display().expect("display"), display);

        // 两条恢复路径都能解出同一把主密钥
        let by_pass = file
            .to_wrap_file()
            .unwrap_passphrase("passphrase-123")
            .expect("pass");
        let by_recovery = file.to_wrap_file().unwrap_recovery(&display).expect("recovery");
        assert_eq!(by_pass.as_bytes(), master.as_bytes());
        assert_eq!(by_recovery.as_bytes(), master.as_bytes());

        // 云端文件不含主密钥 / 恢复密钥明文
        let cloud = serde_json::to_string(&file.to_wrap_file()).expect("json");
        assert!(!cloud.contains(&file.key));
        assert!(!cloud.contains(&file.recovery));
        assert!(!cloud.contains(&master.to_base64()));

        // 指纹被篡改 → 拒绝加载
        let mut broken = file.clone();
        broken.fingerprint = "00000000".to_string();
        assert!(broken.master_key().is_err());
    }

    #[test]
    fn key_id_format_is_enforced() {
        let generated = random_key_id().expect("key id");
        assert!(is_valid_key_id(&generated), "{generated}");
        assert!(is_valid_key_id("k-0123456a"));
        assert!(!is_valid_key_id("k-0123456A"), "大写不接受");
        assert!(!is_valid_key_id("k-0123456"));
        assert!(!is_valid_key_id("k-012345678"));
        assert!(!is_valid_key_id("../.."));
        assert!(!is_valid_key_id(""), "空");
        assert!(!is_valid_key_id("k-../../x"));
    }

    #[test]
    fn key_file_without_passphrase_only_has_recovery_wrap() {
        let (file, _) = KeyFile::create(1, None).expect("create");
        assert!(!file.has_passphrase());
        assert_eq!(file.wraps.len(), 1);
        assert_eq!(file.wraps[0].kind, "recovery");
    }
}
