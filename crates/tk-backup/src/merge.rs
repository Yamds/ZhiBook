//! 多设备合并（P15.2）。
//!
//! 两台设备共用同一个云端分支时，各自把「本机全量数据」推成新的提交；
//! 推送前如果发现远端已经前进，就先下载远端包并按本文件的规则合并进本机库。
//!
//! 合并语义（用户确认的口径）：
//! - 按实体 id 求并集；同一个 id 冲突时比时间戳，**新者胜**。
//! - 硬删除用墓碑记录；「记录 vs 墓碑」同刻时**记录优先**（避免误删）。
//! - 父实体被删除（账本 / 账单 / 规则）时，远端带来的子记录一并忽略：
//!   账本删除 → 该账本的账户 / 账单 / 规则不再写入；账单删除 → 其附件忽略；
//!   规则删除 → 其台账忽略。
//! - 账户被删除 → 远端账单的 `account_id` 落空为「未指定账户」（不丢账单）。
//! - 分类同名冲突（两台设备各自新建了同名分类）→ 远端分类并入已有分类：
//!   远端账单 / 规则改指向已有分类的 id，不产生重复分类；同一 id 改名撞车时
//!   自动加序号重命名。
//! - 附件按 id 并集：记录胜出但本机缺文件时从远端包复制补齐。
//!
//! 合并前由调用方负责快照（`tk-backup::export_to_zip`），本函数只负责数据与文件。

use std::collections::{BTreeSet, HashMap, HashSet};
use std::fs;
use std::path::Path;

use tk_domain::{Account, Attachment, Book, Category, MergeSummary, RecurringRule, Transaction};
use tk_ledger::{repo, seed, Ledger};

use crate::{BackupData, BackupError, BackupResult, counts_of};

/// 账本名上限（与 `tk-ledger::validate` 的 BOOK_NAME_MAX 对齐）。
const BOOK_NAME_MAX: usize = 20;
/// 分类名上限（与 `tk-ledger::validate` 的 CATEGORY_NAME_MAX 对齐）。
const CATEGORY_NAME_MAX: usize = 8;
/// 数据库里的附件路径前缀（云端包内去掉这个前缀）。
const LEDGER_PREFIX: &str = "ledger/";

/// 合并的结果：库已更新、文件列表已返回，调用方负责落盘 / 清理。
struct MergeOutcome {
    summary: MergeSummary,
    /// 合并后不应存在的附件文件（数据库相对路径）。
    files_to_delete: Vec<String>,
    /// 合并后应当存在的附件文件（数据库相对路径）；本机缺失时从远端包复制。
    files_to_ensure: Vec<String>,
}

/// 把远端包合并进本机库。
///
/// `remote_attachment_root` 是远端包的解包目录（含 `attachments/...`）；
/// 传 `None` 时只合并数据库行，不补齐附件文件（本地 zip 场景不会走这里）。
pub fn merge_into(
    ledger: &Ledger,
    data_root: &Path,
    remote: &BackupData,
    remote_attachment_root: Option<&Path>,
) -> BackupResult<MergeSummary> {
    let local = crate::gather_data(ledger)?;
    let outcome = ledger
        .with_tx(|conn| {
            let mut state = MergeState::default();
            merge_books(conn, &local, remote, &mut state)?;
            merge_accounts(conn, &local, remote, &mut state)?;
            merge_categories(conn, &local, remote, &mut state)?;
            merge_transactions(conn, &local, remote, &mut state)?;
            merge_attachments(conn, &local, remote, &mut state)?;
            merge_recurring_rules(conn, &local, remote, &mut state)?;
            merge_recurring_runs(conn, &local, remote, &mut state)?;
            seed::ensure_current_book(conn)?;
            Ok(state.into_outcome())
        })
        .map_err(BackupError::from)?;

    apply_files(data_root, remote_attachment_root, &outcome)?;
    Ok(outcome.summary)
}

// ---------------------------------------------------------------------------
// 决策
// ---------------------------------------------------------------------------

/// 冲突裁决的胜者。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Winner {
    LocalRecord,
    RemoteRecord,
    /// 墓碑胜出（哪一侧的无所谓，删除语义一致）。
    Tombstone,
    /// 双方都没有。
    Absent,
}

/// 时间戳比较：数字大者胜；同刻「记录 > 墓碑」「本机 > 远端」。
fn decide(
    local_record: Option<i64>,
    local_tombstone: Option<i64>,
    remote_record: Option<i64>,
    remote_tombstone: Option<i64>,
) -> Winner {
    // (时间戳, 类型权重：记录 1 / 墓碑 0, 侧权重：本机 1 / 远端 0)
    let mut best: Option<(i64, u8, u8)> = None;
    let mut consider = |ts: Option<i64>, kind: u8, side: u8| {
        let Some(ts) = ts else { return };
        let score = (ts, kind, side);
        if best.is_none_or(|current| score > current) {
            best = Some(score);
        }
    };
    consider(local_record, 1, 1);
    consider(local_tombstone, 0, 1);
    consider(remote_record, 1, 0);
    consider(remote_tombstone, 0, 0);
    match best {
        None => Winner::Absent,
        Some((_, 1, 1)) => Winner::LocalRecord,
        Some((_, 1, 0)) => Winner::RemoteRecord,
        Some((_, _, _)) => Winner::Tombstone,
    }
}

#[derive(Default)]
struct MergeState {
    summary: MergeSummary,
    files_to_delete: Vec<String>,
    files_to_ensure: Vec<String>,
    /// 远端分类 id → 本机分类 id（同名不同 id 的并入）。
    category_map: HashMap<String, String>,
    /// 合并过程中被删除的账本 / 账单 / 规则（用于父级校验）。
    deleted_books: HashSet<String>,
    deleted_transactions: HashSet<String>,
    deleted_rules: HashSet<String>,
}

impl MergeState {
    fn into_outcome(self) -> MergeOutcome {
        MergeOutcome {
            summary: self.summary,
            files_to_delete: self.files_to_delete,
            files_to_ensure: self.files_to_ensure,
        }
    }
}

/// 实体索引：本地快照的若干映射。
struct LocalIndex<'a> {
    books: HashMap<&'a str, &'a Book>,
    accounts: HashMap<&'a str, &'a Account>,
    categories: HashMap<&'a str, &'a Category>,
    transactions: HashMap<&'a str, &'a Transaction>,
    attachments: HashMap<&'a str, &'a Attachment>,
    rules: HashMap<&'a str, &'a RecurringRule>,
    runs: HashSet<(&'a str, &'a str)>,
    tombstones: HashMap<(&'a str, &'a str), i64>,
}

fn local_index(data: &BackupData) -> LocalIndex<'_> {
    LocalIndex {
        books: data.books.iter().map(|item| (item.id.as_str(), item)).collect(),
        accounts: data
            .accounts
            .iter()
            .map(|item| (item.id.as_str(), item))
            .collect(),
        categories: data
            .categories
            .iter()
            .map(|item| (item.id.as_str(), item))
            .collect(),
        transactions: data
            .transactions
            .iter()
            .map(|item| (item.id.as_str(), item))
            .collect(),
        attachments: data
            .attachments
            .iter()
            .map(|item| (item.id.as_str(), item))
            .collect(),
        rules: data
            .recurring_rules
            .iter()
            .map(|item| (item.id.as_str(), item))
            .collect(),
        runs: data
            .recurring_runs
            .iter()
            .map(|run| (run.rule_id.as_str(), run.day.as_str()))
            .collect(),
        tombstones: data
            .tombstones
            .iter()
            .map(|item| ((item.entity.as_str(), item.entity_id.as_str()), item.deleted_at_ms))
            .collect(),
    }
}

fn remote_tombstones<'a>(remote: &'a BackupData, entity: &str) -> HashMap<&'a str, i64> {
    remote
        .tombstones
        .iter()
        .filter(|item| item.entity == entity)
        .map(|item| (item.entity_id.as_str(), item.deleted_at_ms))
        .collect()
}

fn local_tombstones<'a>(local: &'a LocalIndex<'_>, entity: &str) -> HashMap<&'a str, i64> {
    local
        .tombstones
        .iter()
        .filter(|((kind, _), _)| *kind == entity)
        .map(|((_, id), ts)| (*id, *ts))
        .collect()
}

// ---------------------------------------------------------------------------
// 各实体合并
// ---------------------------------------------------------------------------

fn merge_books(
    conn: &rusqlite::Connection,
    local_data: &BackupData,
    remote: &BackupData,
    state: &mut MergeState,
) -> tk_ledger::LedgerResult<()> {
    let local = local_index(local_data);
    let local_tombs = local_tombstones(&local, "book");
    let remote_tombs = remote_tombstones(remote, "book");
    let ids: BTreeSet<&str> = local
        .books
        .keys()
        .copied()
        .chain(remote.books.iter().map(|item| item.id.as_str()))
        .chain(local_tombs.keys().copied())
        .chain(remote_tombs.keys().copied())
        .collect();

    for id in ids {
        let local_record = local.books.get(id).map(|item| item.updated_at_ms);
        let remote_record = remote
            .books
            .iter()
            .find(|item| item.id == id)
            .map(|item| item.updated_at_ms);
        match decide(local_record, local_tombs.get(id).copied(), remote_record, remote_tombs.get(id).copied())
        {
            Winner::RemoteRecord => {
                let Some(source) = remote.books.iter().find(|item| item.id == id) else {
                    continue;
                };
                let name = unique_book_name(conn, &source.name, Some(id))?;
                let book = Book {
                    name,
                    ..source.clone()
                };
                repo::upsert_book(conn, &book)?;
                clear_tombstone(conn, "book", id)?;
                if local.books.contains_key(id) {
                    state.summary.books.updated += 1;
                } else {
                    state.summary.books.added += 1;
                }
            }
            Winner::Tombstone => {
                if let Some(current) = local.books.get(id) {
                    let paths = repo::attachment_paths_for_book(conn, &current.id)?;
                    state.files_to_delete.extend(paths);
                    repo::delete_book(conn, id)?;
                    state.deleted_books.insert(id.to_string());
                    state.summary.books.deleted += 1;
                }
                repo::insert_tombstone(
                    conn,
                    "book",
                    id,
                    tombstone_ts(&local_tombs, &remote_tombs, id),
                )?;
            }
            _ => {}
        }
    }
    Ok(())
}

fn merge_accounts(
    conn: &rusqlite::Connection,
    local_data: &BackupData,
    remote: &BackupData,
    state: &mut MergeState,
) -> tk_ledger::LedgerResult<()> {
    let local = local_index(local_data);
    let local_tombs = local_tombstones(&local, "account");
    let remote_tombs = remote_tombstones(remote, "account");
    let ids: BTreeSet<&str> = local
        .accounts
        .keys()
        .copied()
        .chain(remote.accounts.iter().map(|item| item.id.as_str()))
        .chain(local_tombs.keys().copied())
        .chain(remote_tombs.keys().copied())
        .collect();

    for id in ids {
        let local_record = local.accounts.get(id).map(|item| item.updated_at_ms);
        let remote_record = remote
            .accounts
            .iter()
            .find(|item| item.id == id)
            .map(|item| item.updated_at_ms);
        match decide(local_record, local_tombs.get(id).copied(), remote_record, remote_tombs.get(id).copied())
        {
            Winner::RemoteRecord => {
                let Some(source) = remote.accounts.iter().find(|item| item.id == id) else {
                    continue;
                };
                // 账本已删（本机或远端墓碑胜出）→ 账户不再写入。
                if state.deleted_books.contains(&source.book_id)
                    || !repo::book_exists(conn, &source.book_id)?
                {
                    continue;
                }
                repo::upsert_account(conn, source)?;
                clear_tombstone(conn, "account", id)?;
                if local.accounts.contains_key(id) {
                    state.summary.accounts.updated += 1;
                } else {
                    state.summary.accounts.added += 1;
                }
            }
            Winner::Tombstone => {
                if local.accounts.contains_key(id) && repo::delete_account(conn, id)? {
                    state.summary.accounts.deleted += 1;
                }
                repo::insert_tombstone(
                    conn,
                    "account",
                    id,
                    tombstone_ts(&local_tombs, &remote_tombs, id),
                )?;
            }
            _ => {}
        }
    }
    Ok(())
}

fn merge_categories(
    conn: &rusqlite::Connection,
    local_data: &BackupData,
    remote: &BackupData,
    state: &mut MergeState,
) -> tk_ledger::LedgerResult<()> {
    let local = local_index(local_data);
    // (kind, name) → id：同名不同 id 时把远端并进已有分类。
    let mut name_index: HashMap<(String, String), String> = local
        .categories
        .values()
        .map(|item| {
            (
                (item.kind.as_str().to_string(), item.name.clone()),
                item.id.clone(),
            )
        })
        .collect();

    for source in &remote.categories {
        let kind_name = (source.kind.as_str().to_string(), source.name.clone());
        match local.categories.get(source.id.as_str()) {
            Some(current) => {
                if source.updated_at_ms > current.updated_at_ms {
                    let mut incoming = source.clone();
                    if let Some(other) = name_index.get(&kind_name)
                        && other != &source.id
                    {
                        incoming.name = unique_category_name(conn, source.kind, &source.name, Some(&source.id))?;
                    }
                    name_index.remove(&(current.kind.as_str().to_string(), current.name.clone()));
                    name_index.insert(
                        (incoming.kind.as_str().to_string(), incoming.name.clone()),
                        incoming.id.clone(),
                    );
                    repo::upsert_category(conn, &incoming)?;
                    clear_tombstone(conn, "category", &source.id)?;
                    state.summary.categories.updated += 1;
                }
            }
            None => {
                if let Some(existing) = name_index.get(&kind_name) {
                    // 两台设备各自建了同名分类：远端账单改指向已有分类。
                    state.category_map.insert(source.id.clone(), existing.clone());
                    continue;
                }
                repo::upsert_category(conn, source)?;
                name_index.insert(kind_name, source.id.clone());
                state.summary.categories.added += 1;
            }
        }
    }
    Ok(())
}

fn merge_transactions(
    conn: &rusqlite::Connection,
    local_data: &BackupData,
    remote: &BackupData,
    state: &mut MergeState,
) -> tk_ledger::LedgerResult<()> {
    let local = local_index(local_data);
    let local_tombs = local_tombstones(&local, "transaction");
    let remote_tombs = remote_tombstones(remote, "transaction");
    let ids: BTreeSet<&str> = local
        .transactions
        .keys()
        .copied()
        .chain(remote.transactions.iter().map(|item| item.id.as_str()))
        .chain(local_tombs.keys().copied())
        .chain(remote_tombs.keys().copied())
        .collect();

    for id in ids {
        let local_record = local.transactions.get(id).map(|item| item.updated_at_ms);
        let remote_record = remote
            .transactions
            .iter()
            .find(|item| item.id == id)
            .map(|item| item.updated_at_ms);
        match decide(local_record, local_tombs.get(id).copied(), remote_record, remote_tombs.get(id).copied())
        {
            Winner::RemoteRecord => {
                let Some(source) = remote.transactions.iter().find(|item| item.id == id) else {
                    continue;
                };
                if state.deleted_books.contains(&source.book_id)
                    || !repo::book_exists(conn, &source.book_id)?
                {
                    continue;
                }
                let mut incoming: Transaction = source.clone();
                if let Some(mapped) = state.category_map.get(&incoming.category_id) {
                    incoming.category_id = mapped.clone();
                }
                if let Some(account_id) = incoming.account_id.clone()
                    && !repo::account_exists(conn, &account_id)?
                {
                    incoming.account_id = None;
                }
                repo::upsert_transaction(conn, &incoming)?;
                clear_tombstone(conn, "transaction", id)?;
                if local.transactions.contains_key(id) {
                    state.summary.transactions.updated += 1;
                } else {
                    state.summary.transactions.added += 1;
                }
            }
            Winner::Tombstone => {
                if local.transactions.contains_key(id) {
                    let paths = repo::attachment_paths_for_transaction(conn, id)?;
                    state.files_to_delete.extend(paths);
                    if repo::delete_transaction(conn, id)? {
                        state.deleted_transactions.insert(id.to_string());
                        state.summary.transactions.deleted += 1;
                    }
                }
                repo::insert_tombstone(
                    conn,
                    "transaction",
                    id,
                    tombstone_ts(&local_tombs, &remote_tombs, id),
                )?;
            }
            _ => {}
        }
    }
    Ok(())
}

fn merge_attachments(
    conn: &rusqlite::Connection,
    local_data: &BackupData,
    remote: &BackupData,
    state: &mut MergeState,
) -> tk_ledger::LedgerResult<()> {
    let local = local_index(local_data);
    let local_tombs = local_tombstones(&local, "attachment");
    let remote_tombs = remote_tombstones(remote, "attachment");
    let ids: BTreeSet<&str> = local
        .attachments
        .keys()
        .copied()
        .chain(remote.attachments.iter().map(|item| item.id.as_str()))
        .chain(local_tombs.keys().copied())
        .chain(remote_tombs.keys().copied())
        .collect();

    for id in ids {
        let local_record = local.attachments.get(id).map(|item| item.created_at_ms);
        let remote_record = remote
            .attachments
            .iter()
            .find(|item| item.id == id)
            .map(|item| item.created_at_ms);
        match decide(local_record, local_tombs.get(id).copied(), remote_record, remote_tombs.get(id).copied())
        {
            Winner::RemoteRecord => {
                let Some(source) = remote.attachments.iter().find(|item| item.id == id) else {
                    continue;
                };
                // 账单已被删（本机 / 远端墓碑）→ 附件不写入。
                if state.deleted_transactions.contains(&source.transaction_id)
                    || !repo::transaction_exists(conn, &source.transaction_id)?
                {
                    continue;
                }
                repo::upsert_attachment(conn, source)?;
                clear_tombstone(conn, "attachment", id)?;
                state.files_to_ensure.push(source.path.clone());
                if local.attachments.contains_key(id) {
                    state.summary.attachments.updated += 1;
                } else {
                    state.summary.attachments.added += 1;
                }
            }
            Winner::LocalRecord => {
                if let Some(record) = local.attachments.get(id) {
                    state.files_to_ensure.push(record.path.clone());
                }
            }
            Winner::Tombstone => {
                if let Some(record) = local.attachments.get(id) {
                    state.files_to_delete.push(record.path.clone());
                    if repo::delete_attachment_row(conn, id)? {
                        state.summary.attachments.deleted += 1;
                    }
                }
                repo::insert_tombstone(
                    conn,
                    "attachment",
                    id,
                    tombstone_ts(&local_tombs, &remote_tombs, id),
                )?;
            }
            Winner::Absent => {}
        }
    }
    Ok(())
}

fn merge_recurring_rules(
    conn: &rusqlite::Connection,
    local_data: &BackupData,
    remote: &BackupData,
    state: &mut MergeState,
) -> tk_ledger::LedgerResult<()> {
    let local = local_index(local_data);
    let local_tombs = local_tombstones(&local, "recurring_rule");
    let remote_tombs = remote_tombstones(remote, "recurring_rule");
    let ids: BTreeSet<&str> = local
        .rules
        .keys()
        .copied()
        .chain(remote.recurring_rules.iter().map(|item| item.id.as_str()))
        .chain(local_tombs.keys().copied())
        .chain(remote_tombs.keys().copied())
        .collect();

    for id in ids {
        let local_record = local.rules.get(id).map(|item| item.updated_at_ms);
        let remote_record = remote
            .recurring_rules
            .iter()
            .find(|item| item.id == id)
            .map(|item| item.updated_at_ms);
        match decide(local_record, local_tombs.get(id).copied(), remote_record, remote_tombs.get(id).copied())
        {
            Winner::RemoteRecord => {
                let Some(source) = remote.recurring_rules.iter().find(|item| item.id == id) else {
                    continue;
                };
                if state.deleted_books.contains(&source.book_id)
                    || !repo::book_exists(conn, &source.book_id)?
                {
                    continue;
                }
                let mut incoming: RecurringRule = source.clone();
                if let Some(mapped) = state.category_map.get(&incoming.category_id) {
                    incoming.category_id = mapped.clone();
                }
                if let Some(account_id) = incoming.account_id.clone()
                    && !repo::account_exists(conn, &account_id)?
                {
                    incoming.account_id = None;
                }
                repo::upsert_recurring_rule(conn, &incoming)?;
                clear_tombstone(conn, "recurring_rule", id)?;
                if local.rules.contains_key(id) {
                    state.summary.recurring_rules.updated += 1;
                } else {
                    state.summary.recurring_rules.added += 1;
                }
            }
            Winner::Tombstone => {
                if local.rules.contains_key(id) {
                    let runs: i64 = conn.query_row(
                        "SELECT COUNT(*) FROM recurring_runs WHERE rule_id = ?1",
                        [id],
                        |row| row.get(0),
                    )?;
                    if repo::delete_recurring_rule(conn, id)? {
                        state.deleted_rules.insert(id.to_string());
                        state.summary.recurring_rules.deleted += 1;
                        state.summary.recurring_runs.deleted += runs;
                    }
                }
                repo::insert_tombstone(
                    conn,
                    "recurring_rule",
                    id,
                    tombstone_ts(&local_tombs, &remote_tombs, id),
                )?;
            }
            _ => {}
        }
    }
    Ok(())
}

fn merge_recurring_runs(
    conn: &rusqlite::Connection,
    local_data: &BackupData,
    remote: &BackupData,
    state: &mut MergeState,
) -> tk_ledger::LedgerResult<()> {
    let local = local_index(local_data);
    for run in &remote.recurring_runs {
        if state.deleted_rules.contains(&run.rule_id)
            || !repo::recurring_rule_exists(conn, &run.rule_id)?
        {
            continue;
        }
        let key = (run.rule_id.as_str(), run.day.as_str());
        if local.runs.contains(&key) {
            continue;
        }
        repo::upsert_recurring_run(conn, run)?;
        state.summary.recurring_runs.added += 1;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

fn tombstone_ts(local: &HashMap<&str, i64>, remote: &HashMap<&str, i64>, id: &str) -> i64 {
    local
        .get(id)
        .copied()
        .unwrap_or(0)
        .max(remote.get(id).copied().unwrap_or(0))
}

fn clear_tombstone(conn: &rusqlite::Connection, entity: &str, id: &str) -> tk_ledger::LedgerResult<()> {
    repo::delete_tombstone(conn, entity, id)?;
    Ok(())
}

fn unique_book_name(
    conn: &rusqlite::Connection,
    name: &str,
    own_id: Option<&str>,
) -> tk_ledger::LedgerResult<String> {
    if !repo::book_name_taken(conn, name, own_id)? {
        return Ok(name.to_string());
    }
    let base: String = name.chars().collect();
    for n in 2..100 {
        let suffix = format!(" ({n})");
        let keep = BOOK_NAME_MAX.saturating_sub(suffix.chars().count());
        let candidate = format!("{}{}", base.chars().take(keep).collect::<String>(), suffix);
        if !repo::book_name_taken(conn, &candidate, own_id)? {
            return Ok(candidate);
        }
    }
    Ok(format!("{}{}", base.chars().take(BOOK_NAME_MAX - 4).collect::<String>(), "副本"))
}

fn unique_category_name(
    conn: &rusqlite::Connection,
    kind: tk_domain::EntryKind,
    name: &str,
    own_id: Option<&str>,
) -> tk_ledger::LedgerResult<String> {
    if !repo::category_name_taken(conn, kind, name, own_id)? {
        return Ok(name.to_string());
    }
    let base: String = name.chars().collect();
    for n in 2..100 {
        let suffix = format!("{n}");
        let keep = CATEGORY_NAME_MAX.saturating_sub(suffix.chars().count());
        let candidate = format!("{}{}", base.chars().take(keep).collect::<String>(), suffix);
        if !repo::category_name_taken(conn, kind, &candidate, own_id)? {
            return Ok(candidate);
        }
    }
    Ok(format!("{}{}", base.chars().take(CATEGORY_NAME_MAX - 1).collect::<String>(), "x"))
}

/// 远端包内路径：`ledger/attachments/...` → `attachments/...`。
fn remote_relative(path: &str) -> Option<&str> {
    path.strip_prefix(LEDGER_PREFIX)
}

fn apply_files(
    data_root: &Path,
    remote_attachment_root: Option<&Path>,
    outcome: &MergeOutcome,
) -> BackupResult<()> {
    for relative in &outcome.files_to_delete {
        let target = data_root.join(relative);
        match fs::remove_file(&target) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(BackupError::Io(error)),
        }
        if let Some(parent) = target.parent() {
            let _ = fs::remove_dir(parent);
        }
    }
    if let Some(remote_root) = remote_attachment_root {
        for relative in &outcome.files_to_ensure {
            let Some(stripped) = remote_relative(relative) else {
                continue;
            };
            // 云端包布局是 `attachments/...`；测试 / 直拷场景可能给出含 `ledger/` 前缀的目录，两种都支持。
            let direct = remote_root.join(stripped);
            let prefixed = remote_root.join(relative);
            let source = if direct.exists() {
                direct
            } else if prefixed.exists() {
                prefixed
            } else {
                // 远端包缺文件：保留数据库记录，不阻塞合并（与导入口径一致）。
                continue;
            };
            let target = data_root.join(relative);
            if target.exists() && target.metadata().map(|item| item.len() > 0).unwrap_or(false) {
                continue;
            }
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(BackupError::Io)?;
            }
            fs::copy(&source, &target).map_err(BackupError::Io)?;
        }
    }
    Ok(())
}

/// 合并结果的数据计数（内部检查 / 日志用）。
pub fn merged_counts(remote: &BackupData) -> tk_domain::BackupCounts {
    counts_of(remote)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tk_domain::{EntryKind, NewRecurringRule, NewTransaction};
    use tk_ledger::seed;

    /// 测试设备：临时数据根 + 已迁移已种子的库 + 数据根路径。
    struct TestDevice {
        ledger: Ledger,
        dir: tempfile::TempDir,
    }

    impl TestDevice {
        fn new() -> Self {
            let dir = tempfile::TempDir::new().expect("temp dir");
            let ledger = Ledger::open(dir.path()).expect("open ledger");
            Self { ledger, dir }
        }

        fn data_root(&self) -> &Path {
            self.dir.path()
        }
    }

    impl std::ops::Deref for TestDevice {
        type Target = Ledger;

        fn deref(&self) -> &Self::Target {
            &self.ledger
        }
    }

    /// 构造两台设备的库：A 为「本机」，B 为「远端」。
    fn two_devices() -> (TestDevice, TestDevice) {
        (TestDevice::new(), TestDevice::new())
    }

    fn add_transaction(ledger: &Ledger, note: &str) -> Transaction {
        ledger
            .create_transaction(NewTransaction {
                book_id: seed::DEFAULT_BOOK_ID.to_string(),
                kind: EntryKind::Expense,
                category_id: "expense_food".to_string(),
                account_id: None,
                amount_cents: 100,
                note: note.to_string(),
                day: "2025-09-08".to_string(),
                month: "2025-09".to_string(),
                occurred_at_ms: 1,
            })
            .expect("create transaction")
    }

    #[test]
    fn merge_unions_transactions_from_both_devices() {
        let (a, b) = two_devices();
        add_transaction(&a, "本机");
        add_transaction(&b, "远端");

        let remote = crate::gather_data(&b).expect("gather b");
        let summary = merge_into(&a, a.data_root(), &remote, None).expect("merge");
        assert_eq!(summary.transactions.added, 1);
        assert_eq!(a.list_transactions_by_day(seed::DEFAULT_BOOK_ID, "2025-09-08").expect("list").len(), 2);
    }

    #[test]
    fn merge_applies_remote_deletion_without_resurrection() {
        let (a, b) = two_devices();
        let transaction = add_transaction(&a, "共享");
        let remote_from_a = crate::gather_data(&a).expect("gather a");
        // B 先恢复 A 的数据，再删除这笔账单。
        merge_into(&b, b.data_root(), &remote_from_a, None).expect("seed b");
        b.delete_transaction(&transaction.id).expect("delete on b");
        let remote = crate::gather_data(&b).expect("gather b");

        let summary = merge_into(&a, a.data_root(), &remote, None).expect("merge back");
        assert_eq!(summary.transactions.deleted, 1);
        assert!(
            a.get_transaction(&transaction.id).expect("get").is_none(),
            "被其它设备删除的账单不应复活"
        );
    }

    #[test]
    fn newer_update_beats_older_deletion() {
        let (a, b) = two_devices();
        let transaction = add_transaction(&a, "初始");
        let remote_from_a = crate::gather_data(&a).expect("gather a");
        merge_into(&b, b.data_root(), &remote_from_a, None).expect("seed b");

        // B 删除（较早），A 改成更新（较晚）。
        b.delete_transaction(&transaction.id).expect("delete");
        a.update_transaction(tk_domain::TransactionPatch {
            id: transaction.id.clone(),
            kind: EntryKind::Expense,
            category_id: "expense_food".to_string(),
            account_id: None,
            amount_cents: 999,
            note: "改晚了".to_string(),
            day: "2025-09-08".to_string(),
            month: "2025-09".to_string(),
            occurred_at_ms: 2,
        })
        .expect("update");

        let remote = crate::gather_data(&b).expect("gather b");
        merge_into(&a, a.data_root(), &remote, None).expect("merge");
        let kept = a.get_transaction(&transaction.id).expect("get").expect("kept");
        assert_eq!(kept.amount_cents, 999, "较新的更新应胜过较早的删除");
    }

    #[test]
    fn same_named_category_is_remapped_not_duplicated() {
        let (a, b) = two_devices();
        // 两台设备各自新建同名分类「宠物」。
        let cat_a = a
            .create_category(tk_domain::NewCategory {
                kind: EntryKind::Expense,
                name: "奶茶".to_string(),
                icon_name: "mdi:paw".to_string(),
                color: "theme".to_string(),
            })
            .expect("cat a");
        std::thread::sleep(std::time::Duration::from_millis(2));
        let cat_b = b
            .create_category(tk_domain::NewCategory {
                kind: EntryKind::Expense,
                name: "奶茶".to_string(),
                icon_name: "mdi:paw".to_string(),
                color: "theme".to_string(),
            })
            .expect("cat b");
        let transaction = b
            .create_transaction(NewTransaction {
                book_id: seed::DEFAULT_BOOK_ID.to_string(),
                kind: EntryKind::Expense,
                category_id: cat_b.id.clone(),
                account_id: None,
                amount_cents: 100,
                note: String::new(),
                day: "2025-09-08".to_string(),
                month: "2025-09".to_string(),
                occurred_at_ms: 1,
            })
            .expect("tx b");

        let remote = crate::gather_data(&b).expect("gather b");
        merge_into(&a, a.data_root(), &remote, None).expect("merge");
        let categories = a.list_categories(true).expect("categories");
        assert_eq!(
            categories.iter().filter(|item| item.name == "奶茶").count(),
            1,
            "同名分类应并入而不是并存"
        );
        let merged = a.get_transaction(&transaction.id).expect("get").expect("kept");
        assert_eq!(merged.category_id, cat_a.id, "远端账单应改指已有分类");
    }

    #[test]
    fn deleted_book_drops_remote_children() {
        let (a, b) = two_devices();
        let extra = a
            .create_book(tk_domain::NewBook {
                name: "装修账".to_string(),
            })
            .expect("create book");
        let remote_from_a = crate::gather_data(&a).expect("gather a");
        merge_into(&b, b.data_root(), &remote_from_a, None).expect("seed b");
        // B 在「装修账」里记一笔后，A 删除该账本。
        let transaction = b
            .create_transaction(NewTransaction {
                book_id: extra.id.clone(),
                kind: EntryKind::Expense,
                category_id: "expense_food".to_string(),
                account_id: None,
                amount_cents: 100,
                note: String::new(),
                day: "2025-09-08".to_string(),
                month: "2025-09".to_string(),
                occurred_at_ms: 1,
            })
            .expect("tx b");
        a.delete_book(&extra.id).expect("delete book");

        let remote = crate::gather_data(&b).expect("gather b");
        merge_into(&a, a.data_root(), &remote, None).expect("merge");
        assert!(
            a.get_transaction(&transaction.id).expect("get").is_none(),
            "账本已删除，远端子账单不应写回"
        );
        assert!(a.list_books().expect("books").iter().all(|item| item.id != extra.id));
    }

    #[test]
    fn missing_attachment_file_is_copied_from_remote_package() {
        let (a, b) = two_devices();
        let transaction = add_transaction(&a, "带图");
        let attachment = a
            .save_attachment(tk_domain::NewAttachment {
                transaction_id: transaction.id.clone(),
                mime: "image/png".to_string(),
                base64: "cG5n".to_string(),
            })
            .expect("save attachment");

        let remote = crate::gather_data(&a).expect("gather a");
        // 远端包目录 = A 的数据根（含 ledger/attachments/...），合并后 B 应有同内容文件
        merge_into(&b, b.data_root(), &remote, Some(a.data_root())).expect("merge");
        let copied = b.data_root().join(&attachment.path);
        assert!(copied.exists(), "合并后应从远端包补齐附件文件：{}", copied.display());
        assert_eq!(fs::read(&copied).expect("read"), b"png");

        // 反向：B 删除附件（墓碑），A 合并后文件应被删掉
        // （等 2ms 让删除时间戳严格晚于创建时间，避免同刻「记录优先」规则掩盖删除）
        std::thread::sleep(std::time::Duration::from_millis(2));
        b.delete_attachment(&attachment.id).expect("delete attachment");
        let remote_b = crate::gather_data(&b).expect("gather b");
        merge_into(&a, a.data_root(), &remote_b, Some(b.data_root())).expect("merge back");
        assert!(!a.data_root().join(&attachment.path).exists(), "墓碑胜出后应删除附件文件");
    }

    #[test]
    fn recurring_runs_are_unioned() {
        let (a, b) = two_devices();
        let rule = a
            .create_recurring_rule(NewRecurringRule {
                book_id: seed::DEFAULT_BOOK_ID.to_string(),
                kind: EntryKind::Expense,
                amount_cents: 500,
                note: String::new(),
                category_id: "expense_food".to_string(),
                account_id: None,
                start_day: "2025-09-01".to_string(),
            })
            .expect("rule");
        let remote_from_a = crate::gather_data(&a).expect("gather a");
        merge_into(&b, b.data_root(), &remote_from_a, None).expect("seed b");
        // B 补了一笔，A 也补了另一笔。
        b.run_recurring_entries(vec![tk_domain::RecurringOccurrence {
            rule_id: rule.id.clone(),
            day: "2025-09-02".to_string(),
            occurred_at_ms: 1,
        }])
        .expect("run b");
        a.run_recurring_entries(vec![tk_domain::RecurringOccurrence {
            rule_id: rule.id.clone(),
            day: "2025-09-03".to_string(),
            occurred_at_ms: 1,
        }])
        .expect("run a");

        let remote = crate::gather_data(&b).expect("gather b");
        let summary = merge_into(&a, a.data_root(), &remote, None).expect("merge");
        assert_eq!(summary.recurring_runs.added, 1);
        assert_eq!(a.list_recurring_runs().expect("runs").len(), 2);
    }
}
