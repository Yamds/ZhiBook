//! Layer 3 记账数据底座。
//!
//! 职责：SQLite(bundled) 持久化、统计聚合、附件落盘。
//! - 不依赖 Tauri / Tokio：命令层只做参数转换与错误边界（见 `src-tauri/src/commands/ledger.rs`）；
//! - 业务规则（校验、级联清理、软删除语义）都在 [`Ledger`] 的方法里，
//!   仓储函数只做 SQL；
//! - 数据根布局来自 `tk_config::DataPaths`：`<data_root>/ledger/ledger.db`
//!   与 `<data_root>/ledger/attachments/**`。

pub mod attachments;
pub mod dates;
pub mod error;
pub mod id;
pub mod query;
pub mod repo;
pub mod schema;
pub mod seed;
/// 内置分类种子数据（由 `pnpm run icons` 生成，勿手改）。
#[path = "seed_categories.generated.rs"]
pub mod seed_categories;
pub mod validate;

#[cfg(test)]
mod test_support;

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

use rusqlite::Connection;
use tk_config::DataPaths;
use tk_domain::{
    Account, AccountPatch, AssetsOverview, Attachment, AttachmentData, Book, BookPatch, Category,
    CategoryPatch, DaySummary, EntryKind, MAX_AMOUNT_CENTS, MonthStats, NewAccount, NewAttachment,
    NewBook, NewCategory, NewRecurringRule, NewTransaction, RecurringOccurrence, RecurringRule,
    RecurringRulePatch, RecurringRunResult, ShareBreakdown, StatsKind, Transaction,
    TransactionPatch, TransactionRank, YearSummary,
};

pub use attachments::AttachmentStore;
pub use error::{LedgerError, LedgerResult};
pub use schema::SCHEMA_VERSION;

/// 业务侧默认趋势回看月数。
pub const DEFAULT_TREND_MONTHS: usize = query::DEFAULT_TREND_MONTHS;

/// 明细页搜索结果上限（FR-DET-11；前端会提示「只显示前 N 条」）。
pub const SEARCH_RESULT_LIMIT: i64 = 200;

/// 记账数据入口：一个账本库 = 一个连接 + 一个附件仓库。
pub struct Ledger {
    conn: Mutex<Connection>,
    data_root: PathBuf,
    attachments: AttachmentStore,
}

impl Ledger {
    /// 打开（必要时创建）数据根下的记账库：建目录 → 开库 → 设 PRAGMA → 迁移 → 种子。
    pub fn open(data_root: impl AsRef<Path>) -> LedgerResult<Self> {
        let data_root = data_root.as_ref().to_path_buf();
        let paths = DataPaths::new(&data_root);
        create_dir(&paths.ledger_dir())?;
        create_dir(&paths.attachments_dir())?;

        let db_path = paths.ledger_db_path();
        let mut conn = Connection::open(&db_path)?;
        configure(&conn)?;
        schema::migrate(&mut conn)?;
        seed::seed_if_needed(&mut conn)?;

        Ok(Self {
            conn: Mutex::new(conn),
            attachments: AttachmentStore::new(data_root.clone()),
            data_root,
        })
    }

    pub fn data_root(&self) -> &Path {
        &self.data_root
    }

    /// 只读访问（内部使用；命令层请走下面的业务方法）。
    pub fn with_conn<T>(&self, run: impl FnOnce(&Connection) -> LedgerResult<T>) -> LedgerResult<T> {
        let guard = self.lock()?;
        run(&guard)
    }

    /// 事务访问：闭包返回 `Err` 时自动回滚。
    pub fn with_tx<T>(&self, run: impl FnOnce(&Connection) -> LedgerResult<T>) -> LedgerResult<T> {
        let mut guard = self.lock()?;
        let transaction = guard.transaction()?;
        let value = run(&transaction)?;
        transaction.commit()?;
        Ok(value)
    }

    fn lock(&self) -> LedgerResult<MutexGuard<'_, Connection>> {
        self.conn
            .lock()
            .map_err(|_| LedgerError::corrupt("数据库连接锁已损坏，请重启应用"))
    }

    // -----------------------------------------------------------------------
    // 账本
    // -----------------------------------------------------------------------

    pub fn list_books(&self) -> LedgerResult<Vec<Book>> {
        self.with_conn(repo::list_books)
    }

    pub fn create_book(&self, input: NewBook) -> LedgerResult<Book> {
        let name = validate::book_name(&input.name)?;
        self.with_tx(|conn| {
            let now = id::now_ms();
            let book = Book {
                id: id::new_id("book"),
                name: name.clone(),
                created_at_ms: now,
                updated_at_ms: now,
                sort_order: repo::next_book_sort_order(conn)?,
            };
            repo::insert_book(conn, &book)?;
            Ok(book)
        })
    }

    pub fn update_book(&self, input: BookPatch) -> LedgerResult<Book> {
        let name = validate::book_name(&input.name)?;
        self.with_tx(|conn| {
            if !repo::update_book_name(conn, &input.id, &name, id::now_ms())? {
                return Err(LedgerError::not_found(format!("账本不存在：{}", input.id)));
            }
            repo::get_book(conn, &input.id)?
                .ok_or_else(|| LedgerError::not_found(format!("账本不存在：{}", input.id)))
        })
    }

    /// 删除账本：数据库级联删除账单 / 账户（含附件行）→ 提交 → 再逐张清附件文件 → 修正当前账本指针。
    ///
    /// 最后一个账本不允许删除（FR-AST-5）。
    ///
    /// 顺序很重要：文件删除在事务提交**之后**。反过来的话，事务一旦回滚，
    /// 文件已经没了，库里却还留着指向它们的附件记录（附件是用户唯一副本）。
    pub fn delete_book(&self, id: &str) -> LedgerResult<()> {
        let paths = self.with_tx(|conn| {
            let book = repo::get_book(conn, id)?
                .ok_or_else(|| LedgerError::not_found(format!("账本不存在：{id}")))?;
            if repo::count_books(conn)? <= 1 {
                return Err(LedgerError::validation("至少保留一个账本"));
            }
            let paths = repo::attachment_paths_for_book(conn, &book.id)?;
            repo::insert_tombstone(conn, "book", &book.id, id::now_ms())?;
            repo::delete_book(conn, &book.id)?;
            seed::ensure_current_book(conn)?;
            Ok(paths)
        })?;
        self.cleanup_attachment_files(&paths);
        Ok(())
    }

    pub fn current_book_id(&self) -> LedgerResult<Option<String>> {
        self.with_conn(|conn| seed::get_meta(conn, seed::META_CURRENT_BOOK_KEY))
    }

    /// 全部墓碑（多设备合并 / 导出用）。
    pub fn list_tombstones(&self) -> LedgerResult<Vec<tk_domain::Tombstone>> {
        self.with_conn(repo::list_tombstones)
    }

    pub fn set_current_book(&self, book_id: &str) -> LedgerResult<()> {
        self.with_tx(|conn| {
            if !repo::book_exists(conn, book_id)? {
                return Err(LedgerError::not_found(format!("账本不存在：{book_id}")));
            }
            seed::set_meta(conn, seed::META_CURRENT_BOOK_KEY, book_id)
        })
    }

    // -----------------------------------------------------------------------
    // 账户
    // -----------------------------------------------------------------------

    /// 账户列表；`until_day`（含）之后的账单不计入余额，通常传今天。
    pub fn list_accounts(&self, book_id: &str, until_day: &str) -> LedgerResult<Vec<Account>> {
        if !dates::is_valid_day_key(until_day) {
            return Err(LedgerError::validation(format!(
                "日期格式不合法：{until_day}"
            )));
        }
        self.with_conn(|conn| repo::list_accounts(conn, book_id, until_day))
    }

    pub fn create_account(&self, input: NewAccount) -> LedgerResult<Account> {
        let name = validate::account_name(&input.name)?;
        validate::icon_name(&input.icon_name)?;
        validate::color(&input.color)?;
        validate_balance(input.initial_balance_cents, "初始余额")?;
        self.with_tx(move |conn| {
            if !repo::book_exists(conn, &input.book_id)? {
                return Err(LedgerError::not_found(format!(
                    "账本不存在：{}",
                    input.book_id
                )));
            }
            let now = id::now_ms();
            let account = Account {
                id: id::new_id("acc"),
                book_id: input.book_id.clone(),
                kind: input.kind,
                name,
                icon_name: input.icon_name,
                color: input.color,
                initial_balance_cents: input.initial_balance_cents,
                // 新账户还没有任何账单，当前余额 = 初始余额
                balance_cents: input.initial_balance_cents,
                sort_order: repo::next_account_sort_order(conn, &input.book_id)?,
                created_at_ms: now,
                updated_at_ms: now,
            };
            repo::insert_account(conn, &account)?;
            Ok(account)
        })
    }

    /// 更新账户；余额由账单聚合，不接受直接改写。
    pub fn update_account(&self, input: AccountPatch) -> LedgerResult<()> {
        let name = validate::account_name(&input.name)?;
        validate::icon_name(&input.icon_name)?;
        validate::color(&input.color)?;
        validate_balance(input.initial_balance_cents, "初始余额")?;
        self.with_tx(|conn| {
            let existing = repo::get_account_record(conn, &input.id)?
                .ok_or_else(|| LedgerError::not_found(format!("账户不存在：{}", input.id)))?;
            let account = Account {
                kind: input.kind,
                name,
                icon_name: input.icon_name,
                color: input.color,
                initial_balance_cents: input.initial_balance_cents,
                updated_at_ms: id::now_ms(),
                ..existing
            };
            repo::update_account(conn, &account)?;
            Ok(())
        })
    }

    /// 删除账户：历史账单保留并变为「未指定账户」（外键置空）。
    pub fn delete_account(&self, id: &str) -> LedgerResult<()> {
        self.with_tx(|conn| {
            if !repo::delete_account(conn, id)? {
                return Err(LedgerError::not_found(format!("账户不存在：{id}")));
            }
            repo::insert_tombstone(conn, "account", id, id::now_ms())?;
            Ok(())
        })
    }

    /// 按给定顺序重排账户；未列出的账户保持原相对顺序排在后面。
    pub fn reorder_accounts(&self, book_id: &str, ids: &[String]) -> LedgerResult<()> {
        self.with_tx(|conn| {
            let existing = repo::account_ids_in_order(conn, book_id)?;
            let ordered = apply_order(&existing, ids);
            for (index, id) in ordered.iter().enumerate() {
                repo::set_account_sort_order(conn, id, index as i64)?;
            }
            Ok(())
        })
    }

    // -----------------------------------------------------------------------
    // 分类（全局共享）
    // -----------------------------------------------------------------------

    pub fn list_categories(&self, include_hidden: bool) -> LedgerResult<Vec<Category>> {
        self.with_conn(|conn| repo::list_categories(conn, include_hidden))
    }

    pub fn create_category(&self, input: NewCategory) -> LedgerResult<Category> {
        let name = validate::category_name(&input.name)?;
        validate::icon_name(&input.icon_name)?;
        validate::color(&input.color)?;
        self.with_tx(|conn| {
            if repo::category_name_taken(conn, input.kind, &name, None)? {
                return Err(LedgerError::validation("同类型下已存在同名分类"));
            }
            let now = id::now_ms();
            let category = Category {
                id: id::new_id("cat"),
                kind: input.kind,
                name,
                icon_name: input.icon_name,
                color: input.color,
                sort_order: repo::next_category_sort_order(conn, input.kind)?,
                hidden: false,
                created_at_ms: now,
                updated_at_ms: now,
            };
            repo::insert_category(conn, &category)?;
            Ok(category)
        })
    }

    pub fn update_category(&self, input: CategoryPatch) -> LedgerResult<()> {
        let name = validate::category_name(&input.name)?;
        validate::icon_name(&input.icon_name)?;
        validate::color(&input.color)?;
        self.with_tx(|conn| {
            let existing = repo::get_category(conn, &input.id)?
                .ok_or_else(|| LedgerError::not_found(format!("分类不存在：{}", input.id)))?;
            if repo::category_name_taken(conn, existing.kind, &name, Some(&input.id))? {
                return Err(LedgerError::validation("同类型下已存在同名分类"));
            }
            let category = Category {
                name,
                icon_name: input.icon_name,
                color: input.color,
                updated_at_ms: id::now_ms(),
                ..existing
            };
            repo::update_category(conn, &category)?;
            Ok(())
        })
    }

    /// 软删除分类（FR-ADD-7 / Q4）：历史账单继续显示原分类。
    pub fn hide_category(&self, id: &str) -> LedgerResult<()> {
        self.with_tx(|conn| {
            if !repo::hide_category(conn, id, id::now_ms())? {
                return Err(LedgerError::not_found(format!("分类不存在：{id}")));
            }
            Ok(())
        })
    }

    /// 按给定顺序重排某组分类。
    pub fn reorder_categories(&self, kind: EntryKind, ids: &[String]) -> LedgerResult<()> {
        self.with_tx(|conn| {
            let existing = repo::category_ids_in_order(conn, kind)?;
            let ordered = apply_order(&existing, ids);
            for (index, id) in ordered.iter().enumerate() {
                repo::set_category_sort_order(conn, id, index as i64)?;
            }
            Ok(())
        })
    }

    // -----------------------------------------------------------------------
    // 账单
    // -----------------------------------------------------------------------

    /// 某天的账单（时间倒序）。
    pub fn list_transactions_by_day(
        &self,
        book_id: &str,
        day: &str,
    ) -> LedgerResult<Vec<Transaction>> {
        if !dates::is_valid_day_key(day) {
            return Err(LedgerError::validation(format!("日期格式不合法：{day}")));
        }
        self.with_conn(|conn| repo::list_transactions_by_day(conn, book_id, day))
    }

    /// 日期区间内的账单（倒序，最多 `limit` 条），明细页按天懒加载用。
    pub fn list_transactions_range(
        &self,
        book_id: &str,
        from_day: &str,
        to_day: &str,
        limit: i64,
    ) -> LedgerResult<Vec<Transaction>> {
        if !dates::is_valid_day_key(from_day) || !dates::is_valid_day_key(to_day) {
            return Err(LedgerError::validation("日期格式不合法"));
        }
        self.with_conn(|conn| {
            repo::list_transactions_range(conn, book_id, from_day, to_day, limit.clamp(1, 200))
        })
    }

    pub fn get_transaction(&self, id: &str) -> LedgerResult<Option<Transaction>> {
        self.with_conn(|conn| repo::get_transaction(conn, id))
    }

    /// 明细页搜索（FR-DET-10）：备注 / 分类名包含关键字，按时间倒序，最多 [`SEARCH_RESULT_LIMIT`] 条。
    pub fn search_transactions(
        &self,
        book_id: &str,
        keyword: &str,
        limit: i64,
    ) -> LedgerResult<Vec<Transaction>> {
        let pattern = validate::like_pattern(keyword)?;
        self.with_conn(|conn| {
            repo::search_transactions(conn, book_id, &pattern, limit.clamp(1, SEARCH_RESULT_LIMIT))
        })
    }

    pub fn create_transaction(&self, input: NewTransaction) -> LedgerResult<Transaction> {
        validate::amount_cents(input.amount_cents)?;
        let note = validate::note(&input.note)?;
        validate::day_and_month(&input.day, &input.month)?;
        let account_id = normalize_optional_id(input.account_id);
        self.with_tx(move |conn| {
            ensure_transaction_refs(
                conn,
                &input.book_id,
                input.kind,
                &input.category_id,
                account_id.as_deref(),
            )?;
            let now = id::now_ms();
            let transaction = Transaction {
                id: id::new_id("tx"),
                book_id: input.book_id,
                kind: input.kind,
                category_id: input.category_id,
                account_id,
                amount_cents: input.amount_cents,
                note,
                day: input.day,
                month: input.month,
                occurred_at_ms: input.occurred_at_ms,
                created_at_ms: now,
                updated_at_ms: now,
            };
            repo::insert_transaction(conn, &transaction)?;
            Ok(transaction)
        })
    }

    /// 编辑账单（Q3）：账本不变，其余字段整体覆盖。
    pub fn update_transaction(&self, input: TransactionPatch) -> LedgerResult<()> {
        validate::amount_cents(input.amount_cents)?;
        let note = validate::note(&input.note)?;
        validate::day_and_month(&input.day, &input.month)?;
        let account_id = normalize_optional_id(input.account_id);
        self.with_tx(move |conn| {
            let existing = repo::get_transaction(conn, &input.id)?
                .ok_or_else(|| LedgerError::not_found(format!("账单不存在：{}", input.id)))?;
            ensure_transaction_refs(
                conn,
                &existing.book_id,
                input.kind,
                &input.category_id,
                account_id.as_deref(),
            )?;
            let transaction = Transaction {
                kind: input.kind,
                category_id: input.category_id,
                account_id,
                amount_cents: input.amount_cents,
                note,
                day: input.day,
                month: input.month,
                occurred_at_ms: input.occurred_at_ms,
                updated_at_ms: id::now_ms(),
                ..existing
            };
            repo::update_transaction(conn, &transaction)?;
            Ok(())
        })
    }

    /// 删除账单：提交数据库（含墓碑、附件行级联）→ 再逐张清附件文件。
    ///
    /// 与 [`Self::delete_book`] 同理：文件删除必须在事务提交之后。
    pub fn delete_transaction(&self, id: &str) -> LedgerResult<()> {
        let (transaction_id, paths) = self.with_tx(|conn| {
            let transaction = repo::get_transaction(conn, id)?
                .ok_or_else(|| LedgerError::not_found(format!("账单不存在：{id}")))?;
            let paths = repo::attachment_paths_for_transaction(conn, &transaction.id)?;
            repo::insert_tombstone(conn, "transaction", &transaction.id, id::now_ms())?;
            repo::delete_transaction(conn, &transaction.id)?;
            Ok((transaction.id, paths))
        })?;
        self.cleanup_attachment_files(&paths);
        self.attachments.remove_transaction_dir(&transaction_id);
        Ok(())
    }

    /// 提交后的附件文件清理：**尽力而为**，失败只告警不回滚。
    ///
    /// 数据库此时已经是最终状态；留下一个孤儿文件比「回滚后库里留着一条
    /// 指向已删文件的记录」安全得多（后者用户能看到坏图且无法自愈）。
    fn cleanup_attachment_files(&self, relative_paths: &[String]) {
        if relative_paths.is_empty() {
            return;
        }
        if let Err(error) = self.attachments.remove_files(relative_paths) {
            tracing::warn!(
                target: "tk_ledger::attachments",
                %error,
                count = relative_paths.len(),
                "附件文件清理失败；数据库已提交，仅留下孤儿文件"
            );
        }
    }

    // -----------------------------------------------------------------------
    // 统计
    // -----------------------------------------------------------------------

    pub fn month_stats(&self, book_id: &str, month: &str) -> LedgerResult<MonthStats> {
        self.with_conn(|conn| query::month_stats(conn, book_id, month))
    }

    pub fn year_summary(&self, book_id: &str, year: i32) -> LedgerResult<YearSummary> {
        self.with_conn(|conn| query::year_summary(conn, book_id, year))
    }

    /// 单月占比 / 排行（三种口径）。
    pub fn month_share_breakdown(
        &self,
        book_id: &str,
        month: &str,
    ) -> LedgerResult<ShareBreakdown> {
        self.with_conn(|conn| query::share_breakdown(conn, book_id, month, month))
    }

    /// 以 `end_month` 结尾、向前 `months` 个月的占比（环形图口径，可跨年）。
    pub fn period_share_breakdown(
        &self,
        book_id: &str,
        end_month: &str,
        months: usize,
    ) -> LedgerResult<ShareBreakdown> {
        self.with_conn(|conn| {
            let months = dates::trailing_months(end_month, months.max(1))
                .ok_or_else(|| LedgerError::validation(format!("月份格式不合法：{end_month}")))?;
            let from = months
                .first()
                .cloned()
                .ok_or_else(|| LedgerError::validation("月份区间为空"))?;
            let to = months
                .last()
                .cloned()
                .ok_or_else(|| LedgerError::validation("月份区间为空"))?;
            query::share_breakdown(conn, book_id, &from, &to)
        })
    }

    pub fn transaction_ranks(
        &self,
        book_id: &str,
        month: &str,
        kind: StatsKind,
        limit: i64,
    ) -> LedgerResult<Vec<TransactionRank>> {
        self.with_conn(|conn| query::transaction_ranks(conn, book_id, month, kind, limit))
    }

    /// 一整年的单笔排行（年度视图，与月度排行同一套口径）。
    pub fn year_transaction_ranks(
        &self,
        book_id: &str,
        year: i32,
        kind: StatsKind,
        limit: i64,
    ) -> LedgerResult<Vec<TransactionRank>> {
        self.with_conn(|conn| query::year_transaction_ranks(conn, book_id, year, kind, limit))
    }

    pub fn day_summaries(&self, book_id: &str, month: &str) -> LedgerResult<Vec<DaySummary>> {
        self.with_conn(|conn| query::day_summaries(conn, book_id, month))
    }

    pub fn assets_overview(
        &self,
        book_id: &str,
        until_day: &str,
        months: usize,
    ) -> LedgerResult<AssetsOverview> {
        self.with_conn(|conn| query::assets_overview(conn, book_id, until_day, months))
    }

    // -----------------------------------------------------------------------
    // 附件
    // -----------------------------------------------------------------------

    pub fn list_attachments(&self, transaction_id: &str) -> LedgerResult<Vec<Attachment>> {
        self.with_conn(|conn| repo::list_attachments(conn, transaction_id))
    }

    pub fn save_attachment(&self, input: NewAttachment) -> LedgerResult<Attachment> {
        self.with_tx(|conn| {
            let transaction = repo::get_transaction(conn, &input.transaction_id)?.ok_or_else(|| {
                LedgerError::not_found(format!("账单不存在：{}", input.transaction_id))
            })?;
            self.attachments
                .save(conn, &transaction.id, &input.mime, &input.base64)
        })
    }

    pub fn read_attachment(&self, attachment_id: &str) -> LedgerResult<AttachmentData> {
        self.with_conn(|conn| self.attachments.read(conn, attachment_id))
    }

    pub fn delete_attachment(&self, attachment_id: &str) -> LedgerResult<()> {
        let path = self.with_tx(|conn| {
            let attachment = repo::get_attachment(conn, attachment_id)?
                .ok_or_else(|| LedgerError::not_found(format!("附件不存在：{attachment_id}")))?;
            repo::insert_tombstone(conn, "attachment", attachment_id, id::now_ms())?;
            repo::delete_attachment_row(conn, attachment_id)?;
            Ok(attachment.path)
        })?;
        self.cleanup_attachment_files(std::slice::from_ref(&path));
        Ok(())
    }

    // -----------------------------------------------------------------------
    // 固定收支（每日）
    // -----------------------------------------------------------------------

    pub fn list_recurring_rules(&self) -> LedgerResult<Vec<RecurringRule>> {
        self.with_conn(repo::list_recurring_rules)
    }

    /// 全部固定收支台账（云端备份 / 合并用）。
    pub fn list_recurring_runs(&self) -> LedgerResult<Vec<tk_domain::RecurringRun>> {
        self.with_conn(repo::list_recurring_runs)
    }

    /// 新建固定收支规则：`start_day` 由前端按本地时区给出（创建时刻之后的下一个 05:00）。
    pub fn create_recurring_rule(&self, input: NewRecurringRule) -> LedgerResult<RecurringRule> {
        validate::amount_cents(input.amount_cents)?;
        let note = validate::note(&input.note)?;
        if !dates::is_valid_day_key(&input.start_day) {
            return Err(LedgerError::validation(format!(
                "日期格式不合法：{}",
                input.start_day
            )));
        }
        let account_id = normalize_optional_id(input.account_id);
        self.with_tx(move |conn| {
            ensure_transaction_refs(
                conn,
                &input.book_id,
                input.kind,
                &input.category_id,
                account_id.as_deref(),
            )?;
            let now = id::now_ms();
            let rule = RecurringRule {
                id: id::new_id("rec"),
                book_id: input.book_id,
                kind: input.kind,
                amount_cents: input.amount_cents,
                note,
                category_id: input.category_id,
                account_id,
                enabled: true,
                start_day: input.start_day,
                last_run_day: None,
                created_at_ms: now,
                updated_at_ms: now,
            };
            repo::insert_recurring_rule(conn, &rule)?;
            Ok(rule)
        })
    }

    /// 编辑规则；`start_day` 保持不变（不允许把生效日改到更早，避免补出创建前的账单）。
    pub fn update_recurring_rule(&self, input: RecurringRulePatch) -> LedgerResult<()> {
        validate::amount_cents(input.amount_cents)?;
        let note = validate::note(&input.note)?;
        if let Some(day) = input.skip_through_day.as_deref()
            && !dates::is_valid_day_key(day)
        {
            return Err(LedgerError::validation(format!("日期格式不合法：{day}")));
        }
        let account_id = normalize_optional_id(input.account_id);
        self.with_tx(move |conn| {
            let existing = repo::get_recurring_rule(conn, &input.id)?
                .ok_or_else(|| LedgerError::not_found(format!("固定收支不存在：{}", input.id)))?;
            ensure_transaction_refs(
                conn,
                &existing.book_id,
                input.kind,
                &input.category_id,
                account_id.as_deref(),
            )?;
            let mut rule = RecurringRule {
                kind: input.kind,
                amount_cents: input.amount_cents,
                note,
                category_id: input.category_id,
                account_id,
                enabled: input.enabled,
                updated_at_ms: id::now_ms(),
                ..existing
            };
            // 停用 → 启用：把暂停期间视为已处理（暂停不补记）。
            if input.enabled
                && let Some(skip) = input.skip_through_day
                && rule.last_run_day.as_deref().is_none_or(|last| skip.as_str() > last)
            {
                rule.last_run_day = Some(skip);
            }
            repo::update_recurring_rule(conn, &rule)?;
            Ok(())
        })
    }

    /// 删除规则；已生成的账单保留。
    pub fn delete_recurring_rule(&self, id: &str) -> LedgerResult<()> {
        self.with_tx(|conn| {
            if !repo::delete_recurring_rule(conn, id)? {
                return Err(LedgerError::not_found(format!("固定收支不存在：{id}")));
            }
            repo::insert_tombstone(conn, "recurring_rule", id, id::now_ms())?;
            Ok(())
        })
    }

    /// 补账：对每个 `(rule, day)` 幂等生成一笔账单（同一天最多一笔）。
    ///
    /// 校验顺序：规则存在 → 启用 → `day >= start_day`（绝不补到创建之前）
    /// → 台账去重。
    pub fn run_recurring_entries(
        &self,
        occurrences: Vec<RecurringOccurrence>,
    ) -> LedgerResult<RecurringRunResult> {
        self.with_tx(move |conn| {
            let now = id::now_ms();
            let mut created = Vec::new();
            for occurrence in occurrences {
                if !dates::is_valid_day_key(&occurrence.day) {
                    continue;
                }
                let Some(rule) = repo::get_recurring_rule(conn, &occurrence.rule_id)? else {
                    continue;
                };
                if !rule.enabled || occurrence.day.as_str() < rule.start_day.as_str() {
                    continue;
                }
                // 已经处理过的日期（含暂停期间跳过的）不再补。
                if rule
                    .last_run_day
                    .as_deref()
                    .is_some_and(|last| occurrence.day.as_str() <= last)
                {
                    continue;
                }
                if repo::recurring_run_exists(conn, &rule.id, &occurrence.day)? {
                    continue;
                }
                let month = dates::month_key_of_day(&occurrence.day)
                    .ok_or_else(|| LedgerError::validation("日期格式不合法"))?;
                ensure_transaction_refs(
                    conn,
                    &rule.book_id,
                    rule.kind,
                    &rule.category_id,
                    rule.account_id.as_deref(),
                )?;
                let transaction = Transaction {
                    id: id::new_id("tx"),
                    book_id: rule.book_id.clone(),
                    kind: rule.kind,
                    category_id: rule.category_id.clone(),
                    account_id: rule.account_id.clone(),
                    amount_cents: rule.amount_cents,
                    note: rule.note.clone(),
                    day: occurrence.day.clone(),
                    month,
                    occurred_at_ms: occurrence.occurred_at_ms,
                    created_at_ms: now,
                    updated_at_ms: now,
                };
                repo::insert_transaction(conn, &transaction)?;
                repo::insert_recurring_run(conn, &rule.id, &occurrence.day, &transaction.id, now)?;
                if rule
                    .last_run_day
                    .as_deref()
                    .is_none_or(|last| occurrence.day.as_str() > last)
                {
                    repo::set_recurring_last_run(conn, &rule.id, &occurrence.day, now)?;
                }
                created.push(transaction.id);
            }
            Ok(RecurringRunResult {
                created_count: created.len() as i64,
                transaction_ids: created,
            })
        })
    }
}

/// 打开数据库时的 PRAGMA。
fn configure(conn: &Connection) -> LedgerResult<()> {
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA foreign_keys = ON;
         PRAGMA busy_timeout = 5000;",
    )?;
    Ok(())
}

/// rusqlite 的 `Connection::open` 失败信息里已带路径，这里直接透传。
fn create_dir(path: &Path) -> LedgerResult<()> {
    fs::create_dir_all(path).map_err(|error| LedgerError::io_at(path, error))
}

/// 空字符串按「未指定」处理（前端清空选择时会传空串）。
fn normalize_optional_id(value: Option<String>) -> Option<String> {
    value.filter(|id| !id.trim().is_empty())
}

fn validate_balance(cents: i64, label: &str) -> LedgerResult<()> {
    if cents.abs() > MAX_AMOUNT_CENTS {
        return Err(LedgerError::validation(format!("{label}超出上限")));
    }
    Ok(())
}

/// 账单引用的账本 / 分类 / 账户必须存在且相互匹配。
fn ensure_transaction_refs(
    conn: &Connection,
    book_id: &str,
    kind: EntryKind,
    category_id: &str,
    account_id: Option<&str>,
) -> LedgerResult<()> {
    if !repo::book_exists(conn, book_id)? {
        return Err(LedgerError::not_found(format!("账本不存在：{book_id}")));
    }
    let category = repo::get_category(conn, category_id)?
        .ok_or_else(|| LedgerError::not_found(format!("分类不存在：{category_id}")))?;
    if category.kind != kind {
        return Err(LedgerError::validation("分类与收支类型不一致"));
    }
    if let Some(account_id) = account_id
        && !repo::account_belongs_to_book(conn, account_id, book_id)?
    {
        return Err(LedgerError::validation("账户不属于当前账本"));
    }
    Ok(())
}

/// 把「期望顺序」应用到「现有顺序」上：未列出 / 不存在的 id 保持原相对顺序排后。
fn apply_order(existing: &[String], requested: &[String]) -> Vec<String> {
    let mut ordered: Vec<String> = Vec::with_capacity(existing.len());
    for id in requested {
        if existing.contains(id) && !ordered.contains(id) {
            ordered.push(id.clone());
        }
    }
    for id in existing {
        if !ordered.contains(id) {
            ordered.push(id.clone());
        }
    }
    ordered
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TestLedger;

    #[test]
    fn open_is_idempotent_and_seeds_once() {
        let temp = tempfile::TempDir::new().expect("temp dir");
        let first = Ledger::open(temp.path()).expect("first open");
        let books = first.list_books().expect("books");
        assert_eq!(books.len(), 1);
        assert_eq!(books[0].id, seed::DEFAULT_BOOK_ID);
        let categories = first.list_categories(true).expect("categories");
        assert_eq!(categories.len(), 47);
        drop(first);

        let second = Ledger::open(temp.path()).expect("second open");
        assert_eq!(second.list_books().expect("books").len(), 1);
        assert_eq!(second.list_categories(true).expect("categories").len(), 47);
    }

    #[test]
    fn last_book_cannot_be_deleted() {
        let ledger = TestLedger::new();
        let error = ledger.delete_book(seed::DEFAULT_BOOK_ID).expect_err("拒绝");
        assert!(matches!(error, LedgerError::Validation(_)), "{error:?}");
    }

    #[test]
    fn deleting_current_book_moves_pointer_to_remaining_book() {
        let ledger = TestLedger::new();
        let extra = ledger
            .create_book(NewBook {
                name: "旅行账".to_string(),
            })
            .expect("create book");
        ledger.set_current_book(&extra.id).expect("set current");
        ledger.delete_book(&extra.id).expect("delete book");
        assert_eq!(
            ledger.current_book_id().expect("current").as_deref(),
            Some(seed::DEFAULT_BOOK_ID)
        );
    }

    #[test]
    fn search_rejects_blank_keyword_and_finds_seeded_notes() {
        let ledger = TestLedger::new();
        assert!(ledger.search_transactions("book_default", "   ", 50).is_err());
        // 种子数据里没有账单，搜索返回空而不是报错
        assert!(
            ledger
                .search_transactions("book_default", "早餐", 50)
                .expect("search")
                .is_empty()
        );
    }

    #[test]
    fn hard_deletes_write_tombstones() {
        let ledger = TestLedger::new();
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
            .expect("create transaction");
        ledger
            .delete_transaction(&transaction.id)
            .expect("delete transaction");

        let account = ledger
            .create_account(NewAccount {
                book_id: book_id.clone(),
                kind: tk_domain::AccountKind::Asset,
                name: "现金".to_string(),
                icon_name: "mdi:cash".to_string(),
                color: "theme".to_string(),
                initial_balance_cents: 0,
            })
            .expect("create account");
        ledger.delete_account(&account.id).expect("delete account");

        let rule = sample_rule(&ledger, "2025-09-10");
        ledger
            .delete_recurring_rule(&rule.id)
            .expect("delete rule");

        let extra_book = ledger
            .create_book(NewBook {
                name: "旅行账".to_string(),
            })
            .expect("create book");
        ledger.delete_book(&extra_book.id).expect("delete book");

        let tombstones = ledger.list_tombstones().expect("tombstones");
        let has = |entity: &str, id: &str| {
            tombstones
                .iter()
                .any(|item| item.entity == entity && item.entity_id == id && item.deleted_at_ms > 0)
        };
        assert!(has("transaction", &transaction.id), "{tombstones:?}");
        assert!(has("account", &account.id), "{tombstones:?}");
        assert!(has("recurring_rule", &rule.id), "{tombstones:?}");
        assert!(has("book", &extra_book.id), "{tombstones:?}");
        // 软删除（分类 hidden）不写墓碑
        assert!(!tombstones.iter().any(|item| item.entity == "category"));
    }

    #[test]
    fn attachment_delete_writes_tombstone() {
        let ledger = TestLedger::new();
        let transaction = ledger
            .create_transaction(NewTransaction {
                book_id: seed::DEFAULT_BOOK_ID.to_string(),
                kind: EntryKind::Expense,
                category_id: "expense_food".to_string(),
                account_id: None,
                amount_cents: 100,
                note: String::new(),
                day: "2025-09-08".to_string(),
                month: "2025-09".to_string(),
                occurred_at_ms: 1,
            })
            .expect("create transaction");
        let attachment = ledger
            .save_attachment(NewAttachment {
                transaction_id: transaction.id.clone(),
                mime: "image/png".to_string(),
                base64: "cG5n".to_string(),
            })
            .expect("save attachment");
        ledger
            .delete_attachment(&attachment.id)
            .expect("delete attachment");
        let tombstones = ledger.list_tombstones().expect("tombstones");
        assert!(tombstones.iter().any(|item| {
            item.entity == "attachment" && item.entity_id == attachment.id
        }));
    }

    #[test]
    fn apply_order_keeps_unlisted_ids_at_the_end() {
        let existing = vec!["a".to_string(), "b".to_string(), "c".to_string()];
        let requested = vec!["c".to_string(), "nope".to_string(), "a".to_string()];
        assert_eq!(apply_order(&existing, &requested), vec!["c", "a", "b"]);
    }

    fn sample_rule(ledger: &Ledger, start_day: &str) -> RecurringRule {
        ledger
            .create_recurring_rule(NewRecurringRule {
                book_id: seed::DEFAULT_BOOK_ID.to_string(),
                kind: EntryKind::Expense,
                amount_cents: 1234,
                note: "早餐".to_string(),
                category_id: "expense_food".to_string(),
                account_id: None,
                start_day: start_day.to_string(),
            })
            .expect("create rule")
    }

    #[test]
    fn recurring_entries_are_idempotent_and_never_before_start_day() {
        let ledger = TestLedger::new();
        let rule = sample_rule(&ledger, "2025-09-10");
        let occurrence = |day: &str| RecurringOccurrence {
            rule_id: rule.id.clone(),
            day: day.to_string(),
            occurred_at_ms: 1,
        };

        let result = ledger
            .run_recurring_entries(vec![
                occurrence("2025-09-09"), // 早于 start_day → 不补
                occurrence("2025-09-10"),
                occurrence("2025-09-10"), // 重复 → 幂等
                occurrence("2025-09-11"),
            ])
            .expect("run");
        assert_eq!(result.created_count, 2);
        assert_eq!(
            ledger
                .list_transactions_by_day(seed::DEFAULT_BOOK_ID, "2025-09-10")
                .expect("10 日")
                .len(),
            1
        );
        assert_eq!(
            ledger
                .list_transactions_by_day(seed::DEFAULT_BOOK_ID, "2025-09-11")
                .expect("11 日")
                .len(),
            1
        );
        let stored = ledger
            .list_recurring_rules()
            .expect("rules")
            .into_iter()
            .find(|item| item.id == rule.id)
            .expect("rule");
        assert_eq!(stored.last_run_day.as_deref(), Some("2025-09-11"));
    }

    #[test]
    fn disabled_rule_does_not_run_and_paused_window_is_skipped_on_reenable() {
        let ledger = TestLedger::new();
        let rule = sample_rule(&ledger, "2025-09-01");

        // 停用期间不生成
        ledger
            .update_recurring_rule(RecurringRulePatch {
                id: rule.id.clone(),
                kind: EntryKind::Expense,
                amount_cents: 1234,
                note: "早餐".to_string(),
                category_id: "expense_food".to_string(),
                account_id: None,
                enabled: false,
                skip_through_day: None,
            })
            .expect("disable");
        let occurrence = |day: &str| RecurringOccurrence {
            rule_id: rule.id.clone(),
            day: day.to_string(),
            occurred_at_ms: 1,
        };
        assert_eq!(
            ledger
                .run_recurring_entries(vec![occurrence("2025-09-03")])
                .expect("disabled run")
                .created_count,
            0
        );

        // 重新启用：暂停窗口视为已处理
        ledger
            .update_recurring_rule(RecurringRulePatch {
                id: rule.id.clone(),
                kind: EntryKind::Expense,
                amount_cents: 1234,
                note: "早餐".to_string(),
                category_id: "expense_food".to_string(),
                account_id: None,
                enabled: true,
                skip_through_day: Some("2025-09-05".to_string()),
            })
            .expect("reenable");
        assert_eq!(
            ledger
                .run_recurring_entries(vec![occurrence("2025-09-05"), occurrence("2025-09-06")])
                .expect("reenable run")
                .created_count,
            1
        );
    }
}
