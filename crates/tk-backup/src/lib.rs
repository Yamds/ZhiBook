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

use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tk_config::DataPaths;
use tk_domain::{
    Account, Attachment, BackupCounts, BackupPreview, BackupSummary, Book, Category, ImportSummary,
    RecurringRule, RecurringRun, Transaction,
};
use tk_ledger::{repo, seed, Ledger};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

/// 备份包标识与格式版本。
pub const FORMAT: &str = "yamds-bill-backup";
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

/// data.json 的结构。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupData {
    books: Vec<Book>,
    accounts: Vec<Account>,
    categories: Vec<Category>,
    transactions: Vec<Transaction>,
    attachments: Vec<Attachment>,
    recurring_rules: Vec<RecurringRule>,
    recurring_runs: Vec<RecurringRun>,
    current_book_id: Option<String>,
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
    let data = gather(ledger)?;
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

    Ok(BackupSummary {
        counts,
        exported_at_ms: now,
        path: target.to_string_lossy().into_owned(),
    })
}

// ---------------------------------------------------------------------------
// 预览 / 导入
// ---------------------------------------------------------------------------

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
    let counts = counts_of(&data);

    // 导入前快照（失败不阻断导入，但会在结果里反映为 null）。
    let pre_import_backup_path = export_to_zip(ledger, data_root).ok().map(|item| item.path);

    write_attachments(data_root, zip_path, &data)?;
    ledger.with_tx(|conn| replace_all(conn, &data))?;

    Ok(ImportSummary {
        counts,
        pre_import_backup_path,
    })
}

// ---------------------------------------------------------------------------
// 内部
// ---------------------------------------------------------------------------

fn gather(ledger: &Ledger) -> BackupResult<BackupData> {
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
            let current_book_id = seed::get_meta(conn, seed::META_CURRENT_BOOK_KEY)?;
            Ok(BackupData {
                books,
                accounts,
                categories,
                transactions,
                attachments,
                recurring_rules,
                recurring_runs,
                current_book_id,
            })
        })
        .map_err(BackupError::from)
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

fn write_attachments(data_root: &Path, zip_path: &Path, data: &BackupData) -> BackupResult<()> {
    let file = fs::File::open(zip_path)?;
    let mut archive = ZipArchive::new(file)?;
    for attachment in &data.attachments {
        let Some(entry_name) = zip_entry_for(&attachment.path) else {
            continue;
        };
        let Ok(mut entry) = archive.by_name(entry_name.as_str()) else {
            continue;
        };
        let mut bytes = Vec::new();
        entry.read_to_end(&mut bytes)?;
        let target = data_root.join(&attachment.path);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&target, &bytes)?;
    }
    Ok(())
}

fn replace_all(conn: &rusqlite::Connection, data: &BackupData) -> tk_ledger::LedgerResult<()> {
    // 删账本 → 级联清空账单 / 账户 / 附件 / 固定收支；分类全局共享，单独清。
    conn.execute("DELETE FROM books", [])?;
    conn.execute("DELETE FROM categories", [])?;

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
    if let Some(book_id) = &data.current_book_id
        && repo::book_exists(conn, book_id)?
    {
        seed::set_meta(conn, seed::META_CURRENT_BOOK_KEY, book_id)?;
    }
    seed::ensure_current_book(conn)?;
    Ok(())
}

fn counts_of(data: &BackupData) -> BackupCounts {
    BackupCounts {
        books: data.books.len() as i64,
        accounts: data.accounts.len() as i64,
        categories: data.categories.len() as i64,
        transactions: data.transactions.len() as i64,
        attachments: data.attachments.len() as i64,
        recurring_rules: data.recurring_rules.len() as i64,
    }
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
