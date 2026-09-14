//! Layer 3 数据导入 / 导出。
//!
//! 备份包 = 一个 zip：
//! ```text
//! manifest.json          格式 / 版本 / 时间 / 计数 / 文件 sha256 清单
//! data.json              全量业务数据（账本 / 账户 / 分类 / 账单 / 附件元信息 / 固定收支）
//! attachments/<tx>/<id>  附件原文件（zip 内路径 = 数据库相对路径去掉 `ledger/` 前缀）
//! ```
//!
//! 导入 = **覆盖式恢复**：先自动导出当前数据（导入前快照），再在一个事务里整库替换。
//! 不做合并（v1）；附件文件按需覆盖写入。

use std::collections::HashSet;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tk_config::DataPaths;
use tk_domain::{
    Account, Attachment, BackupCounts, BackupPreview, BackupSummary, Book, Category, ImportSummary,
    RecurringRule, RecurringRun, Tombstone, Transaction,
};
use tk_ledger::{repo, seed, Ledger};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

mod merge;
pub use merge::merge_into;

/// 备份包标识与格式版本。
///
/// 与 App 标识同源（`cafe.yamds.zhibook`）；尚未正式发布，旧标识不做兼容读。
pub const FORMAT: &str = "zhibook-backup";
pub const FORMAT_VERSION: i64 = 1;

const ATTACHMENT_DB_PREFIX: &str = "ledger/";

#[derive(Debug, thiserror::Error)]
pub enum BackupError {
    #[error("备份包格式不正确：{0}")]
    Invalid(String),
    #[error("文件读写失败：{0}")]
    Io(#[from] std::io::Error),
    #[error("JSON 解析失败：{0}")]
    Json(#[from] serde_json::Error),
    #[error("压缩包处理失败：{0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("数据写入失败：{0}")]
    Ledger(String),
}

impl From<tk_ledger::LedgerError> for BackupError {
    fn from(error: tk_ledger::LedgerError) -> Self {
        Self::Ledger(error.to_string())
    }
}

pub type BackupResult<T> = Result<T, BackupError>;

/// data.json 的结构（云端备份包的 data.json 同构，见 `tk-cloud`）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupData {
    pub books: Vec<Book>,
    pub accounts: Vec<Account>,
    pub categories: Vec<Category>,
    pub transactions: Vec<Transaction>,
    pub attachments: Vec<Attachment>,
    pub recurring_rules: Vec<RecurringRule>,
    pub recurring_runs: Vec<RecurringRun>,
    /// 硬删除墓碑（v3 起）；旧备份包没有这个字段，缺省为空。
    #[serde(default)]
    pub tombstones: Vec<Tombstone>,
    pub current_book_id: Option<String>,
}

/// manifest.json 的结构。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupManifest {
    format: String,
    format_version: i64,
    app_version: String,
    ledger_schema_version: i64,
    exported_at_ms: i64,
    counts: BackupCounts,
    files: Vec<BackupFileEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupFileEntry {
    path: String,
    bytes: i64,
    sha256: String,
}

// ---------------------------------------------------------------------------
// 导出
// ---------------------------------------------------------------------------

/// 导出全量数据到 `tmp/exports/zz-backup-<时间戳>.zip`。
pub fn export_to_zip(ledger: &Ledger, data_root: &Path) -> BackupResult<BackupSummary> {
    let data = gather_data(ledger)?;
    let paths = DataPaths::new(data_root);
    fs::create_dir_all(paths.export_dir())?;

    let now = now_ms();
    let target: PathBuf = paths.export_dir().join(format!("zz-backup-{now}.zip"));
    let file = fs::File::create(&target)?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    let mut files: Vec<BackupFileEntry> = Vec::new();

    let data_bytes = serde_json::to_vec(&data)?;
    zip.start_file("data.json", options)?;
    zip.write_all(&data_bytes)?;
    files.push(file_entry("data.json", &data_bytes));

    for attachment in &data.attachments {
        // 库里的路径可能被污染（例如导入了恶意包）：导出只读，跳过而不是越界读文件。
        if !tk_ledger::validate::is_valid_attachment_path(&attachment.path) {
            continue;
        }
        let Some(entry_name) = zip_entry_for(&attachment.path) else {
            continue;
        };
        let source = data_root.join(&attachment.path);
        let Ok(bytes) = fs::read(&source) else {
            // 附件文件缺失不阻断导出（数据库里仍保留元信息）
            continue;
        };
        zip.start_file(entry_name.as_str(), options)?;
        zip.write_all(&bytes)?;
        files.push(file_entry(&entry_name, &bytes));
    }

    let counts = counts_of(&data);
    let manifest = BackupManifest {
        format: FORMAT.to_string(),
        format_version: FORMAT_VERSION,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        ledger_schema_version: tk_ledger::SCHEMA_VERSION,
        exported_at_ms: now,
        counts,
        files,
    };
    let manifest_bytes = serde_json::to_vec_pretty(&manifest)?;
    zip.start_file("manifest.json", options)?;
    zip.write_all(&manifest_bytes)?;
    zip.finish()?;

    // `tmp/exports` 里的每一份都是全量数据（**包括附件明文**）：
    // 导出、导入前快照、云恢复前快照都会往这里扔一份，必须限个数。
    tk_config::prune_prefixed_files(
        &paths.export_dir(),
        tk_config::EXPORT_FILE_PREFIX,
        tk_config::MAX_EXPORT_FILES,
    );

    Ok(BackupSummary {
        counts,
        exported_at_ms: now,
        path: target.to_string_lossy().into_owned(),
    })
}

// ---------------------------------------------------------------------------
// 预览 / 导入
// ---------------------------------------------------------------------------

/// 备份包 / 云端包的数据形态校验。
///
/// 导入、恢复、合并的数据都来自应用外部（用户选的 zip、自己仓库里的密文包），
/// **不能假设它一定是我们自己导出的**。一条 `month` 与 `day` 不一致的记录会让
/// 统计查询永久报错（`month_stats` 直接返回 corrupt），且无法自愈，
/// 所以形式校验必须在落库前完成。
///
/// 只检查「形状」不检查「引用」：引用的存在性（账本 / 账单 / 账户）由外键
/// 与 `merge` 的父级校验负责。
pub fn validate_snapshot(data: &BackupData) -> BackupResult<()> {
    use tk_ledger::validate;

    fn bad(context: &str, error: tk_ledger::LedgerError) -> BackupError {
        BackupError::Invalid(format!("{context}：{error}"))
    }

    for book in &data.books {
        validate::book_name(&book.name).map_err(|error| bad("账本名不合法", error))?;
    }
    for account in &data.accounts {
        validate::account_name(&account.name).map_err(|error| bad("账户名不合法", error))?;
        validate::icon_name(&account.icon_name).map_err(|error| bad("账户图标名不合法", error))?;
        validate::color(&account.color).map_err(|error| bad("账户颜色不合法", error))?;
        if account.initial_balance_cents.abs() > tk_domain::MAX_AMOUNT_CENTS {
            return Err(BackupError::Invalid(format!(
                "账户初始余额超出上限：{}",
                account.name
            )));
        }
    }
    for category in &data.categories {
        validate::category_name(&category.name).map_err(|error| bad("分类名不合法", error))?;
        validate::icon_name(&category.icon_name).map_err(|error| bad("分类图标名不合法", error))?;
        validate::color(&category.color).map_err(|error| bad("分类颜色不合法", error))?;
    }
    // 可见分类名必须唯一（v4 的部分唯一索引）：提前给中文提示，不要等 SQL 报错。
    let mut visible_names: HashSet<(String, String)> = HashSet::new();
    for category in &data.categories {
        if category.hidden {
            continue;
        }
        let key = (category.kind.as_str().to_string(), category.name.clone());
        if !visible_names.insert(key) {
            return Err(BackupError::Invalid(format!(
                "备份包里存在同名分类：{}",
                category.name
            )));
        }
    }
    for transaction in &data.transactions {
        validate::amount_cents(transaction.amount_cents)
            .map_err(|error| bad("账单金额不合法", error))?;
        validate::note(&transaction.note).map_err(|error| bad("账单备注不合法", error))?;
        validate::day_and_month(&transaction.day, &transaction.month)
            .map_err(|error| bad("账单日期不合法", error))?;
    }
    for rule in &data.recurring_rules {
        validate::amount_cents(rule.amount_cents)
            .map_err(|error| bad("固定收支金额不合法", error))?;
        validate::note(&rule.note).map_err(|error| bad("固定收支备注不合法", error))?;
        if !tk_ledger::dates::is_valid_day_key(&rule.start_day) {
            return Err(BackupError::Invalid(format!(
                "固定收支生效日不合法：{}",
                rule.start_day
            )));
        }
        if let Some(last_run_day) = rule.last_run_day.as_deref()
            && !tk_ledger::dates::is_valid_day_key(last_run_day)
        {
            return Err(BackupError::Invalid(format!(
                "固定收支上次执行日不合法：{last_run_day}"
            )));
        }
    }
    for attachment in &data.attachments {
        validate::attachment_relative_path(&attachment.path)
            .map_err(|error| bad("附件路径不合法", error))?;
    }
    for run in &data.recurring_runs {
        if !tk_ledger::dates::is_valid_day_key(&run.day) {
            return Err(BackupError::Invalid(format!(
                "固定收支台账日期不合法：{}",
                run.day
            )));
        }
    }
    for tombstone in &data.tombstones {
        if tombstone.entity.trim().is_empty() || tombstone.entity_id.trim().is_empty() {
            return Err(BackupError::Invalid("墓碑记录缺少实体或 id".to_string()));
        }
    }
    Ok(())
}

/// 只读预览备份包内容（不落库）。
pub fn preview_zip(zip_path: &Path) -> BackupResult<BackupPreview> {
    let (manifest, data) = read_zip(zip_path)?;
    Ok(BackupPreview {
        counts: counts_of(&data),
        exported_at_ms: manifest.exported_at_ms,
        app_version: manifest.app_version,
        format_version: manifest.format_version,
    })
}

/// 覆盖式恢复：导入前自动快照当前数据；附件按需落盘；整库替换在一个事务里完成。
pub fn import_from_zip(
    ledger: &Ledger,
    data_root: &Path,
    zip_path: &Path,
) -> BackupResult<ImportSummary> {
    let (_manifest, data) = read_zip(zip_path)?;
    if data.books.is_empty() {
        return Err(BackupError::Invalid("备份包里没有任何账本".to_string()));
    }
    validate_snapshot(&data)?;
    let counts = counts_of(&data);

    // 导入前快照（失败不阻断导入，但会在结果里反映为 null）。
    let pre_import_backup_path = export_to_zip(ledger, data_root).ok().map(|item| item.path);

    // 附件先进暂存目录，再跑事务，最后才落位：
    // 事务失败时只扔掉暂存，正式路径上的旧文件一个都没动。
    let stage = DataPaths::new(data_root)
        .tmp_dir()
        .join(format!("import-stage-{}", now_ms()));
    fs::create_dir_all(&stage)?;
    let staged = match stage_attachments(zip_path, &data, &stage) {
        Ok(staged) => staged,
        Err(error) => {
            cleanup_stage(&stage);
            return Err(error);
        }
    };
    if let Err(error) = ledger.with_tx(|conn| replace_all(conn, &data)) {
        cleanup_stage(&stage);
        return Err(error.into());
    }
    // 事务已提交，DB 已经是新数据；这一步失败就是 IO 故障（磁盘满等）。
    // 此时**不能**清暂存目录：那里的文件是用户附件的唯一副本。
    if let Err(error) = commit_staged_attachments(&stage, data_root, &staged) {
        tracing::warn!(
            target: "tk_backup::import",
            %error,
            stage = %stage.display(),
            "附件落位失败；已保留暂存目录，请重试导入"
        );
        return Err(BackupError::Invalid(format!(
            "附件未能全部落位（原始文件保留在 {}）：{error}",
            stage.display()
        )));
    }
    cleanup_stage(&stage);

    Ok(ImportSummary {
        counts,
        pre_import_backup_path,
    })
}

// ---------------------------------------------------------------------------
// 内部
// ---------------------------------------------------------------------------

/// 读出全量业务数据（内存结构，不落盘）。
pub fn gather_data(ledger: &Ledger) -> BackupResult<BackupData> {
    ledger
        .with_conn(|conn| {
            let books = repo::list_books(conn)?;
            let categories = repo::list_categories(conn, true)?;
            let mut accounts = Vec::new();
            let mut transactions = Vec::new();
            for book in &books {
                // 导出不关心余额口径，取一个足够晚的日期即可。
                accounts.extend(repo::list_accounts(conn, &book.id, "9999-12-31")?);
                transactions.extend(repo::list_transactions_for_book(conn, &book.id)?);
            }
            let recurring_rules = repo::list_recurring_rules(conn)?;
            let recurring_runs = repo::list_recurring_runs(conn)?;
            let attachments = repo::list_all_attachments(conn)?;
            let tombstones = repo::list_tombstones(conn)?;
            let current_book_id = seed::get_meta(conn, seed::META_CURRENT_BOOK_KEY)?;
            Ok(BackupData {
                books,
                accounts,
                categories,
                transactions,
                attachments,
                recurring_rules,
                recurring_runs,
                tombstones,
                current_book_id,
            })
        })
        .map_err(BackupError::from)
}

/// 从内存数据覆盖恢复（云端恢复用；附件文件由调用方处理）。
pub fn restore_from_data(ledger: &Ledger, data: &BackupData) -> BackupResult<()> {
    validate_snapshot(data)?;
    ledger.with_tx(|conn| replace_all(conn, data))?;
    Ok(())
}

/// 数据计数（云端预览 / 导入结果复用）。
pub fn counts_of(data: &BackupData) -> BackupCounts {
    BackupCounts {
        books: data.books.len() as i64,
        accounts: data.accounts.len() as i64,
        categories: data.categories.len() as i64,
        transactions: data.transactions.len() as i64,
        attachments: data.attachments.len() as i64,
        recurring_rules: data.recurring_rules.len() as i64,
    }
}

fn read_zip(zip_path: &Path) -> BackupResult<(BackupManifest, BackupData)> {
    let file = fs::File::open(zip_path)?;
    let mut archive = ZipArchive::new(file)?;
    let manifest: BackupManifest = read_json_entry(&mut archive, "manifest.json")?;
    if manifest.format != FORMAT {
        return Err(BackupError::Invalid(
            "不是制账的备份包（manifest 标识不匹配）".to_string(),
        ));
    }
    if manifest.format_version > FORMAT_VERSION {
        return Err(BackupError::Invalid(
            "备份包版本比当前 App 新，请先升级 App".to_string(),
        ));
    }
    // 记账库结构更容易踩坑：新库多出来的字段在老代码里会被静默丢掉，所以直接拒。
    if manifest.ledger_schema_version > tk_ledger::SCHEMA_VERSION {
        return Err(BackupError::Invalid(format!(
            "备份包的记账库版本（{}）比当前 App 支持的（{}）新，请先升级 App",
            manifest.ledger_schema_version,
            tk_ledger::SCHEMA_VERSION
        )));
    }
    let data: BackupData = read_json_entry(&mut archive, "data.json")?;
    Ok((manifest, data))
}

fn read_json_entry<T: serde::de::DeserializeOwned>(
    archive: &mut ZipArchive<fs::File>,
    name: &str,
) -> BackupResult<T> {
    let mut entry = archive
        .by_name(name)
        .map_err(|_| BackupError::Invalid(format!("备份包缺少 {name}")))?;
    let mut bytes = Vec::new();
    entry.read_to_end(&mut bytes)?;
    Ok(serde_json::from_slice(&bytes)?)
}

/// 把备份包的附件解到暂存目录（**不碰正式路径**），返回已落地的暂存文件列表。
///
/// 路径先过 `tk-ledger` 的强校验：校验通过后 `stage.join(path)` 必定落在暂存目录内。
fn stage_attachments(zip_path: &Path, data: &BackupData, stage: &Path) -> BackupResult<Vec<PathBuf>> {
    let file = fs::File::open(zip_path)?;
    let mut archive = ZipArchive::new(file)?;
    let mut staged: Vec<PathBuf> = Vec::with_capacity(data.attachments.len());
    for attachment in &data.attachments {
        if !tk_ledger::validate::is_valid_attachment_path(&attachment.path) {
            return Err(BackupError::Invalid(format!(
                "备份包里的附件路径不合法：{}",
                attachment.path
            )));
        }
        let Some(entry_name) = zip_entry_for(&attachment.path) else {
            continue;
        };
        let Ok(mut entry) = archive.by_name(entry_name.as_str()) else {
            // 附件条目缺失不阻断导入（与导出口径一致：库里仍保留元信息）
            continue;
        };
        let mut bytes = Vec::new();
        entry.read_to_end(&mut bytes)?;
        let target = stage.join(&attachment.path);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&target, &bytes)?;
        staged.push(target);
    }
    Ok(staged)
}

/// 把暂存附件搬到正式路径（事务已提交；逐个文件 move，失败即中止）。
fn commit_staged_attachments(stage: &Path, data_root: &Path, staged: &[PathBuf]) -> BackupResult<()> {
    for source in staged {
        let Ok(relative) = source.strip_prefix(stage) else {
            continue;
        };
        let target = data_root.join(relative);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        // 同一文件系统下 rename 是原子的（Android 上一定是）；
        // Windows 上目标已存在时 rename 会失败，退化为覆盖式 copy。
        if fs::rename(source, &target).is_err() {
            fs::copy(source, &target)?;
            let _ = fs::remove_file(source);
        }
    }
    Ok(())
}

/// 删除本次导入的暂存目录（只删我们自己刚建出来的那棵树）。
fn cleanup_stage(stage: &Path) {
    if stage.exists() {
        let _ = fs::remove_dir_all(stage);
    }
}

fn replace_all(conn: &rusqlite::Connection, data: &BackupData) -> tk_ledger::LedgerResult<()> {
    // 删账本 → 级联清空账单 / 账户 / 附件 / 固定收支；分类全局共享，单独清。
    conn.execute("DELETE FROM books", [])?;
    conn.execute("DELETE FROM categories", [])?;
    conn.execute("DELETE FROM tombstones", [])?;

    for category in &data.categories {
        repo::insert_category(conn, category)?;
    }
    for book in &data.books {
        repo::insert_book(conn, book)?;
    }
    for account in &data.accounts {
        repo::insert_account(conn, account)?;
    }
    for transaction in &data.transactions {
        repo::insert_transaction(conn, transaction)?;
    }
    for attachment in &data.attachments {
        repo::insert_attachment(conn, attachment)?;
    }
    for rule in &data.recurring_rules {
        repo::insert_recurring_rule(conn, rule)?;
    }
    for run in &data.recurring_runs {
        repo::upsert_recurring_run(conn, run)?;
    }
    for tombstone in &data.tombstones {
        repo::insert_tombstone(
            conn,
            &tombstone.entity,
            &tombstone.entity_id,
            tombstone.deleted_at_ms,
        )?;
    }
    if let Some(book_id) = &data.current_book_id
        && repo::book_exists(conn, book_id)?
    {
        seed::set_meta(conn, seed::META_CURRENT_BOOK_KEY, book_id)?;
    }
    seed::ensure_current_book(conn)?;
    Ok(())
}

fn file_entry(path: &str, bytes: &[u8]) -> BackupFileEntry {
    BackupFileEntry {
        path: path.to_string(),
        bytes: bytes.len() as i64,
        sha256: sha256_hex(bytes),
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let digest = hasher.finalize();
    let mut out = String::with_capacity(64);
    for byte in digest {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

/// `ledger/attachments/...` → `attachments/...`（zip 内路径）。
fn zip_entry_for(db_path: &str) -> Option<String> {
    db_path
        .strip_prefix(ATTACHMENT_DB_PREFIX)
        .map(|rest| rest.to_string())
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tk_domain::{EntryKind, NewRecurringRule, NewTransaction};

    #[test]
    fn export_then_import_round_trips() {
        let source_dir = tempfile::TempDir::new().expect("source dir");
        let source = Ledger::open(source_dir.path()).expect("open source");
        let book_id = seed::DEFAULT_BOOK_ID.to_string();

        source
            .create_transaction(NewTransaction {
                book_id: book_id.clone(),
                kind: EntryKind::Expense,
                category_id: "expense_food".to_string(),
                account_id: None,
                amount_cents: 1234,
                note: "早餐".to_string(),
                day: "2025-09-08".to_string(),
                month: "2025-09".to_string(),
                occurred_at_ms: 1,
            })
            .expect("transaction");
        source
            .create_recurring_rule(NewRecurringRule {
                book_id: book_id.clone(),
                kind: EntryKind::Expense,
                amount_cents: 500,
                note: String::new(),
                category_id: "expense_food".to_string(),
                account_id: None,
                start_day: "2025-09-09".to_string(),
            })
            .expect("rule");

        let summary = export_to_zip(&source, source_dir.path()).expect("export");
        assert_eq!(summary.counts.transactions, 1);
        assert_eq!(summary.counts.recurring_rules, 1);

        let preview = preview_zip(Path::new(&summary.path)).expect("preview");
        assert_eq!(preview.counts.transactions, 1);
        assert_eq!(preview.format_version, FORMAT_VERSION);

        let target_dir = tempfile::TempDir::new().expect("target dir");
        let target = Ledger::open(target_dir.path()).expect("open target");
        let imported = import_from_zip(
            &target,
            target_dir.path(),
            Path::new(&summary.path),
        )
        .expect("import");
        assert_eq!(imported.counts.transactions, 1);
        assert!(imported.pre_import_backup_path.is_some());
        assert_eq!(
            target
                .list_transactions_by_day(&book_id, "2025-09-08")
                .expect("list")
                .len(),
            1
        );
        assert_eq!(target.list_recurring_rules().expect("rules").len(), 1);
    }

    /// 造一个「手工备份包」：`data` 是 `data.json` 的内容，`extra` 是可以额外塞进 zip 的条目。
    fn craft_zip(dir: &Path, data: &serde_json::Value, extra: &[(&str, &[u8])]) -> PathBuf {
        let zip_path = dir.join("evil.zip");
        let file = fs::File::create(&zip_path).expect("create");
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default();
        let manifest = serde_json::json!({
            "format": FORMAT,
            "formatVersion": FORMAT_VERSION,
            "appVersion": "1.0.0",
            "ledgerSchemaVersion": tk_ledger::SCHEMA_VERSION,
            "exportedAtMs": 0,
            "counts": {"books": 1, "accounts": 0, "categories": 0, "transactions": 0, "attachments": 0, "recurringRules": 0},
            "files": []
        })
        .to_string();
        let body = data.to_string();
        let mut entries: Vec<(&str, &[u8])> = vec![
            ("manifest.json", manifest.as_bytes()),
            ("data.json", body.as_bytes()),
        ];
        entries.extend_from_slice(extra);
        for (name, bytes) in entries {
            zip.start_file(name, options).expect("start file");
            zip.write_all(bytes).expect("write");
        }
        zip.finish().expect("finish");
        zip_path
    }

    fn one_book_snapshot() -> serde_json::Value {
        serde_json::json!({
            "books": [{"id": "book_default", "name": "默认账本", "createdAtMs": 1, "updatedAtMs": 1, "sortOrder": 0}],
            "accounts": [],
            "categories": [],
            "transactions": [],
            "attachments": [],
            "recurringRules": [],
            "recurringRuns": [],
            "tombstones": [],
            "currentBookId": "book_default"
        })
    }

    /// P0 回归：备份包里的附件路径带 `..` 时，必须整单拒绝且不得写出任何越界文件。
    #[test]
    fn import_rejects_attachment_path_traversal() {
        let dir = tempfile::TempDir::new().expect("dir");
        let ledger = Ledger::open(dir.path()).expect("open");
        let escaping = "ledger/attachments/../pwned.txt";
        let mut data = one_book_snapshot();
        data["attachments"] = serde_json::json!([{
            "id": "att_evil",
            "transactionId": "tx_evil",
            "path": escaping,
            "mime": "image/jpeg",
            "byteSize": 3,
            "sortOrder": 0,
            "createdAtMs": 1
        }]);
        let zip_path = craft_zip(dir.path(), &data, &[("../pwned.txt", b"pwn")]);

        let error = import_from_zip(&ledger, dir.path(), &zip_path).expect_err("必须拒绝越界路径");
        assert!(matches!(error, BackupError::Invalid(_)), "{error:?}");
        assert!(
            !dir.path().join("pwned.txt").exists(),
            "越界文件不应被写出：{:?}",
            dir.path().join("pwned.txt")
        );
        // 库也没有被替换成备份包里的内容
        assert_eq!(
            ledger
                .list_transactions_by_day(seed::DEFAULT_BOOK_ID, "2025-09-08")
                .expect("list")
                .len(),
            0
        );
    }

    /// 回归（REV-07）：`day` 与 `month` 不一致的包必须被拒，否则统计查询会永久报错。
    #[test]
    fn import_rejects_inconsistent_day_and_month() {
        let dir = tempfile::TempDir::new().expect("dir");
        let ledger = Ledger::open(dir.path()).expect("open");
        let mut data = one_book_snapshot();
        data["transactions"] = serde_json::json!([{
            "id": "tx_bad",
            "bookId": "book_default",
            "kind": "expense",
            "categoryId": "expense_food",
            "accountId": null,
            "amountCents": 100,
            "note": "",
            "day": "2025-02-30",
            "month": "2025-02",
            "occurredAtMs": 1,
            "createdAtMs": 1,
            "updatedAtMs": 1
        }]);
        let zip_path = craft_zip(dir.path(), &data, &[]);

        let error = import_from_zip(&ledger, dir.path(), &zip_path).expect_err("必须拒绝");
        assert!(matches!(error, BackupError::Invalid(_)), "{error:?}");
        assert_eq!(
            ledger
                .list_transactions_by_day(seed::DEFAULT_BOOK_ID, "2025-02-28")
                .expect("list")
                .len(),
            0
        );
    }

    #[test]
    fn validate_snapshot_checks_shapes() {
        // 合法快照直接过
        let ok = BackupData {
            books: vec![Book {
                id: "b".to_string(),
                name: "账本".to_string(),
                created_at_ms: 1,
                updated_at_ms: 1,
                sort_order: 0,
            }],
            accounts: vec![],
            categories: vec![],
            transactions: vec![Transaction {
                id: "tx".to_string(),
                book_id: "b".to_string(),
                kind: EntryKind::Expense,
                category_id: "expense_food".to_string(),
                account_id: None,
                amount_cents: 100,
                note: String::new(),
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
            current_book_id: Some("b".to_string()),
        };
        validate_snapshot(&ok).expect("合法快照");

        // 金额超上限
        let mut too_big = ok.clone();
        too_big.transactions[0].amount_cents = tk_domain::MAX_AMOUNT_CENTS + 1;
        assert!(matches!(
            validate_snapshot(&too_big),
            Err(BackupError::Invalid(_))
        ));

        // 附件路径越界
        let mut poisoned = ok.clone();
        poisoned.attachments.push(Attachment {
            id: "att".to_string(),
            transaction_id: "tx".to_string(),
            path: "ledger/attachments/../config/security.json".to_string(),
            mime: "image/jpeg".to_string(),
            byte_size: 1,
            sort_order: 0,
            created_at_ms: 1,
        });
        assert!(matches!(
            validate_snapshot(&poisoned),
            Err(BackupError::Invalid(_))
        ));
    }

    /// 回归（REV-09）：导入失败（事务回滚）时，正式路径上的旧附件文件必须原封不动。
    #[test]
    fn failed_import_does_not_touch_existing_attachment_files() {
        let dir = tempfile::TempDir::new().expect("dir");
        let ledger = Ledger::open(dir.path()).expect("open");
        let book_id = seed::DEFAULT_BOOK_ID.to_string();
        let transaction = ledger
            .create_transaction(NewTransaction {
                book_id: book_id.clone(),
                kind: EntryKind::Expense,
                category_id: "expense_food".to_string(),
                account_id: None,
                amount_cents: 100,
                note: String::new(),
                day: "2025-09-08".to_string(),
                month: "2025-09".to_string(),
                occurred_at_ms: 1,
            })
            .expect("transaction");
        // base64("OLD") = "T0xE"
        let attachment = ledger
            .save_attachment(tk_domain::NewAttachment {
                transaction_id: transaction.id.clone(),
                mime: "image/jpeg".to_string(),
                base64: "T0xE".to_string(),
            })
            .expect("attachment");
        let absolute = dir.path().join(&attachment.path);
        assert_eq!(fs::read(&absolute).expect("read before"), b"OLD");

        // 手工包：两个同名账本 → 第二次插入撞唯一索引 → 整个事务回滚
        let mut data = one_book_snapshot();
        data["books"] = serde_json::json!([
            {"id": "book_default", "name": "默认账本", "createdAtMs": 1, "updatedAtMs": 1, "sortOrder": 0},
            {"id": "book_dup", "name": "默认账本", "createdAtMs": 1, "updatedAtMs": 1, "sortOrder": 1}
        ]);
        data["transactions"] = serde_json::json!([{
            "id": transaction.id,
            "bookId": book_id,
            "kind": "expense",
            "categoryId": "expense_food",
            "accountId": null,
            "amountCents": 100,
            "note": "",
            "day": "2025-09-08",
            "month": "2025-09",
            "occurredAtMs": 1,
            "createdAtMs": 1,
            "updatedAtMs": 1
        }]);
        data["attachments"] = serde_json::json!([{
            "id": attachment.id,
            "transactionId": transaction.id,
            "path": attachment.path,
            "mime": "image/jpeg",
            "byteSize": 3,
            "sortOrder": 0,
            "createdAtMs": 1
        }]);
        let entry = attachment.path.strip_prefix("ledger/").expect("prefix");
        let zip_path = craft_zip(dir.path(), &data, &[(entry, b"NEW")]);

        let error = import_from_zip(&ledger, dir.path(), &zip_path).expect_err("同名账本必须让整单失败");
        assert!(matches!(error, BackupError::Ledger(_)), "{error:?}");
        assert_eq!(
            fs::read(&absolute).expect("read after"),
            b"OLD",
            "旧附件文件被半路覆盖了"
        );
        // 原账单仍然在库里
        assert!(ledger.get_transaction(&transaction.id).expect("get").is_some());
        // 暂存目录已清理
        let tmp = tk_config::DataPaths::new(dir.path()).tmp_dir();
        let leftovers: Vec<String> = fs::read_dir(&tmp)
            .expect("read tmp")
            .filter_map(Result::ok)
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .filter(|name| name.starts_with("import-stage-"))
            .collect();
        assert!(leftovers.is_empty(), "暂存目录必须清理干净：{leftovers:?}");
    }

    #[test]
    fn import_rejects_a_newer_ledger_schema() {
        let dir = tempfile::TempDir::new().expect("dir");
        let ledger = Ledger::open(dir.path()).expect("open");
        let data = one_book_snapshot();
        let zip_path = dir.path().join("newer.zip");
        {
            let file = fs::File::create(&zip_path).expect("create");
            let mut zip = ZipWriter::new(file);
            let options = SimpleFileOptions::default();
            let manifest = serde_json::json!({
                "format": FORMAT,
                "formatVersion": FORMAT_VERSION,
                "appVersion": "9.9.9",
                "ledgerSchemaVersion": tk_ledger::SCHEMA_VERSION + 1,
                "exportedAtMs": 0,
                "counts": {"books": 1, "accounts": 0, "categories": 0, "transactions": 0, "attachments": 0, "recurringRules": 0},
                "files": []
            })
            .to_string();
            let body = data.to_string();
            for (name, bytes) in [
                ("manifest.json", manifest.as_bytes()),
                ("data.json", body.as_bytes()),
            ] {
                zip.start_file(name, options).expect("start file");
                zip.write_all(bytes).expect("write");
            }
            zip.finish().expect("finish");
        }
        let error = import_from_zip(&ledger, dir.path(), &zip_path).expect_err("必须拒绝更新的库版本");
        assert!(matches!(error, BackupError::Invalid(_)), "{error:?}");
    }

    #[test]
    fn import_rejects_foreign_zip() {
        let dir = tempfile::TempDir::new().expect("dir");
        let ledger = Ledger::open(dir.path()).expect("open");
        let bogus = dir.path().join("bogus.zip");
        {
            let file = fs::File::create(&bogus).expect("create");
            let mut zip = ZipWriter::new(file);
            zip.start_file("manifest.json", SimpleFileOptions::default())
                .expect("start");
            zip.write_all(br#"{"format":"nope","formatVersion":1,"appVersion":"0","ledgerSchemaVersion":1,"exportedAtMs":0,"counts":{"books":0,"accounts":0,"categories":0,"transactions":0,"attachments":0,"recurringRules":0},"files":[]}"#)
                .expect("write");
            zip.finish().expect("finish");
        }
        let error = import_from_zip(&ledger, dir.path(), &bogus).expect_err("reject");
        assert!(matches!(error, BackupError::Invalid(_)), "{error:?}");
    }
}
