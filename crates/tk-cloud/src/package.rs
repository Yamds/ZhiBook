//! 云端加密包：组装（manifest + key.wrap + data.enc + 附件）与逐文件解密。
//!
//! - 附件未变化时**复用本地密文缓存**：密文字节完全一致 → git blob 不变 → 仓库不膨胀。
//! - `data.json` 先 deflate 再加密；AAD = `{keyId}:{逻辑路径}`。

use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use flate2::Compression;
use flate2::read::ZlibDecoder;
use flate2::write::ZlibEncoder;
use tk_backup::BackupData;
use tk_crypto::{NONCE_BYTES, WrapBlob, seal, open};

use crate::manifest::{
    ATTACHMENTS_PREFIX, CloudFileEntry, CloudManifest, DATA_PATH, KEY_WRAP_PATH, file_aad,
};
use crate::{CloudError, CloudResult, sha256_hex};

/// 组装结果里的单个文件。
#[derive(Debug, Clone)]
pub struct BuiltFile {
    pub path: String,
    pub bytes: Vec<u8>,
    pub nonce: [u8; NONCE_BYTES],
}

/// 组装好的云端包（全部在内存，交给 git 打包 / 上传）。
pub struct BuiltPackage {
    pub manifest: CloudManifest,
    pub files: Vec<BuiltFile>,
}

impl BuiltPackage {
    pub fn total_bytes(&self) -> usize {
        self.files.iter().map(|item| item.bytes.len()).sum()
    }

    pub fn file(&self, path: &str) -> Option<&BuiltFile> {
        self.files.iter().find(|item| item.path == path)
    }
}

/// 云端包组装器。
pub struct PackageBuilder<'a> {
    pub key_id: &'a str,
    pub key: &'a [u8; 32],
    /// 附件密文缓存目录（不存在会创建）。
    pub cache_dir: &'a Path,
    pub created_at_ms: i64,
}

impl<'a> PackageBuilder<'a> {
    pub fn new(key_id: &'a str, key: &'a [u8; 32], cache_dir: &'a Path, created_at_ms: i64) -> Self {
        Self {
            key_id,
            key,
            cache_dir,
            created_at_ms,
        }
    }

    /// 组装一份完整云端包。
    ///
    /// `attachments` 的元素是（数据库相对路径 `ledger/attachments/...`，明文内容）；
    /// `key_created_at_ms` 是主密钥生成时间（写进 `key.wrap.json`，不能用当前时间，
    /// 否则每次备份都会生成新 blob，历史仓库会膨胀）。
    pub fn build(
        &self,
        data: &BackupData,
        key_wraps: &[WrapBlob],
        key_created_at_ms: i64,
        attachments: &[(String, Vec<u8>)],
    ) -> CloudResult<BuiltPackage> {
        let mut files: Vec<BuiltFile> = Vec::with_capacity(attachments.len() + 2);
        let mut entries: Vec<CloudFileEntry> = Vec::with_capacity(attachments.len() + 2);

        // data.enc：内容不变时复用密文，避免无意义的提交膨胀。
        let data_plain = encode_data(data)?;
        let sealed = seal_cached(self.key, self.key_id, self.cache_dir, DATA_PATH, &data_plain)?;
        files.push(BuiltFile {
            path: DATA_PATH.to_string(),
            bytes: sealed.ciphertext.clone(),
            nonce: sealed.nonce,
        });
        entries.push(CloudFileEntry {
            path: DATA_PATH.to_string(),
            size: sealed.ciphertext.len() as i64,
            sha256: sha256_hex(&sealed.ciphertext),
            nonce: BASE64.encode(sealed.nonce),
        });

        // key.wrap.json：**明文 JSON**（只含口令 / 恢复密钥的包装，不含主密钥）。
        // 换机时它是唯一能拿到主密钥的入口，因此不能再用主密钥加密。
        let key_wrap_bytes = serde_json::to_vec_pretty(&tk_crypto::KeyWrapFile {
            version: 1,
            key_id: self.key_id.to_string(),
            fingerprint: tk_crypto::fingerprint_of(self.key),
            created_at_ms: key_created_at_ms,
            wraps: key_wraps.to_vec(),
        })?;
        files.push(BuiltFile {
            path: KEY_WRAP_PATH.to_string(),
            bytes: key_wrap_bytes.clone(),
            nonce: [0u8; NONCE_BYTES],
        });
        entries.push(CloudFileEntry {
            path: KEY_WRAP_PATH.to_string(),
            size: key_wrap_bytes.len() as i64,
            sha256: sha256_hex(&key_wrap_bytes),
            nonce: String::new(),
        });

        // 附件：复用密文缓存。
        for (db_path, plaintext) in attachments {
            let cloud_path = cloud_path_for_attachment(db_path).ok_or_else(|| {
                CloudError::State(format!("附件路径不在 attachments 下：{db_path}"))
            })?;
            let sealed = seal_cached(self.key, self.key_id, self.cache_dir, &cloud_path, plaintext)?;
            files.push(BuiltFile {
                path: cloud_path.clone(),
                bytes: sealed.ciphertext.clone(),
                nonce: sealed.nonce,
            });
            entries.push(CloudFileEntry {
                path: cloud_path,
                size: sealed.ciphertext.len() as i64,
                sha256: sha256_hex(&sealed.ciphertext),
                nonce: BASE64.encode(sealed.nonce),
            });
        }

        entries.sort_by(|left, right| left.path.cmp(&right.path));
        files.sort_by(|left, right| left.path.cmp(&right.path));
        let mut manifest = CloudManifest::new(self.key_id, tk_crypto::fingerprint_of(self.key), self.created_at_ms);
        manifest.files = entries;

        // manifest.json 自身也落进包（内容明文）。
        files.push(BuiltFile {
            path: crate::manifest::MANIFEST_PATH.to_string(),
            bytes: manifest.to_json()?,
            nonce: [0u8; NONCE_BYTES],
        });
        files.sort_by(|left, right| left.path.cmp(&right.path));
        Ok(BuiltPackage { manifest, files })
    }
}

/// 数据压缩 + JSON（供包组装与测试共用）。
pub fn encode_data(data: &BackupData) -> CloudResult<Vec<u8>> {
    let json = serde_json::to_vec(data)?;
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(&json)?;
    Ok(encoder.finish()?)
}

/// 解压 + JSON。
pub fn decode_data(plain: &[u8]) -> CloudResult<BackupData> {
    let mut decoder = ZlibDecoder::new(plain);
    let mut json = Vec::new();
    decoder.read_to_end(&mut json)?;
    Ok(serde_json::from_slice(&json)?)
}

/// 解密一个清单项。
pub fn decrypt_entry(
    key: &[u8; 32],
    key_id: &str,
    entry: &CloudFileEntry,
    ciphertext: &[u8],
) -> CloudResult<Vec<u8>> {
    let nonce_bytes = BASE64
        .decode(entry.nonce.trim())
        .map_err(|_| CloudError::Protocol("manifest 里的 nonce 不是 base64".to_string()))?;
    let nonce: [u8; NONCE_BYTES] = nonce_bytes
        .try_into()
        .map_err(|_| CloudError::Protocol("manifest 里的 nonce 长度不正确".to_string()))?;
    Ok(open(key, &file_aad(key_id, &entry.path), &nonce, ciphertext)?)
}

/// 校验密文与 manifest 的 sha256 一致（下载后立刻校验，损坏直接报错）。
pub fn verify_ciphertext(entry: &CloudFileEntry, ciphertext: &[u8]) -> CloudResult<()> {
    if sha256_hex(ciphertext) != entry.sha256 {
        return Err(CloudError::Protocol(format!(
            "{} 与 manifest 记录的校验值不一致（下载不完整或已被改动）",
            entry.path
        )));
    }
    Ok(())
}

/// 附件缓存：命中则直接复用旧密文（保证 git blob 稳定）。
///
/// 缓存键 = `sha256(path + NUL + 明文 sha256)`；加密 AAD 与 manifest 路径一致，
/// 所以复用缓存得到的密文一定可以用 [`decrypt_entry`] 解开。
fn seal_cached(
    key: &[u8; 32],
    key_id: &str,
    cache_dir: &Path,
    cloud_path: &str,
    plaintext: &[u8],
) -> CloudResult<tk_crypto::Sealed> {
    let plain_hash = sha256_hex(plaintext);
    let cache_key = sha256_hex(format!("{cloud_path}:{plain_hash}").as_bytes());
    let cache_path = cache_dir.join(format!("att-{cache_key}.bin"));
    if let Ok(bytes) = fs::read(&cache_path)
        && bytes.len() > NONCE_BYTES
    {
        let mut nonce = [0u8; NONCE_BYTES];
        nonce.copy_from_slice(&bytes[..NONCE_BYTES]);
        return Ok(tk_crypto::Sealed {
            nonce,
            ciphertext: bytes[NONCE_BYTES..].to_vec(),
        });
    }
    let sealed = seal(key, &file_aad(key_id, cloud_path), plaintext)?;
    fs::create_dir_all(cache_dir)?;
    let mut bytes = Vec::with_capacity(NONCE_BYTES + sealed.ciphertext.len());
    bytes.extend_from_slice(&sealed.nonce);
    bytes.extend_from_slice(&sealed.ciphertext);
    let temp_path = cache_path.with_extension("tmp");
    fs::write(&temp_path, &bytes)?;
    fs::rename(&temp_path, &cache_path)?;
    Ok(sealed)
}

/// 数据库附件路径 → 云端路径。
pub fn cloud_path_for_attachment(db_path: &str) -> Option<String> {
    let rest = db_path.strip_prefix("ledger/attachments/")?;
    Some(format!("{ATTACHMENTS_PREFIX}{rest}"))
}

/// 云端路径 → 数据库附件路径。
pub fn db_path_for_attachment(cloud_path: &str) -> Option<String> {
    let rest = cloud_path.strip_prefix(ATTACHMENTS_PREFIX)?;
    Some(format!("ledger/attachments/{rest}"))
}

/// 附件缓存目录的默认位置（`<tmp>/cloud-cache/<keyId>`）。
pub fn default_cache_dir(tmp_dir: &Path, key_id: &str) -> PathBuf {
    tmp_dir.join("cloud-cache").join(key_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tk_domain::{Book, Transaction};

    fn sample_data() -> BackupData {
        BackupData {
            books: vec![Book {
                id: "book_default".to_string(),
                name: "默认账本".to_string(),
                created_at_ms: 1,
                updated_at_ms: 1,
                sort_order: 0,
            }],
            accounts: vec![],
            categories: vec![],
            transactions: vec![Transaction {
                id: "tx_1".to_string(),
                book_id: "book_default".to_string(),
                kind: tk_domain::EntryKind::Expense,
                category_id: "expense_food".to_string(),
                account_id: None,
                amount_cents: 100,
                note: "早餐".to_string(),
                day: "2025-09-08".to_string(),
                month: "2025-09".to_string(),
                occurred_at_ms: 1,
                created_at_ms: 1,
                updated_at_ms: 1,
            }],
            attachments: vec![],
            recurring_rules: vec![],
            recurring_runs: vec![],
            tombstones: vec![],
            current_book_id: Some("book_default".to_string()),
        }
    }

    #[test]
    fn package_round_trips_with_attachment_cache() {
        let dir = tempfile::TempDir::new().expect("dir");
        let key = tk_crypto::MasterKey::generate().expect("key");
        let builder = PackageBuilder::new("k-test", key.as_bytes(), dir.path(), 123);
        let wraps = vec![WrapBlob {
            kind: "recovery".to_string(),
            kdf: "hkdf-sha256".to_string(),
            salt: "c2FsdA==".to_string(),
            nonce: "bm9uY2U=".to_string(),
            ciphertext: "Y3Q=".to_string(),
            m_kib: 0,
            iterations: 0,
            parallelism: 0,
        }];
        let attachments = vec![(
            "ledger/attachments/tx_1/att_1.png".to_string(),
            b"png-bytes".to_vec(),
        )];

        let first = builder
            .build(&sample_data(), &wraps, 123, &attachments)
            .expect("build");
        assert!(first.file(DATA_PATH).is_some());
        assert!(first.file(KEY_WRAP_PATH).is_some());
        assert_eq!(
            first.file("attachments/tx_1/att_1.png").map(|item| item.bytes.len()),
            Some(9 + 16)
        );
        assert_eq!(first.manifest.files.len(), 3);

        // 解密 data.enc
        let entry = first.manifest.find(DATA_PATH).expect("entry");
        let plain = decrypt_entry(key.as_bytes(), "k-test", entry, &first.file(DATA_PATH).expect("file").bytes)
            .expect("decrypt");
        let data = decode_data(&plain).expect("decode");
        assert_eq!(data.transactions.len(), 1);
        assert_eq!(data.transactions[0].note, "早餐");

        // 附件密文复用：第二次构建的附件密文应与第一次逐字节一致
        let second = builder
            .build(&sample_data(), &wraps, 123, &attachments)
            .expect("build again");
        assert_eq!(
            first.file("attachments/tx_1/att_1.png").expect("a").bytes,
            second.file("attachments/tx_1/att_1.png").expect("b").bytes
        );

        // 篡改检测
        let mut tampered = first.file(DATA_PATH).expect("file").bytes.clone();
        tampered[0] ^= 1;
        assert!(matches!(
            decrypt_entry(key.as_bytes(), "k-test", entry, &tampered),
            Err(CloudError::Crypto(_))
        ));
        // manifest 校验值
        assert!(verify_ciphertext(entry, &first.file(DATA_PATH).expect("file").bytes).is_ok());
        assert!(verify_ciphertext(entry, &tampered).is_err());
    }

    #[test]
    fn attachment_paths_map_both_ways() {
        assert_eq!(
            cloud_path_for_attachment("ledger/attachments/tx_1/att_2.jpg"),
            Some("attachments/tx_1/att_2.jpg".to_string())
        );
        assert_eq!(
            db_path_for_attachment("attachments/tx_1/att_2.jpg"),
            Some("ledger/attachments/tx_1/att_2.jpg".to_string())
        );
        assert_eq!(cloud_path_for_attachment("elsewhere/x"), None);
    }
}
