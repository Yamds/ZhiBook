//! 备份 / 恢复 / 合并的完整编排（P15.6）。
//!
//! - 配置与状态：`config/cloud-backup.json`（仓库 / Token / 上次提交 / 对象复用表）。
//! - 主密钥：`config/backup-key.json`（见 `tk-crypto`）。
//! - 备份：取远端 head →（远端前进时先拉取解密合并）→ 组装 / 加密 → pack → push。
//! - 恢复：下载 → 解密 → 预览 → 本地快照 → 覆盖式恢复 → 补齐附件。
//!
//! 本层只做流程，不依赖 Tauri；Tauri 命令只负责参数转换与把 [`HttpTransport`] 注入。

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tk_backup::{BackupData, counts_of};
use tk_config::{DataPaths, LocalConfigStore};
use tk_traits::ConfigStore;
use tk_crypto::{KeyFile, KeyWrapFile, MasterKey};
use tk_domain::{
    CloudBackupState, CloudBackupSummary, CloudConnectionInfo, CloudCreatedKey, CloudKeyInfo,
    CloudKeyInput, CloudRestorePreview, CloudRestoreSummary, MergeSummary,
};
use tk_ledger::{id::now_ms, Ledger};

use crate::client::{GitClient, GitCredentials, GitService};
use crate::git::{RepoUrl, TreeEntry, ZERO_ID, commit_bytes, object_id};
use crate::manifest::{
    ATTACHMENTS_PREFIX, CloudManifest, DATA_PATH, KEY_WRAP_PATH, MANIFEST_PATH,
};
use crate::package::{
    BuiltFile, PackageBuilder, db_path_for_attachment, decode_data, decrypt_entry,
    default_cache_dir, verify_ciphertext,
};
use crate::pack::{PackObject, PackObjectKind, write_pack};
use crate::transport::HttpTransport;
use crate::{CloudError, CloudResult, sha256_hex};

/// 配置文件 / 密钥文件名。
pub const CLOUD_CONFIG_FILE: &str = "cloud-backup.json";
pub const CLOUD_KEY_FILE: &str = "backup-key.json";
/// 默认备份分支。
pub const DEFAULT_BRANCH: &str = "backup";
/// 固定提交作者（脱敏）。
const COMMIT_AUTHOR: &str = "zhizhang-backup <backup@yamds.local>";
/// 固定提交信息（脱敏）。
const COMMIT_MESSAGE: &str = "backup\n";

// ---------------------------------------------------------------------------
// 本地配置与状态
// ---------------------------------------------------------------------------

/// 上次推送后服务端已有的对象（用于增量 pack 与「无变化不提交」判断）。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PushedFile {
    pub path: String,
    /// 密文 sha256（内容）。
    pub content_sha256: String,
    /// git blob id。
    pub blob_sha: String,
}

/// 本地云端备份配置与状态。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CloudConfig {
    #[serde(default)]
    pub version: i64,
    #[serde(default)]
    pub repo_url: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub token: String,
    #[serde(default)]
    pub branch: String,
    #[serde(default)]
    pub last_pushed_commit: Option<String>,
    #[serde(default)]
    pub last_backup_at_ms: Option<i64>,
    #[serde(default)]
    pub pushed_files: Vec<PushedFile>,
    /// 是否开启自动备份（用户开关，无时间设置）。
    #[serde(default)]
    pub auto_backup_enabled: bool,
    /// 最近一次自动备份的「逻辑日」（本地 05:00 起算的 YYYY-MM-DD）。
    #[serde(default)]
    pub last_auto_backup_day: Option<String>,
}

impl CloudConfig {
    pub fn branch(&self) -> &str {
        let branch = self.branch.trim();
        if branch.is_empty() {
            DEFAULT_BRANCH
        } else {
            branch
        }
    }

    pub fn is_configured(&self) -> bool {
        !self.repo_url.trim().is_empty() && !self.token.trim().is_empty()
    }
}

/// 云端备份服务。
pub struct CloudService {
    transport: Arc<dyn HttpTransport>,
    data_root: PathBuf,
    /// 备份互斥锁：自动备份与手动备份不会同时跑（同一时刻只允许一个备份任务）。
    backup_lock: Mutex<()>,
}

impl CloudService {
    pub fn new(transport: Arc<dyn HttpTransport>, data_root: impl Into<PathBuf>) -> Self {
        Self {
            transport,
            data_root: data_root.into(),
            backup_lock: Mutex::new(()),
        }
    }

    fn paths(&self) -> DataPaths {
        DataPaths::new(&self.data_root)
    }

    fn config_path(&self) -> PathBuf {
        self.paths().config_dir().join(CLOUD_CONFIG_FILE)
    }

    fn key_path(&self) -> PathBuf {
        self.paths().config_dir().join(CLOUD_KEY_FILE)
    }

    /// 读取配置（不存在返回默认值）。
    pub fn load_config(&self) -> CloudResult<CloudConfig> {
        let path = self.config_path();
        if !path.exists() {
            return Ok(CloudConfig {
                version: 1,
                branch: DEFAULT_BRANCH.to_string(),
                ..CloudConfig::default()
            });
        }
        let store = LocalConfigStore::new(&self.data_root);
        let value = store
            .read_json(&path)
            .map_err(|error| CloudError::State(error.to_string()))?;
        let mut config: CloudConfig = serde_json::from_value(value)?;
        config.version = 1;
        if config.branch.trim().is_empty() {
            config.branch = DEFAULT_BRANCH.to_string();
        }
        Ok(config)
    }

    fn persist_config(&self, config: &CloudConfig) -> CloudResult<()> {
        let store = LocalConfigStore::new(&self.data_root);
        let value = serde_json::to_value(config)?;
        store
            .write_json_atomic(&self.config_path(), &value)
            .map_err(|error| CloudError::State(error.to_string()))
    }

    /// 读取本机密钥。
    pub fn load_key(&self) -> CloudResult<Option<KeyFile>> {
        let path = self.key_path();
        if !path.exists() {
            return Ok(None);
        }
        let store = LocalConfigStore::new(&self.data_root);
        let value = store
            .read_json(&path)
            .map_err(|error| CloudError::State(error.to_string()))?;
        Ok(Some(serde_json::from_value(value)?))
    }

    fn save_key(&self, key: &KeyFile) -> CloudResult<()> {
        let store = LocalConfigStore::new(&self.data_root);
        let value = serde_json::to_value(key)?;
        store
            .write_json_atomic(&self.key_path(), &value)
            .map_err(|error| CloudError::State(error.to_string()))
    }

    fn cache_dir(&self, key_id: &str) -> PathBuf {
        default_cache_dir(&self.paths().tmp_dir(), key_id)
    }

    fn client<'a>(
        &'a self,
        config: &CloudConfig,
    ) -> CloudResult<GitClient<'a, dyn HttpTransport + 'a>> {
        let remote = RepoUrl::parse(&config.repo_url)?;
        let credentials = GitCredentials::new(config.username.clone(), config.token.clone());
        Ok(GitClient::new(
            self.transport.as_ref(),
            remote,
            credentials,
        ))
    }

    // -----------------------------------------------------------------------
    // 状态与配置
    // -----------------------------------------------------------------------

    /// 设置页状态。
    pub fn state(&self) -> CloudResult<CloudBackupState> {
        let config = self.load_config()?;
        let key = self.load_key()?;
        let server_kind = RepoUrl::parse(&config.repo_url)
            .map(|url| url.server_kind().as_str().to_string())
            .unwrap_or_default();
        Ok(CloudBackupState {
            configured: config.is_configured(),
            repo_url: config.repo_url.clone(),
            username: config.username.clone(),
            branch: config.branch().to_string(),
            server_kind,
            key: key.as_ref().map(|item| CloudKeyInfo {
                key_id: item.key_id.clone(),
                fingerprint: item.fingerprint.clone(),
                has_passphrase: item.has_passphrase(),
                created_at_ms: item.created_at_ms,
            }),
            last_backup_at_ms: config.last_backup_at_ms,
            last_commit: config.last_pushed_commit.clone(),
            auto_backup_enabled: config.auto_backup_enabled,
            last_auto_backup_day: config.last_auto_backup_day.clone(),
        })
    }

    /// 开关自动备份（写入 `config/cloud-backup.json`）。
    ///
    /// 开启要求已经配置仓库且已生成密钥；否则自动备份没有任何可执行的前提。
    /// 备份进行中不允许改开关（拿不到锁），避免与备份的配置写入互相覆盖。
    pub fn set_auto_backup(&self, enabled: bool) -> CloudResult<CloudBackupState> {
        let _guard = self.backup_lock.try_lock().map_err(|_| {
            CloudError::State("备份正在进行，请稍后再试".to_string())
        })?;
        let mut config = self.load_config()?;
        if enabled {
            if !config.is_configured() {
                return Err(CloudError::State(
                    "请先填写并保存仓库地址与 Token".to_string(),
                ));
            }
            if self.load_key()?.is_none() {
                return Err(CloudError::State("请先生成备份密钥".to_string()));
            }
        }
        config.auto_backup_enabled = enabled;
        self.persist_config(&config)?;
        self.state()
    }

    /// 自动备份入口：每个「逻辑日」（由调用方按本地 05:00 边界算好）最多执行一次。
    ///
    /// 返回 `Ok(None)` = 按规则跳过（未开启 / 未配置 / 无密钥 / 今天已跑 / 已有备份在跑）；
    /// 返回 `Ok(Some(_))` = 真的跑了一次备份。
    pub fn maybe_run_auto_backup(
        &self,
        day: &str,
        ledger: &Ledger,
    ) -> CloudResult<Option<CloudBackupSummary>> {
        let day = day.trim();
        if day.is_empty() {
            return Ok(None);
        }
        let config = self.load_config()?;
        if !config.auto_backup_enabled || !config.is_configured() {
            return Ok(None);
        }
        if config.last_auto_backup_day.as_deref() == Some(day) {
            return Ok(None);
        }
        if self.load_key()?.is_none() {
            return Ok(None);
        }
        // 手动备份正在跑：自动备份让路，等下次回前台再补。
        let Ok(_guard) = self.backup_lock.try_lock() else {
            return Ok(None);
        };
        // 拿到锁后再确认一次，避免并发触发重复执行。
        let config = self.load_config()?;
        if !config.auto_backup_enabled || config.last_auto_backup_day.as_deref() == Some(day) {
            return Ok(None);
        }

        let summary = self.run_backup_locked(ledger)?;
        // 成功了才记这一天：失败时下次回前台还会重试。
        let mut config = self.load_config()?;
        config.last_auto_backup_day = Some(day.to_string());
        self.persist_config(&config)?;
        Ok(Some(summary))
    }

    /// 保存仓库配置并测试连接（不覆盖已保存的其它字段）。
    pub fn save_config(
        &self,
        repo_url: &str,
        username: &str,
        token: &str,
        branch: &str,
    ) -> CloudResult<CloudConnectionInfo> {
        let repo = RepoUrl::parse(repo_url)?;
        if token.trim().is_empty() {
            return Err(CloudError::State("请填写访问 Token".to_string()));
        }
        let branch = if branch.trim().is_empty() {
            DEFAULT_BRANCH.to_string()
        } else {
            branch.trim().to_string()
        };
        let mut config = self.load_config()?;
        config.version = 1;
        config.repo_url = format!("{}{}.git", repo.base(), repo.path);
        config.username = username.trim().to_string();
        config.token = token.trim().to_string();
        config.branch = branch;
        // 换了仓库 / 分支 → 旧的对象复用表作废。
        config.last_pushed_commit = None;
        config.pushed_files.clear();
        let info = self.probe(&config)?;
        self.persist_config(&config)?;
        Ok(info)
    }

    /// 测试当前配置（不落盘）。
    pub fn test_connection(&self) -> CloudResult<CloudConnectionInfo> {
        let config = self.load_config()?;
        self.probe(&config)
    }

    fn probe(&self, config: &CloudConfig) -> CloudResult<CloudConnectionInfo> {
        let client = self.client(config)?;
        let branch = config.branch().to_string();
        let refs = client.fetch_refs(GitService::ReceivePack)?;
        let head = refs.head_of(&branch).map(|item| item.to_string());
        let mut backup_ready = false;
        if head.is_some() {
            // 分支已存在：必须能读到我们自己的 manifest，避免把别人的分支当成备份分支。
            match client.download_raw(&branch, MANIFEST_PATH) {
                Ok(manifest_bytes) => backup_ready = CloudManifest::from_json(&manifest_bytes).is_ok(),
                Err(CloudError::NotFound) => backup_ready = false,
                Err(error) => return Err(error),
            }
        }
        Ok(CloudConnectionInfo {
            server_kind: RepoUrl::parse(&config.repo_url)
                .map(|url| url.server_kind().as_str().to_string())
                .unwrap_or_default(),
            branch_exists: head.is_some(),
            head,
            backup_ready,
        })
    }

    /// 断开：清配置；`remove_key` 时连同密钥与密文缓存一起删除。
    pub fn disconnect(&self, remove_key: bool) -> CloudResult<()> {
        if remove_key && let Some(key) = self.load_key()? {
            let cache = self.cache_dir(&key.key_id);
            if cache.exists() {
                fs::remove_dir_all(&cache)?;
            }
            let path = self.key_path();
            if path.exists() {
                fs::remove_file(&path)?;
            }
        }
        let store = LocalConfigStore::new(&self.data_root);
        let path = self.config_path();
        if path.exists() {
            store
                .read_json(&path)
                .map_err(|error| CloudError::State(error.to_string()))?;
            fs::remove_file(&path)?;
        }
        Ok(())
    }

    // -----------------------------------------------------------------------
    // 密钥管理
    // -----------------------------------------------------------------------

    /// 生成主密钥（已存在则报错；口令可选）。
    pub fn create_key(&self, passphrase: Option<&str>) -> CloudResult<CloudCreatedKey> {
        if self.load_key()?.is_some() {
            return Err(CloudError::State(
                "本机已经有备份密钥；如需更换请先断开云端备份".to_string(),
            ));
        }
        let (file, recovery_key) = KeyFile::create(now_ms(), passphrase)?;
        self.save_key(&file)?;
        Ok(CloudCreatedKey {
            recovery_key,
            key: CloudKeyInfo {
                key_id: file.key_id.clone(),
                fingerprint: file.fingerprint.clone(),
                has_passphrase: file.has_passphrase(),
                created_at_ms: file.created_at_ms,
            },
        })
    }

    /// 查看恢复密钥（需 PIN 由前端负责；这里只要求本机存在密钥）。
    pub fn view_recovery_key(&self) -> CloudResult<String> {
        let key = self
            .load_key()?
            .ok_or_else(|| CloudError::State("尚未生成备份密钥".to_string()))?;
        key.recovery_display()
            .ok_or_else(|| CloudError::State("密钥文件里没有可用的恢复密钥".to_string()))
    }

    /// 设置 / 更新口令包装。
    pub fn set_passphrase(&self, passphrase: &str) -> CloudResult<CloudKeyInfo> {
        let mut key = self
            .load_key()?
            .ok_or_else(|| CloudError::State("尚未生成备份密钥".to_string()))?;
        let master = key.master_key()?;
        key.set_passphrase(&master, passphrase)?;
        self.save_key(&key)?;
        Ok(CloudKeyInfo {
            key_id: key.key_id.clone(),
            fingerprint: key.fingerprint.clone(),
            has_passphrase: key.has_passphrase(),
            created_at_ms: key.created_at_ms,
        })
    }

    /// 移除口令包装（恢复密钥仍可用）。
    pub fn clear_passphrase(&self) -> CloudResult<CloudKeyInfo> {
        let mut key = self
            .load_key()?
            .ok_or_else(|| CloudError::State("尚未生成备份密钥".to_string()))?;
        key.remove_passphrase();
        self.save_key(&key)?;
        Ok(CloudKeyInfo {
            key_id: key.key_id.clone(),
            fingerprint: key.fingerprint.clone(),
            has_passphrase: key.has_passphrase(),
            created_at_ms: key.created_at_ms,
        })
    }

    // -----------------------------------------------------------------------
    // 备份
    // -----------------------------------------------------------------------

    /// 执行一次备份（必要时先合并另一台设备的提交）。
    /// 手动备份：拿不到锁说明已有备份在跑，直接报错给用户。
    pub fn run_backup(&self, ledger: &Ledger) -> CloudResult<CloudBackupSummary> {
        let _guard = self.backup_lock.try_lock().map_err(|_| {
            CloudError::State("已有备份任务正在执行，请稍后再试".to_string())
        })?;
        self.run_backup_locked(ledger)
    }

    fn run_backup_locked(&self, ledger: &Ledger) -> CloudResult<CloudBackupSummary> {
        let mut config = self.load_config()?;
        if !config.is_configured() {
            return Err(CloudError::State(
                "请先填写仓库地址与 Token 并保存".to_string(),
            ));
        }
        let key_file = self
            .load_key()?
            .ok_or_else(|| CloudError::State("尚未生成备份密钥".to_string()))?;
        let master = key_file.master_key()?;
        let branch = config.branch().to_string();
        let client = self.client(&config)?;

        let refs = client.fetch_refs(GitService::ReceivePack)?;
        let remote_head = refs.head_of(&branch).map(|item| item.to_string());

        let mut known: HashMap<String, PushedFile> = HashMap::new();
        let mut merged: Option<MergeSummary> = None;
        if let Some(head) = remote_head.clone() {
            // 分支安全校验：必须能读到我们的 manifest。
            let manifest_bytes = client.download_raw(&branch, MANIFEST_PATH).map_err(|error| match error {
                CloudError::NotFound => CloudError::State(format!(
                    "远端分支 {branch} 不是制账的备份分支（读不到 manifest.json）；请换一个分支或清空该分支"
                )),
                other => other,
            })?;
            let manifest = CloudManifest::from_json(&manifest_bytes)?;
            if manifest.fingerprint != key_file.fingerprint {
                return Err(CloudError::State(
                    "云端备份使用了另一把密钥（可能来自其它设备）：请先执行「从云端恢复」导入那把密钥"
                        .to_string(),
                ));
            }
            let remote_advanced = config
                .last_pushed_commit
                .as_deref()
                .map(|last| last != head)
                .unwrap_or(true);
            if remote_advanced {
                let temp = self.make_pull_dir()?;
                let pulled = self.download_package(&client, &branch, &manifest, &master, &temp)?;
                let summary = tk_backup::merge_into(
                    ledger,
                    &self.data_root,
                    &pulled.data,
                    Some(&temp),
                )?;
                for file in &pulled.files {
                    known.insert(file.path.clone(), file.clone());
                }
                merged = Some(summary);
            } else {
                for file in &config.pushed_files {
                    known.insert(file.path.clone(), file.clone());
                }
            }
        }

        // 组装本机包。
        let data = tk_backup::gather_data(ledger)?;
        let attachments = self.read_local_attachments(&data)?;
        let attachments_missing = attachments.missing;
        let created_at = now_ms();
        let built = PackageBuilder::new(
            &key_file.key_id,
            master.as_bytes(),
            &self.cache_dir(&key_file.key_id),
            created_at,
        )
        .build(&data, &key_file.wraps, key_file.created_at_ms, &attachments.files)?;

        // 内容没变且远端就是我们上次推的提交 → 不产生新提交。
        if merged.is_none()
            && remote_head.is_some()
            && remote_head.as_deref() == config.last_pushed_commit.as_deref()
            && self.package_unchanged(&built.files, &known)
        {
            config.last_backup_at_ms = Some(created_at);
            self.persist_config(&config)?;
            return Ok(CloudBackupSummary {
                pushed: false,
                commit: remote_head,
                merged: None,
                uploaded_bytes: 0,
                file_count: built.files.len() as i64,
                backed_up_at_ms: created_at,
                attachments_missing,
            });
        }

        // 生成提交与 pack（先增量；被服务器拒绝时退回全量对象）。
        let timestamp_secs = created_at / 1000;
        let mut graph = build_object_graph(
            &built.files,
            &known,
            remote_head.as_deref(),
            timestamp_secs,
            false,
        )?;
        let mut pack = write_pack(&graph.objects)?;
        let mut report = client.push(
            &branch,
            remote_head.as_deref().unwrap_or(ZERO_ID),
            &graph.commit,
            &pack,
        );
        if let Err(CloudError::PushRejected(reason)) = &report {
            // 服务器缺对象（复用表过期 / 状态丢失）→ 全量重推一次。
            if reason.contains("missing") || reason.contains("unpack") {
                graph = build_object_graph(
                    &built.files,
                    &known,
                    remote_head.as_deref(),
                    timestamp_secs,
                    true,
                )?;
                pack = write_pack(&graph.objects)?;
                report = client.push(
                    &branch,
                    remote_head.as_deref().unwrap_or(ZERO_ID),
                    &graph.commit,
                    &pack,
                );
            }
        }
        let _ = report?;

        config.last_pushed_commit = Some(graph.commit.clone());
        config.last_backup_at_ms = Some(created_at);
        config.pushed_files = graph.pushed_files;
        self.persist_config(&config)?;

        Ok(CloudBackupSummary {
            pushed: true,
            commit: Some(graph.commit),
            merged,
            uploaded_bytes: pack.len() as i64,
            file_count: built.files.len() as i64,
            backed_up_at_ms: created_at,
            attachments_missing,
        })
    }

    fn make_pull_dir(&self) -> CloudResult<PathBuf> {
        let dir = self.paths().tmp_dir().join(format!("cloud-pull-{}", now_ms()));
        fs::create_dir_all(&dir)?;
        Ok(dir)
    }

    fn package_unchanged(&self, files: &[BuiltFile], known: &HashMap<String, PushedFile>) -> bool {
        files.iter().all(|file| {
            if file.path == MANIFEST_PATH {
                // manifest 的时间戳每次都会变（不影响历史），内容变化由其它文件体现。
                return true;
            }
            known
                .get(&file.path)
                .map(|item| item.content_sha256 == sha256_hex(&file.bytes))
                .unwrap_or(false)
        })
    }

    /// 读出全部附件明文（数据库里有记录但文件缺失的记数跳过）。
    fn read_local_attachments(&self, data: &BackupData) -> CloudResult<LocalAttachments> {
        let mut files = Vec::with_capacity(data.attachments.len());
        let mut missing = 0i64;
        for attachment in &data.attachments {
            match fs::read(self.data_root.join(&attachment.path)) {
                Ok(bytes) => files.push((attachment.path.clone(), bytes)),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                    missing += 1;
                }
                Err(error) => return Err(CloudError::Io(error)),
            }
        }
        Ok(LocalAttachments { files, missing })
    }

    /// 下载远端包（manifest 已给出；含 data.enc 与全部附件），供合并使用。
    fn download_package(
        &self,
        client: &GitClient<'_, dyn HttpTransport + '_>,
        branch: &str,
        manifest: &CloudManifest,
        master: &MasterKey,
        temp_root: &Path,
    ) -> CloudResult<PulledPackage> {
        let entry = manifest
            .find(DATA_PATH)
            .ok_or_else(|| CloudError::Protocol("云端包缺少 data.enc".to_string()))?;
        let ciphertext = client.download_raw(branch, DATA_PATH)?;
        verify_ciphertext(entry, &ciphertext)?;
        let plain = decrypt_entry(master.as_bytes(), &manifest.key_id, entry, &ciphertext)?;
        let data = decode_data(&plain)?;

        let mut files = vec![PushedFile {
            path: DATA_PATH.to_string(),
            content_sha256: sha256_hex(&ciphertext),
            blob_sha: object_id("blob", &ciphertext),
        }];
        for file_entry in &manifest.files {
            if file_entry.path == DATA_PATH {
                continue;
            }
            if !file_entry.path.starts_with(ATTACHMENTS_PREFIX) {
                continue;
            }
            let ciphertext = client.download_raw(branch, &file_entry.path)?;
            verify_ciphertext(file_entry, &ciphertext)?;
            let plain = decrypt_entry(master.as_bytes(), &manifest.key_id, file_entry, &ciphertext)?;
            let target = temp_root.join(&file_entry.path);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::write(&target, &plain)?;
            files.push(PushedFile {
                path: file_entry.path.clone(),
                content_sha256: sha256_hex(&ciphertext),
                blob_sha: object_id("blob", &ciphertext),
            });
        }
        Ok(PulledPackage { data, files })
    }

    // -----------------------------------------------------------------------
    // 恢复
    // -----------------------------------------------------------------------

    /// 预览云端备份；本机没有对应密钥且未提供 `key_input` 时返回 `needsKey`。
    pub fn preview_restore(
        &self,
        key_input: Option<&CloudKeyInput>,
    ) -> CloudResult<CloudRestorePreview> {
        let config = self.load_config()?;
        if !config.is_configured() {
            return Err(CloudError::State(
                "请先填写仓库地址与 Token 并保存".to_string(),
            ));
        }
        let client = self.client(&config)?;
        let branch = config.branch().to_string();
        let refs = client.fetch_refs(GitService::UploadPack)?;
        if refs.head_of(&branch).is_none() {
            return Err(CloudError::State("云端还没有备份".to_string()));
        }
        let manifest_bytes = client.download_raw(&branch, MANIFEST_PATH)?;
        let manifest = CloudManifest::from_json(&manifest_bytes)?;

        let local_matches = self
            .load_key()?
            .map(|item| {
                item.key_id == manifest.key_id && item.fingerprint == manifest.fingerprint
            })
            .unwrap_or(false);
        if !local_matches && key_input.is_none() {
            // 元数据预览：只告诉前端「需要解锁」。
            let has_passphrase = client
                .download_raw(&branch, KEY_WRAP_PATH)
                .ok()
                .and_then(|bytes| serde_json::from_slice::<KeyWrapFile>(&bytes).ok())
                .filter(|file| {
                    file.key_id == manifest.key_id && file.fingerprint == manifest.fingerprint
                })
                .map(|file| file.has_passphrase())
                .unwrap_or(false);
            return Ok(CloudRestorePreview {
                key_id: manifest.key_id.clone(),
                fingerprint: manifest.fingerprint.clone(),
                created_at_ms: manifest.created_at_ms,
                needs_key: true,
                has_passphrase,
                counts: None,
                from_local_key: false,
            });
        }

        let (master, from_local_key, _) =
            self.resolve_key(&client, &branch, &manifest, key_input)?;
        let entry = manifest
            .find(DATA_PATH)
            .ok_or_else(|| CloudError::Protocol("云端包缺少 data.enc".to_string()))?;
        let ciphertext = client.download_raw(&branch, DATA_PATH)?;
        verify_ciphertext(entry, &ciphertext)?;
        let plain = decrypt_entry(master.as_bytes(), &manifest.key_id, entry, &ciphertext)?;
        let data = decode_data(&plain)?;

        Ok(CloudRestorePreview {
            key_id: manifest.key_id.clone(),
            fingerprint: manifest.fingerprint.clone(),
            created_at_ms: manifest.created_at_ms,
            needs_key: false,
            has_passphrase: true,
            counts: Some(counts_of(&data)),
            from_local_key,
        })
    }

    /// 覆盖式恢复（先自动快照；密钥在确认后才落盘）。
    pub fn run_restore(
        &self,
        key_input: Option<&CloudKeyInput>,
        ledger: &Ledger,
    ) -> CloudResult<CloudRestoreSummary> {
        let config = self.load_config()?;
        if !config.is_configured() {
            return Err(CloudError::State(
                "请先填写仓库地址与 Token 并保存".to_string(),
            ));
        }
        let client = self.client(&config)?;
        let branch = config.branch().to_string();
        let refs = client.fetch_refs(GitService::UploadPack)?;
        if refs.head_of(&branch).is_none() {
            return Err(CloudError::State("云端还没有备份".to_string()));
        }
        let manifest_bytes = client.download_raw(&branch, MANIFEST_PATH)?;
        let manifest = CloudManifest::from_json(&manifest_bytes)?;
        let (master, from_local_key, pending_key) =
            self.resolve_key(&client, &branch, &manifest, key_input)?;

        let entry = manifest
            .find(DATA_PATH)
            .ok_or_else(|| CloudError::Protocol("云端包缺少 data.enc".to_string()))?;
        let ciphertext = client.download_raw(&branch, DATA_PATH)?;
        verify_ciphertext(entry, &ciphertext)?;
        let plain = decrypt_entry(master.as_bytes(), &manifest.key_id, entry, &ciphertext)?;
        let data = decode_data(&plain)?;
        if data.books.is_empty() {
            return Err(CloudError::State("云端备份里没有任何账本".to_string()));
        }
        let counts = counts_of(&data);

        // 恢复前快照（失败不阻断恢复，但会在结果里为空）。
        let pre_import_backup_path = tk_backup::export_to_zip(ledger, &self.data_root)
            .ok()
            .map(|item| item.path);

        tk_backup::restore_from_data(ledger, &data)?;

        // 附件：逐个下载解密落盘；单个失败只记数，不中断恢复。
        let mut attachments_failed = 0i64;
        for file_entry in &manifest.files {
            if !file_entry.path.starts_with(ATTACHMENTS_PREFIX) {
                continue;
            }
            let Some(db_path) = db_path_for_attachment(&file_entry.path) else {
                attachments_failed += 1;
                continue;
            };
            let Ok(ciphertext) = client.download_raw(&branch, &file_entry.path) else {
                attachments_failed += 1;
                continue;
            };
            if verify_ciphertext(file_entry, &ciphertext).is_err() {
                attachments_failed += 1;
                continue;
            }
            let Ok(plain) =
                decrypt_entry(master.as_bytes(), &manifest.key_id, file_entry, &ciphertext)
            else {
                attachments_failed += 1;
                continue;
            };
            let target = self.data_root.join(&db_path);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)?;
            }
            if fs::write(&target, &plain).is_err() {
                attachments_failed += 1;
            }
        }

        // 恢复成功后把云端密钥落到本机（换机场景）。
        let key_imported = !from_local_key;
        if let Some(key) = pending_key {
            self.save_key(&key)?;
        }

        let mut config = self.load_config()?;
        config.last_backup_at_ms = Some(now_ms());
        self.persist_config(&config)?;

        Ok(CloudRestoreSummary {
            counts,
            pre_import_backup_path,
            attachments_failed,
            key_imported,
        })
    }

    /// 选择用于解密的密钥：本机同 id 直接用；否则要求输入口令 / 恢复密钥。
    fn resolve_key(
        &self,
        client: &GitClient<'_, dyn HttpTransport + '_>,
        branch: &str,
        manifest: &CloudManifest,
        key_input: Option<&CloudKeyInput>,
    ) -> CloudResult<(MasterKey, bool, Option<KeyFile>)> {
        if let Some(local) = self.load_key()?
            && local.key_id == manifest.key_id
            && local.fingerprint == manifest.fingerprint
        {
            return Ok((local.master_key()?, true, None));
        }
        let Some(input) = key_input else {
            return Err(CloudError::State(
                "本机没有这把云端密钥，请先用口令或恢复密钥解锁".to_string(),
            ));
        };
        // key.wrap.json 是明文 JSON（只含包装），换机时直接解析。
        let wrap_bytes = client.download_raw(branch, KEY_WRAP_PATH)?;
        let key_entry = manifest
            .find(KEY_WRAP_PATH)
            .ok_or_else(|| CloudError::Protocol("云端包缺少 key.wrap.json".to_string()))?;
        verify_ciphertext(key_entry, &wrap_bytes)?;
        let wrap_file: KeyWrapFile = serde_json::from_slice(&wrap_bytes)?;
        if wrap_file.key_id != manifest.key_id || wrap_file.fingerprint != manifest.fingerprint {
            return Err(CloudError::Protocol(
                "云端密钥文件与 manifest 不一致，拒绝使用".to_string(),
            ));
        }
        let master = match input.kind.as_str() {
            "passphrase" => wrap_file.unwrap_passphrase(&input.value)?,
            "recovery" => wrap_file.unwrap_recovery(&input.value)?,
            other => {
                return Err(CloudError::State(format!("不支持的密钥解锁方式：{other}")));
            }
        };
        if master.fingerprint() != manifest.fingerprint {
            return Err(CloudError::State("解出的密钥与云端指纹不一致".to_string()));
        }
        // 换机时把云端密钥导入本机（保留原始包装，便于再次恢复）。
        let imported = KeyFile {
            version: 1,
            key_id: wrap_file.key_id.clone(),
            fingerprint: wrap_file.fingerprint.clone(),
            created_at_ms: wrap_file.created_at_ms,
            key: master.to_base64(),
            recovery: String::new(),
            wraps: wrap_file.wraps.clone(),
        };
        Ok((master, false, Some(imported)))
    }
}

/// 本地附件明文与缺失计数。
struct LocalAttachments {
    files: Vec<(String, Vec<u8>)>,
    missing: i64,
}

/// 拉取结果。
struct PulledPackage {
    data: BackupData,
    files: Vec<PushedFile>,
}

/// 对象图：commit + 需要上传的对象 + 全量对象复用表。
struct ObjectGraph {
    commit: String,
    objects: Vec<PackObject>,
    pushed_files: Vec<PushedFile>,
}

/// 构建「blob（增量）+ tree + commit」对象图。
///
/// - `known`：服务端已有的文件（路径 → 内容 sha / blob sha）；内容一致时跳过 blob。
/// - `include_all_blobs`：服务器缺对象时的全量回退。
/// - `parent`：远端 head（保证快进推送；空仓库为 `None`）。
fn build_object_graph(
    files: &[BuiltFile],
    known: &HashMap<String, PushedFile>,
    parent: Option<&str>,
    timestamp: i64,
    include_all_blobs: bool,
) -> CloudResult<ObjectGraph> {
    let mut objects: Vec<PackObject> = Vec::new();
    let mut pushed_files: Vec<PushedFile> = Vec::with_capacity(files.len());
    let mut flat: Vec<(String, String)> = Vec::with_capacity(files.len());

    for file in files {
        let blob_sha = object_id("blob", &file.bytes);
        let content_sha = sha256_hex(&file.bytes);
        let reuse = !include_all_blobs
            && known
                .get(&file.path)
                .map(|item| item.blob_sha == blob_sha)
                .unwrap_or(false);
        if !reuse {
            objects.push(PackObject {
                kind: PackObjectKind::Blob,
                data: file.bytes.clone(),
            });
        }
        pushed_files.push(PushedFile {
            path: file.path.clone(),
            content_sha256: content_sha,
            blob_sha: blob_sha.clone(),
        });
        flat.push((file.path.clone(), blob_sha));
    }

    // 目录树：根 + 任意深度的子目录（当前只有 attachments/<tx>/...）。
    let (tree_id, mut tree_objects) = build_tree(&flat, "")?;
    objects.append(&mut tree_objects);

    let commit_data = commit_bytes(
        &tree_id,
        parent.map(|item| vec![item.to_string()]).unwrap_or_default().as_slice(),
        COMMIT_AUTHOR,
        timestamp,
        COMMIT_MESSAGE,
    );
    let commit = object_id("commit", &commit_data);
    objects.push(PackObject {
        kind: PackObjectKind::Commit,
        data: commit_data,
    });

    Ok(ObjectGraph {
        commit,
        objects,
        pushed_files,
    })
}

/// 递归构建目录树：输入扁平「相对路径 → blob id」，输出（tree id，需要上传的 tree 对象）。
fn build_tree(files: &[(String, String)], prefix: &str) -> CloudResult<(String, Vec<PackObject>)> {
    let mut entries: Vec<TreeEntry> = Vec::new();
    let mut objects: Vec<PackObject> = Vec::new();
    let mut subdirs: Vec<String> = Vec::new();

    for (path, blob) in files {
        let relative = match prefix.is_empty() {
            true => path.as_str(),
            false => match path.strip_prefix(&format!("{prefix}/")) {
                Some(rest) => rest,
                None => continue,
            },
        };
        match relative.split_once('/') {
            Some((dir, _)) => {
                if !subdirs.iter().any(|item| item == dir) {
                    subdirs.push(dir.to_string());
                }
            }
            None => {
                entries.push(TreeEntry {
                    mode: "100644".to_string(),
                    name: relative.to_string(),
                    id: blob.clone(),
                });
            }
        }
    }

    for dir in subdirs {
        let sub_prefix = match prefix.is_empty() {
            true => dir.clone(),
            false => format!("{prefix}/{dir}"),
        };
        let (sub_id, mut sub_objects) = build_tree(files, &sub_prefix)?;
        objects.append(&mut sub_objects);
        entries.push(TreeEntry {
            mode: "40000".to_string(),
            name: dir,
            id: sub_id,
        });
    }

    let data = crate::git::tree_bytes(&entries);
    let id = object_id("tree", &data);
    objects.insert(
        0,
        PackObject {
            kind: PackObjectKind::Tree,
            data,
        },
    );
    Ok((id, objects))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::client::GitCredentials;
    use crate::git::verify_pack_with_git;
    use crate::pktline;
    use crate::transport::{HttpResponse, MockTransport};
    use tk_crypto::NONCE_BYTES;

    fn sample_files() -> Vec<BuiltFile> {
        vec![
            BuiltFile {
                path: MANIFEST_PATH.to_string(),
                bytes: b"{\"format\":\"x\"}".to_vec(),
                nonce: [0u8; NONCE_BYTES],
            },
            BuiltFile {
                path: DATA_PATH.to_string(),
                bytes: vec![1, 2, 3, 4],
                nonce: [0u8; NONCE_BYTES],
            },
            BuiltFile {
                path: "attachments/tx_1/a.png".to_string(),
                bytes: vec![9, 9, 9],
                nonce: [0u8; NONCE_BYTES],
            },
            BuiltFile {
                path: "attachments/tx_2/b.png".to_string(),
                bytes: vec![7],
                nonce: [0u8; NONCE_BYTES],
            },
        ]
    }

    #[test]
    fn object_graph_pack_is_valid_and_incremental() {
        let files = sample_files();
        let known = HashMap::new();
        let graph = build_object_graph(&files, &known, None, 100, false).expect("graph");
        assert_eq!(graph.pushed_files.len(), 4);
        assert_eq!(
            graph
                .objects
                .iter()
                .filter(|item| item.kind == PackObjectKind::Blob)
                .count(),
            4
        );
        assert_eq!(
            graph
                .objects
                .iter()
                .filter(|item| item.kind == PackObjectKind::Tree)
                .count(),
            4,
            "根 + attachments + 两个账单目录"
        );
        assert_eq!(
            graph
                .objects
                .iter()
                .filter(|item| item.kind == PackObjectKind::Commit)
                .count(),
            1
        );
        let pack = write_pack(&graph.objects).expect("pack");
        let expected: Vec<(&str, &[u8])> = files
            .iter()
            .map(|file| ("blob", file.bytes.as_slice()))
            .collect();
        verify_pack_with_git(&pack, &expected).expect("git 应接受我们的 pack");

        // 第二次：known 命中 → 只打 tree + commit。
        let known: HashMap<String, PushedFile> = graph
            .pushed_files
            .iter()
            .map(|item| (item.path.clone(), item.clone()))
            .collect();
        let graph2 = build_object_graph(&files, &known, Some(&graph.commit), 200, false).expect("graph");
        assert_eq!(
            graph2
                .objects
                .iter()
                .filter(|item| item.kind == PackObjectKind::Blob)
                .count(),
            0
        );
        assert_eq!(graph2.objects.len(), 5, "4 个 tree + 1 个 commit");

        // 全量回退：内容一样但强制带全部 blob。
        let graph3 = build_object_graph(&files, &known, None, 300, true).expect("graph");
        assert_eq!(
            graph3
                .objects
                .iter()
                .filter(|item| item.kind == PackObjectKind::Blob)
                .count(),
            4
        );
    }

    #[test]
    fn config_and_key_state_round_trip() {
        let dir = tempfile::TempDir::new().expect("dir");
        let transport = Arc::new(MockTransport::default());
        // 空仓库：只有 flush 的 refs 广告
        let mut advertisement = pktline::encode("# service=git-receive-pack\n");
        advertisement.extend_from_slice(pktline::FLUSH);
        advertisement.extend_from_slice(pktline::FLUSH);
        transport.push(
            "/info/refs?service=git-receive-pack",
            HttpResponse {
                status: 200,
                headers: vec![],
                body: advertisement,
            },
        );

        let service = CloudService::new(transport, dir.path());
        assert!(!service.state().expect("state").configured);
        assert!(service.create_key(None).is_ok());
        assert!(service.create_key(None).is_err(), "不能重复生成密钥");

        let state = service.state().expect("state");
        let key = state.key.expect("key");
        assert!(!key.has_passphrase);
        let recovery = service.view_recovery_key().expect("recovery");
        assert!(recovery.contains('-'), "{recovery}");

        service.set_passphrase("passphrase-123").expect("pass");
        assert!(service.state().expect("state").key.expect("key").has_passphrase);
        service.clear_passphrase().expect("clear");
        assert!(!service.state().expect("state").key.expect("key").has_passphrase);

        let info = service
            .save_config("https://git.example.com/Yamds/Book", "Yamds", "token", "")
            .expect("save");
        assert!(!info.branch_exists);
        let state = service.state().expect("state");
        assert!(state.configured);
        assert_eq!(state.branch, "backup");
        assert_eq!(state.repo_url, "https://git.example.com/Yamds/Book.git");

        // 自动备份开关：已配置 + 已有密钥时可以开、可以关，缺一不可
        assert!(!service.state().expect("state").auto_backup_enabled);
        service.set_auto_backup(true).expect("enable auto backup");
        assert!(service.state().expect("state").auto_backup_enabled);
        service.set_auto_backup(false).expect("disable auto backup");
        assert!(!service.state().expect("state").auto_backup_enabled);

        service.disconnect(true).expect("disconnect");
        let state = service.state().expect("state");
        assert!(!state.configured);
        assert!(state.key.is_none());
        assert!(service.load_key().expect("load").is_none());
    }

    #[test]
    fn no_change_detection_uses_content_hashes() {
        let dir = tempfile::TempDir::new().expect("dir");
        let service = CloudService::new(Arc::new(MockTransport::default()), dir.path());
        let files = sample_files();
        let known: HashMap<String, PushedFile> = files
            .iter()
            .filter(|file| file.path != MANIFEST_PATH)
            .map(|file| {
                (
                    file.path.clone(),
                    PushedFile {
                        path: file.path.clone(),
                        content_sha256: sha256_hex(&file.bytes),
                        blob_sha: object_id("blob", &file.bytes),
                    },
                )
            })
            .collect();
        assert!(service.package_unchanged(&files, &known));
        let mut changed = files.clone();
        changed[1].bytes.push(1);
        // manifest 变化不影响；data.enc 变化必须被发现
        assert!(!service.package_unchanged(&changed, &known));
    }

    #[test]
    fn auto_backup_requires_config_and_skips_without_switch() {
        let dir = tempfile::TempDir::new().expect("dir");
        let service = CloudService::new(Arc::new(MockTransport::default()), dir.path());
        let ledger = Ledger::open(dir.path()).expect("open ledger");

        // 未配置：开关打不开
        assert!(service.set_auto_backup(true).is_err());
        assert!(!service.state().expect("state").auto_backup_enabled);
        // 关闭永远允许
        service.set_auto_backup(false).expect("disable");

        // 未开启自动备份：直接跳过，不去碰网络（MockTransport 没排队列，一碰就失败）
        assert!(service
            .maybe_run_auto_backup("2026-09-14", &ledger)
            .expect("skip")
            .is_none());
        // 空逻辑日同样跳过
        assert!(service
            .maybe_run_auto_backup("   ", &ledger)
            .expect("skip empty")
            .is_none());
    }

    #[test]
    fn branch_and_client_helpers() {
        let dir = tempfile::TempDir::new().expect("dir");
        let service = CloudService::new(Arc::new(MockTransport::default()), dir.path());
        let config = CloudConfig {
            repo_url: "https://git.example.com/Yamds/Book.git".to_string(),
            username: "Yamds".to_string(),
            token: "t".to_string(),
            ..CloudConfig::default()
        };
        assert_eq!(config.branch(), "backup");
        let client = service.client(&config).expect("client");
        assert_eq!(
            client.credentials.basic_header(),
            GitCredentials::new("Yamds", "t").basic_header()
        );
    }
}
