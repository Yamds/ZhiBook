// 记账数据 IPC 服务：命令名只在这里出现，页面与 hooks 不直接 invoke。
//
// 参数名与 Rust `#[tauri::command]` 的 snake_case 参数一一对应
// （Tauri 默认把 Rust 参数名映射成 camelCase 传给前端）。
// 跨 IPC 类型全部来自 `core/ipc/types`（Rust 侧唯一定义，ts-rs 生成）。

import { invoke, isTauri } from '../ipc/transport';
import type {
    Account,
    AccountPatch,
    AssetsOverview,
    Attachment,
    AttachmentData,
    Book,
    BookPatch,
    Category,
    CategoryPatch,
    DaySummary,
    EntryKind,
    MonthStats,
    NewAccount,
    NewAttachment,
    NewBook,
    NewCategory,
    NewTransaction,
    ShareBreakdown,
    StatsKind,
    Transaction,
    TransactionPatch,
    TransactionRank,
    YearSummary,
} from '../ipc/types';
import { ledgerMockCall } from './ledger.mock';

/** 统一的命令调用口：Tauri 走 IPC，浏览器预览走只读替身。 */
function call<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
    if (!isTauri) {
        try {
            return Promise.resolve(ledgerMockCall<T>(command, args));
        } catch (error) {
            return Promise.reject(error);
        }
    }
    return invoke<T>(command, args);
}

/** 默认趋势回看月数（与 Rust `tk_ledger::DEFAULT_TREND_MONTHS` 一致）。 */
export const DEFAULT_TREND_MONTHS = 12;
/** 明细页单批最多返回条数（Q9：每批 ≤7 天 / 50 条）。 */
export const TRANSACTION_BATCH_LIMIT = 50;
/** 明细页搜索结果上限（与 Rust `tk_ledger::SEARCH_RESULT_LIMIT` 一致，FR-DET-11）。 */
export const SEARCH_RESULT_LIMIT = 200;

export const ledgerService = {
    // ---- 账本 ----
    listBooks: () => call<Book[]>('list_books'),
    getCurrentBook: () => call<string | null>('get_current_book'),
    createBook: (input: NewBook) => call<Book>('create_book', { input }),
    updateBook: (input: BookPatch) => call<Book>('update_book', { input }),
    deleteBook: (id: string) => call<void>('delete_book', { id }),
    setCurrentBook: (id: string) => call<void>('set_current_book', { id }),

    // ---- 账户 ----
    listAccounts: (bookId: string, untilDay: string) =>
        call<Account[]>('list_accounts', { bookId, untilDay }),
    createAccount: (input: NewAccount) => call<Account>('create_account', { input }),
    updateAccount: (input: AccountPatch) => call<void>('update_account', { input }),
    deleteAccount: (id: string) => call<void>('delete_account', { id }),
    reorderAccounts: (bookId: string, ids: string[]) =>
        call<void>('reorder_accounts', { bookId, input: { ids } }),

    // ---- 分类 ----
    listCategories: (includeHidden = false) =>
        call<Category[]>('list_categories', { includeHidden }),
    createCategory: (input: NewCategory) => call<Category>('create_category', { input }),
    updateCategory: (input: CategoryPatch) => call<void>('update_category', { input }),
    hideCategory: (id: string) => call<void>('hide_category', { id }),
    reorderCategories: (kind: EntryKind, ids: string[]) =>
        call<void>('reorder_categories', { kind, input: { ids } }),

    // ---- 账单 ----
    listTransactionsByDay: (bookId: string, day: string) =>
        call<Transaction[]>('list_transactions_by_day', { bookId, day }),
    listTransactionsRange: (bookId: string, fromDay: string, toDay: string, limit = TRANSACTION_BATCH_LIMIT) =>
        call<Transaction[]>('list_transactions_range', { bookId, fromDay, toDay, limit }),
    searchTransactions: (bookId: string, keyword: string, limit = SEARCH_RESULT_LIMIT) =>
        call<Transaction[]>('search_transactions', { bookId, keyword, limit }),
    getTransaction: (id: string) => call<Transaction | null>('get_transaction', { id }),
    createTransaction: (input: NewTransaction) => call<Transaction>('create_transaction', { input }),
    updateTransaction: (input: TransactionPatch) => call<void>('update_transaction', { input }),
    deleteTransaction: (id: string) => call<void>('delete_transaction', { id }),

    // ---- 统计 ----
    getMonthStats: (bookId: string, month: string) =>
        call<MonthStats>('get_month_stats', { bookId, month }),
    getYearSummary: (bookId: string, year: number) =>
        call<YearSummary>('get_year_summary', { bookId, year }),
    getMonthShares: (bookId: string, month: string) =>
        call<ShareBreakdown>('get_month_shares', { bookId, month }),
    getPeriodShares: (bookId: string, endMonth: string, months = DEFAULT_TREND_MONTHS) =>
        call<ShareBreakdown>('get_period_shares', { bookId, endMonth, months }),
    getTransactionRanks: (bookId: string, month: string, kind: StatsKind, limit = 10) =>
        call<TransactionRank[]>('get_transaction_ranks', { bookId, month, kind, limit }),
    getYearTransactionRanks: (bookId: string, year: number, kind: StatsKind, limit = 10) =>
        call<TransactionRank[]>('get_year_transaction_ranks', { bookId, year, kind, limit }),
    listDaySummaries: (bookId: string, month: string) =>
        call<DaySummary[]>('list_day_summaries', { bookId, month }),
    getAssetsOverview: (bookId: string, untilDay: string, months = DEFAULT_TREND_MONTHS) =>
        call<AssetsOverview>('get_assets_overview', { bookId, untilDay, months }),

    // ---- 附件 ----
    listAttachments: (transactionId: string) =>
        call<Attachment[]>('list_attachments', { transactionId }),
    saveAttachment: (input: NewAttachment) => call<Attachment>('save_attachment', { input }),
    readAttachment: (id: string) => call<AttachmentData>('read_attachment', { id }),
    deleteAttachment: (id: string) => call<void>('delete_attachment', { id }),
};
