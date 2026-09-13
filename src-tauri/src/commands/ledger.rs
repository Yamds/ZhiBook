//! 记账 IPC 命令：只做参数转换、状态取得与错误边界。
//!
//! 业务规则全在 `tk-ledger`；这里不写 SQL、不做校验。
//! 所有命令都是 async + `spawn_blocking`：SQLite 是阻塞 IO，不能占住主线程。
//! 命令名只允许出现在前端 `src/core/services/ledger.service.ts`。

use std::sync::Arc;

use tauri::State;
use tk_domain::{
    Account, AccountPatch, AssetsOverview, Attachment, AttachmentData, Book, BookPatch, Category,
    CategoryPatch, DaySummary, EntryKind, MonthStats, NewAccount, NewAttachment, NewBook,
    NewCategory, NewRecurringRule, NewTransaction, RecurringOccurrence, RecurringRule,
    RecurringRulePatch, RecurringRunResult, ReorderRequest, ShareBreakdown, StatsKind, Transaction,
    TransactionPatch, TransactionRank, YearSummary,
};
use tk_ledger::{Ledger, LedgerError};

use crate::AppState;

/// 命令统一返回字符串错误（前端 InfoBar 直接展示）。
type CommandResult<T> = Result<T, String>;

/// 把阻塞的记账操作挪到后台线程执行。
async fn run<T, F>(ledger: Arc<Ledger>, task: F) -> CommandResult<T>
where
    T: Send + 'static,
    F: FnOnce(&Ledger) -> Result<T, LedgerError> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || task(&ledger).map_err(|error| error.to_string()))
        .await
        .map_err(|error| format!("后台任务异常：{error}"))?
}

/// 记账库句柄（启动失败时给出可展示的错误）。
fn handle(state: &State<'_, AppState>) -> CommandResult<Arc<Ledger>> {
    state.ledger.clone().map_err(|error| error.to_owned())
}

// ---------------------------------------------------------------------------
// 账本
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_books(state: State<'_, AppState>) -> CommandResult<Vec<Book>> {
    run(handle(&state)?, |ledger| ledger.list_books()).await
}

#[tauri::command]
pub async fn get_current_book(state: State<'_, AppState>) -> CommandResult<Option<String>> {
    run(handle(&state)?, |ledger| ledger.current_book_id()).await
}

#[tauri::command]
pub async fn create_book(state: State<'_, AppState>, input: NewBook) -> CommandResult<Book> {
    run(handle(&state)?, move |ledger| ledger.create_book(input)).await
}

#[tauri::command]
pub async fn update_book(state: State<'_, AppState>, input: BookPatch) -> CommandResult<Book> {
    run(handle(&state)?, move |ledger| ledger.update_book(input)).await
}

#[tauri::command]
pub async fn delete_book(state: State<'_, AppState>, id: String) -> CommandResult<()> {
    run(handle(&state)?, move |ledger| ledger.delete_book(&id)).await
}

#[tauri::command]
pub async fn set_current_book(state: State<'_, AppState>, id: String) -> CommandResult<()> {
    run(handle(&state)?, move |ledger| ledger.set_current_book(&id)).await
}

// ---------------------------------------------------------------------------
// 账户
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_accounts(
    state: State<'_, AppState>,
    book_id: String,
    until_day: String,
) -> CommandResult<Vec<Account>> {
    run(handle(&state)?, move |ledger| {
        ledger.list_accounts(&book_id, &until_day)
    })
    .await
}

#[tauri::command]
pub async fn create_account(
    state: State<'_, AppState>,
    input: NewAccount,
) -> CommandResult<Account> {
    run(handle(&state)?, move |ledger| ledger.create_account(input)).await
}

#[tauri::command]
pub async fn update_account(
    state: State<'_, AppState>,
    input: AccountPatch,
) -> CommandResult<()> {
    run(handle(&state)?, move |ledger| ledger.update_account(input)).await
}

#[tauri::command]
pub async fn delete_account(state: State<'_, AppState>, id: String) -> CommandResult<()> {
    run(handle(&state)?, move |ledger| ledger.delete_account(&id)).await
}

#[tauri::command]
pub async fn reorder_accounts(
    state: State<'_, AppState>,
    book_id: String,
    input: ReorderRequest,
) -> CommandResult<()> {
    run(handle(&state)?, move |ledger| {
        ledger.reorder_accounts(&book_id, &input.ids)
    })
    .await
}

// ---------------------------------------------------------------------------
// 分类（全局共享）
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_categories(
    state: State<'_, AppState>,
    include_hidden: bool,
) -> CommandResult<Vec<Category>> {
    run(handle(&state)?, move |ledger| {
        ledger.list_categories(include_hidden)
    })
    .await
}

#[tauri::command]
pub async fn create_category(
    state: State<'_, AppState>,
    input: NewCategory,
) -> CommandResult<Category> {
    run(handle(&state)?, move |ledger| ledger.create_category(input)).await
}

#[tauri::command]
pub async fn update_category(
    state: State<'_, AppState>,
    input: CategoryPatch,
) -> CommandResult<()> {
    run(handle(&state)?, move |ledger| ledger.update_category(input)).await
}

#[tauri::command]
pub async fn hide_category(state: State<'_, AppState>, id: String) -> CommandResult<()> {
    run(handle(&state)?, move |ledger| ledger.hide_category(&id)).await
}

#[tauri::command]
pub async fn reorder_categories(
    state: State<'_, AppState>,
    kind: EntryKind,
    input: ReorderRequest,
) -> CommandResult<()> {
    run(handle(&state)?, move |ledger| {
        ledger.reorder_categories(kind, &input.ids)
    })
    .await
}

// ---------------------------------------------------------------------------
// 账单
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_transactions_by_day(
    state: State<'_, AppState>,
    book_id: String,
    day: String,
) -> CommandResult<Vec<Transaction>> {
    run(handle(&state)?, move |ledger| {
        ledger.list_transactions_by_day(&book_id, &day)
    })
    .await
}

#[tauri::command]
pub async fn list_transactions_range(
    state: State<'_, AppState>,
    book_id: String,
    from_day: String,
    to_day: String,
    limit: i64,
) -> CommandResult<Vec<Transaction>> {
    run(handle(&state)?, move |ledger| {
        ledger.list_transactions_range(&book_id, &from_day, &to_day, limit)
    })
    .await
}

#[tauri::command]
pub async fn search_transactions(
    state: State<'_, AppState>,
    book_id: String,
    keyword: String,
    limit: i64,
) -> CommandResult<Vec<Transaction>> {
    run(handle(&state)?, move |ledger| {
        ledger.search_transactions(&book_id, &keyword, limit)
    })
    .await
}

#[tauri::command]
pub async fn get_transaction(
    state: State<'_, AppState>,
    id: String,
) -> CommandResult<Option<Transaction>> {
    run(handle(&state)?, move |ledger| ledger.get_transaction(&id)).await
}

#[tauri::command]
pub async fn create_transaction(
    state: State<'_, AppState>,
    input: NewTransaction,
) -> CommandResult<Transaction> {
    run(handle(&state)?, move |ledger| ledger.create_transaction(input)).await
}

#[tauri::command]
pub async fn update_transaction(
    state: State<'_, AppState>,
    input: TransactionPatch,
) -> CommandResult<()> {
    run(handle(&state)?, move |ledger| ledger.update_transaction(input)).await
}

#[tauri::command]
pub async fn delete_transaction(state: State<'_, AppState>, id: String) -> CommandResult<()> {
    run(handle(&state)?, move |ledger| ledger.delete_transaction(&id)).await
}

// ---------------------------------------------------------------------------
// 统计
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_month_stats(
    state: State<'_, AppState>,
    book_id: String,
    month: String,
) -> CommandResult<MonthStats> {
    run(handle(&state)?, move |ledger| {
        ledger.month_stats(&book_id, &month)
    })
    .await
}

#[tauri::command]
pub async fn get_year_summary(
    state: State<'_, AppState>,
    book_id: String,
    year: i32,
) -> CommandResult<YearSummary> {
    run(handle(&state)?, move |ledger| {
        ledger.year_summary(&book_id, year)
    })
    .await
}

#[tauri::command]
pub async fn get_month_shares(
    state: State<'_, AppState>,
    book_id: String,
    month: String,
) -> CommandResult<ShareBreakdown> {
    run(handle(&state)?, move |ledger| {
        ledger.month_share_breakdown(&book_id, &month)
    })
    .await
}

#[tauri::command]
pub async fn get_period_shares(
    state: State<'_, AppState>,
    book_id: String,
    end_month: String,
    months: usize,
) -> CommandResult<ShareBreakdown> {
    run(handle(&state)?, move |ledger| {
        ledger.period_share_breakdown(&book_id, &end_month, months)
    })
    .await
}

#[tauri::command]
pub async fn get_transaction_ranks(
    state: State<'_, AppState>,
    book_id: String,
    month: String,
    kind: StatsKind,
    limit: i64,
) -> CommandResult<Vec<TransactionRank>> {
    run(handle(&state)?, move |ledger| {
        ledger.transaction_ranks(&book_id, &month, kind, limit)
    })
    .await
}

#[tauri::command]
pub async fn get_year_transaction_ranks(
    state: State<'_, AppState>,
    book_id: String,
    year: i32,
    kind: StatsKind,
    limit: i64,
) -> CommandResult<Vec<TransactionRank>> {
    run(handle(&state)?, move |ledger| {
        ledger.year_transaction_ranks(&book_id, year, kind, limit)
    })
    .await
}

#[tauri::command]
pub async fn list_day_summaries(
    state: State<'_, AppState>,
    book_id: String,
    month: String,
) -> CommandResult<Vec<DaySummary>> {
    run(handle(&state)?, move |ledger| {
        ledger.day_summaries(&book_id, &month)
    })
    .await
}

#[tauri::command]
pub async fn get_assets_overview(
    state: State<'_, AppState>,
    book_id: String,
    until_day: String,
    months: usize,
) -> CommandResult<AssetsOverview> {
    run(handle(&state)?, move |ledger| {
        ledger.assets_overview(&book_id, &until_day, months)
    })
    .await
}

// ---------------------------------------------------------------------------
// 附件
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_attachments(
    state: State<'_, AppState>,
    transaction_id: String,
) -> CommandResult<Vec<Attachment>> {
    run(handle(&state)?, move |ledger| {
        ledger.list_attachments(&transaction_id)
    })
    .await
}

#[tauri::command]
pub async fn save_attachment(
    state: State<'_, AppState>,
    input: NewAttachment,
) -> CommandResult<Attachment> {
    run(handle(&state)?, move |ledger| ledger.save_attachment(input)).await
}

#[tauri::command]
pub async fn read_attachment(
    state: State<'_, AppState>,
    id: String,
) -> CommandResult<AttachmentData> {
    run(handle(&state)?, move |ledger| ledger.read_attachment(&id)).await
}

#[tauri::command]
pub async fn delete_attachment(state: State<'_, AppState>, id: String) -> CommandResult<()> {
    run(handle(&state)?, move |ledger| ledger.delete_attachment(&id)).await
}

// ---------------------------------------------------------------------------
// 固定收支（每日）
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_recurring_rules(state: State<'_, AppState>) -> CommandResult<Vec<RecurringRule>> {
    run(handle(&state)?, |ledger| ledger.list_recurring_rules()).await
}

#[tauri::command]
pub async fn create_recurring_rule(
    state: State<'_, AppState>,
    input: NewRecurringRule,
) -> CommandResult<RecurringRule> {
    run(handle(&state)?, move |ledger| ledger.create_recurring_rule(input)).await
}

#[tauri::command]
pub async fn update_recurring_rule(
    state: State<'_, AppState>,
    input: RecurringRulePatch,
) -> CommandResult<()> {
    run(handle(&state)?, move |ledger| ledger.update_recurring_rule(input)).await
}

#[tauri::command]
pub async fn delete_recurring_rule(state: State<'_, AppState>, id: String) -> CommandResult<()> {
    run(handle(&state)?, move |ledger| ledger.delete_recurring_rule(&id)).await
}

/// 补账：前端按本地时区算好「哪些规则的哪天」，这里只做幂等落库。
#[tauri::command]
pub async fn run_recurring_entries(
    state: State<'_, AppState>,
    occurrences: Vec<RecurringOccurrence>,
) -> CommandResult<RecurringRunResult> {
    run(handle(&state)?, move |ledger| {
        ledger.run_recurring_entries(occurrences)
    })
    .await
}
