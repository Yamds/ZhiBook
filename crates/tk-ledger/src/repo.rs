//! 仓储：实体 CRUD 与排序。
//!
//! 全部函数以 `&Connection` 为第一参数，因此在 `Ledger::with_tx` 的事务里
//! 也能直接用（`Transaction` 解引用成 `Connection`）。
//! 这里不做业务校验——校验在 `Ledger` 的方法里，写库前统一过一遍。

use rusqlite::types::Type;
use rusqlite::{Connection, OptionalExtension, Row, params};
use tk_domain::{Account, AccountKind, Attachment, Book, Category, EntryKind, Transaction};

use crate::error::{LedgerError, LedgerResult};

/// 数据库里出现了领域枚举不认识的值：属于数据损坏，不能静默兜底。
fn unknown_enum(label: &str, value: &str) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(
        0,
        Type::Text,
        Box::new(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("未知的{label}：{value}"),
        )),
    )
}

/// 唯一索引冲突转成可展示的校验错误。
pub fn map_unique_violation(error: rusqlite::Error, message: &str) -> LedgerError {
    if let rusqlite::Error::SqliteFailure(inner, _) = &error
        && inner.code == rusqlite::ErrorCode::ConstraintViolation
    {
        return LedgerError::validation(message);
    }
    LedgerError::Sqlite(error)
}

// ---------------------------------------------------------------------------
// 行映射
// ---------------------------------------------------------------------------

const BOOK_COLUMNS: &str = "id, name, created_at_ms, sort_order";
const ACCOUNT_COLUMNS: &str = "id, book_id, kind, name, icon_name, color, initial_balance_cents, sort_order, created_at_ms, updated_at_ms";
const CATEGORY_COLUMNS: &str = "id, kind, name, icon_name, color, sort_order, hidden, created_at_ms, updated_at_ms";
const TRANSACTION_COLUMNS: &str = "id, book_id, kind, category_id, account_id, amount_cents, note, day, month, occurred_at_ms, created_at_ms, updated_at_ms";
const ATTACHMENT_COLUMNS: &str = "id, transaction_id, path, mime, byte_size, sort_order, created_at_ms";

fn map_book(row: &Row<'_>) -> rusqlite::Result<Book> {
    Ok(Book {
        id: row.get(0)?,
        name: row.get(1)?,
        created_at_ms: row.get(2)?,
        sort_order: row.get(3)?,
    })
}

fn map_account(row: &Row<'_>) -> rusqlite::Result<Account> {
    let kind_value: String = row.get(2)?;
    let kind =
        AccountKind::from_db(&kind_value).ok_or_else(|| unknown_enum("账户类型", &kind_value))?;
    let initial_balance_cents: i64 = row.get(6)?;
    let signed_delta_cents: i64 = row.get(10)?;
    Ok(Account {
        id: row.get(0)?,
        book_id: row.get(1)?,
        kind,
        name: row.get(3)?,
        icon_name: row.get(4)?,
        color: row.get(5)?,
        initial_balance_cents,
        balance_cents: kind.balance_from_signed_delta(initial_balance_cents, signed_delta_cents),
        sort_order: row.get(7)?,
        created_at_ms: row.get(8)?,
        updated_at_ms: row.get(9)?,
    })
}

fn map_category(row: &Row<'_>) -> rusqlite::Result<Category> {
    let kind_value: String = row.get(1)?;
    let kind = EntryKind::from_db(&kind_value).ok_or_else(|| unknown_enum("分类类型", &kind_value))?;
    Ok(Category {
        id: row.get(0)?,
        kind,
        name: row.get(2)?,
        icon_name: row.get(3)?,
        color: row.get(4)?,
        sort_order: row.get(5)?,
        hidden: row.get::<_, i64>(6)? != 0,
        created_at_ms: row.get(7)?,
        updated_at_ms: row.get(8)?,
    })
}

fn map_transaction(row: &Row<'_>) -> rusqlite::Result<Transaction> {
    let kind_value: String = row.get(2)?;
    let kind =
        EntryKind::from_db(&kind_value).ok_or_else(|| unknown_enum("账单类型", &kind_value))?;
    Ok(Transaction {
        id: row.get(0)?,
        book_id: row.get(1)?,
        kind,
        category_id: row.get(3)?,
        account_id: row.get(4)?,
        amount_cents: row.get(5)?,
        note: row.get(6)?,
        day: row.get(7)?,
        month: row.get(8)?,
        occurred_at_ms: row.get(9)?,
        created_at_ms: row.get(10)?,
        updated_at_ms: row.get(11)?,
    })
}

fn map_attachment(row: &Row<'_>) -> rusqlite::Result<Attachment> {
    Ok(Attachment {
        id: row.get(0)?,
        transaction_id: row.get(1)?,
        path: row.get(2)?,
        mime: row.get(3)?,
        byte_size: row.get(4)?,
        sort_order: row.get(5)?,
        created_at_ms: row.get(6)?,
    })
}

fn collect<T>(
    statement: &mut rusqlite::Statement<'_>,
    params: impl rusqlite::Params,
    map: fn(&Row<'_>) -> rusqlite::Result<T>,
) -> LedgerResult<Vec<T>> {
    let rows = statement.query_map(params, map)?;
    let mut items = Vec::new();
    for row in rows {
        items.push(row?);
    }
    Ok(items)
}

// ---------------------------------------------------------------------------
// 账本
// ---------------------------------------------------------------------------

pub fn list_books(conn: &Connection) -> LedgerResult<Vec<Book>> {
    let mut statement = conn.prepare(&format!(
        "SELECT {BOOK_COLUMNS} FROM books ORDER BY sort_order, created_at_ms, id"
    ))?;
    collect(&mut statement, [], map_book)
}

pub fn get_book(conn: &Connection, id: &str) -> LedgerResult<Option<Book>> {
    let mut statement = conn.prepare(&format!("SELECT {BOOK_COLUMNS} FROM books WHERE id = ?1"))?;
    Ok(statement.query_row([id], map_book).optional()?)
}

pub fn book_exists(conn: &Connection, id: &str) -> LedgerResult<bool> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM books WHERE id = ?1", [id], |row| {
        row.get(0)
    })?;
    Ok(count > 0)
}

pub fn count_books(conn: &Connection) -> LedgerResult<i64> {
    Ok(conn.query_row("SELECT COUNT(*) FROM books", [], |row| row.get(0))?)
}

pub fn next_book_sort_order(conn: &Connection) -> LedgerResult<i64> {
    Ok(conn.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM books",
        [],
        |row| row.get(0),
    )?)
}

pub fn insert_book(conn: &Connection, book: &Book) -> LedgerResult<()> {
    conn.execute(
        "INSERT INTO books (id, name, created_at_ms, sort_order) VALUES (?1, ?2, ?3, ?4)",
        params![book.id, book.name, book.created_at_ms, book.sort_order],
    )
    .map_err(|error| map_unique_violation(error, "已存在同名账本"))?;
    Ok(())
}

pub fn update_book_name(conn: &Connection, id: &str, name: &str) -> LedgerResult<bool> {
    let changed = conn
        .execute("UPDATE books SET name = ?2 WHERE id = ?1", params![id, name])
        .map_err(|error| map_unique_violation(error, "已存在同名账本"))?;
    Ok(changed > 0)
}

/// 删除账本；账单 / 账户由外键级联删除（附件文件由调用方先清）。
pub fn delete_book(conn: &Connection, id: &str) -> LedgerResult<bool> {
    Ok(conn.execute("DELETE FROM books WHERE id = ?1", [id])? > 0)
}

// ---------------------------------------------------------------------------
// 账户
// ---------------------------------------------------------------------------

/// 账户列表；`until_day` 之后的账单不计入余额（通常传今天，与资产卡片口径一致）。
pub fn list_accounts(conn: &Connection, book_id: &str, until_day: &str) -> LedgerResult<Vec<Account>> {
    let mut statement = conn.prepare(&format!(
        "SELECT {ACCOUNT_COLUMNS},
                COALESCE((
                    SELECT SUM(CASE WHEN t.kind = 'income' THEN t.amount_cents ELSE -t.amount_cents END)
                    FROM transactions t
                    WHERE t.account_id = a.id AND t.day <= ?2
                ), 0) AS signed_delta_cents
         FROM accounts a
         WHERE a.book_id = ?1
         ORDER BY a.sort_order, a.created_at_ms, a.id"
    ))?;
    collect(&mut statement, params![book_id, until_day], map_account)
}

/// 单账户原始行；`balance_cents` 只等于初始余额（不做事务聚合）。
/// 需要带余额的账户请用 [`list_accounts`]。
pub fn get_account_record(conn: &Connection, id: &str) -> LedgerResult<Option<Account>> {
    let mut statement = conn.prepare(&format!(
        "SELECT {ACCOUNT_COLUMNS}, 0 AS signed_delta_cents FROM accounts a WHERE a.id = ?1"
    ))?;
    Ok(statement.query_row([id], map_account).optional()?)
}

pub fn account_belongs_to_book(conn: &Connection, id: &str, book_id: &str) -> LedgerResult<bool> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM accounts WHERE id = ?1 AND book_id = ?2",
        params![id, book_id],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

pub fn next_account_sort_order(conn: &Connection, book_id: &str) -> LedgerResult<i64> {
    Ok(conn.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM accounts WHERE book_id = ?1",
        [book_id],
        |row| row.get(0),
    )?)
}

pub fn insert_account(conn: &Connection, account: &Account) -> LedgerResult<()> {
    conn.execute(
        "INSERT INTO accounts
            (id, book_id, kind, name, icon_name, color, initial_balance_cents, sort_order, created_at_ms, updated_at_ms)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
        params![
            account.id,
            account.book_id,
            account.kind.as_str(),
            account.name,
            account.icon_name,
            account.color,
            account.initial_balance_cents,
            account.sort_order,
            account.created_at_ms,
        ],
    )?;
    Ok(())
}

pub fn update_account(conn: &Connection, account: &Account) -> LedgerResult<bool> {
    let changed = conn.execute(
        "UPDATE accounts
         SET kind = ?2, name = ?3, icon_name = ?4, color = ?5,
             initial_balance_cents = ?6, updated_at_ms = ?7
         WHERE id = ?1",
        params![
            account.id,
            account.kind.as_str(),
            account.name,
            account.icon_name,
            account.color,
            account.initial_balance_cents,
            account.updated_at_ms,
        ],
    )?;
    Ok(changed > 0)
}

/// 删除账户；其历史账单的 `account_id` 由外键置空（保留账单）。
pub fn delete_account(conn: &Connection, id: &str) -> LedgerResult<bool> {
    Ok(conn.execute("DELETE FROM accounts WHERE id = ?1", [id])? > 0)
}

pub fn account_ids_in_order(conn: &Connection, book_id: &str) -> LedgerResult<Vec<String>> {
    let mut statement = conn.prepare(
        "SELECT id FROM accounts WHERE book_id = ?1 ORDER BY sort_order, created_at_ms, id",
    )?;
    let rows = statement.query_map([book_id], |row| row.get::<_, String>(0))?;
    let mut ids = Vec::new();
    for row in rows {
        ids.push(row?);
    }
    Ok(ids)
}

pub fn set_account_sort_order(conn: &Connection, id: &str, sort_order: i64) -> LedgerResult<()> {
    conn.execute(
        "UPDATE accounts SET sort_order = ?2 WHERE id = ?1",
        params![id, sort_order],
    )?;
    Ok(())
}

// ---------------------------------------------------------------------------
// 分类（全局共享）
// ---------------------------------------------------------------------------

pub fn list_categories(conn: &Connection, include_hidden: bool) -> LedgerResult<Vec<Category>> {
    let mut statement = conn.prepare(&format!(
        "SELECT {CATEGORY_COLUMNS} FROM categories
         WHERE ?1 = 1 OR hidden = 0
         ORDER BY kind, sort_order, created_at_ms, id"
    ))?;
    collect(&mut statement, params![i64::from(include_hidden)], map_category)
}

pub fn get_category(conn: &Connection, id: &str) -> LedgerResult<Option<Category>> {
    let mut statement =
        conn.prepare(&format!("SELECT {CATEGORY_COLUMNS} FROM categories WHERE id = ?1"))?;
    Ok(statement.query_row([id], map_category).optional()?)
}

pub fn category_name_taken(
    conn: &Connection,
    kind: EntryKind,
    name: &str,
    exclude_id: Option<&str>,
) -> LedgerResult<bool> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM categories WHERE kind = ?1 AND name = ?2 AND id IS NOT ?3",
        params![kind.as_str(), name, exclude_id],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

pub fn next_category_sort_order(conn: &Connection, kind: EntryKind) -> LedgerResult<i64> {
    Ok(conn.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM categories WHERE kind = ?1",
        [kind.as_str()],
        |row| row.get(0),
    )?)
}

pub fn insert_category(conn: &Connection, category: &Category) -> LedgerResult<()> {
    conn.execute(
        "INSERT INTO categories
            (id, kind, name, icon_name, color, sort_order, hidden, created_at_ms, updated_at_ms)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            category.id,
            category.kind.as_str(),
            category.name,
            category.icon_name,
            category.color,
            category.sort_order,
            i64::from(category.hidden),
            category.created_at_ms,
            category.updated_at_ms,
        ],
    )
    .map_err(|error| map_unique_violation(error, "同类型下已存在同名分类"))?;
    Ok(())
}

pub fn update_category(conn: &Connection, category: &Category) -> LedgerResult<bool> {
    let changed = conn
        .execute(
            "UPDATE categories
             SET name = ?2, icon_name = ?3, color = ?4, updated_at_ms = ?5
             WHERE id = ?1",
            params![
                category.id,
                category.name,
                category.icon_name,
                category.color,
                category.updated_at_ms,
            ],
        )
        .map_err(|error| map_unique_violation(error, "同类型下已存在同名分类"))?;
    Ok(changed > 0)
}

/// 软删除：只置 `hidden`，历史账单继续显示原分类。
pub fn hide_category(conn: &Connection, id: &str, now_ms: i64) -> LedgerResult<bool> {
    let changed = conn.execute(
        "UPDATE categories SET hidden = 1, updated_at_ms = ?2 WHERE id = ?1",
        params![id, now_ms],
    )?;
    Ok(changed > 0)
}

pub fn category_ids_in_order(conn: &Connection, kind: EntryKind) -> LedgerResult<Vec<String>> {
    let mut statement = conn.prepare(
        "SELECT id FROM categories WHERE kind = ?1 ORDER BY sort_order, created_at_ms, id",
    )?;
    let rows = statement.query_map([kind.as_str()], |row| row.get::<_, String>(0))?;
    let mut ids = Vec::new();
    for row in rows {
        ids.push(row?);
    }
    Ok(ids)
}

pub fn set_category_sort_order(conn: &Connection, id: &str, sort_order: i64) -> LedgerResult<()> {
    conn.execute(
        "UPDATE categories SET sort_order = ?2, updated_at_ms = ?3 WHERE id = ?1",
        params![id, sort_order, crate::id::now_ms()],
    )?;
    Ok(())
}

// ---------------------------------------------------------------------------
// 账单
// ---------------------------------------------------------------------------

pub fn list_transactions_by_day(
    conn: &Connection,
    book_id: &str,
    day: &str,
) -> LedgerResult<Vec<Transaction>> {
    let mut statement = conn.prepare(&format!(
        "SELECT {TRANSACTION_COLUMNS} FROM transactions
         WHERE book_id = ?1 AND day = ?2
         ORDER BY occurred_at_ms DESC, created_at_ms DESC, id"
    ))?;
    collect(&mut statement, params![book_id, day], map_transaction)
}

/// 按天区间倒序取账单（明细页懒加载：每批不超过 `limit` 条）。
pub fn list_transactions_range(
    conn: &Connection,
    book_id: &str,
    from_day: &str,
    to_day: &str,
    limit: i64,
) -> LedgerResult<Vec<Transaction>> {
    let mut statement = conn.prepare(&format!(
        "SELECT {TRANSACTION_COLUMNS} FROM transactions
         WHERE book_id = ?1 AND day >= ?2 AND day <= ?3
         ORDER BY day DESC, occurred_at_ms DESC, created_at_ms DESC, id
         LIMIT ?4"
    ))?;
    collect(
        &mut statement,
        params![book_id, from_day, to_day, limit],
        map_transaction,
    )
}

pub fn get_transaction(conn: &Connection, id: &str) -> LedgerResult<Option<Transaction>> {
    let mut statement =
        conn.prepare(&format!("SELECT {TRANSACTION_COLUMNS} FROM transactions WHERE id = ?1"))?;
    Ok(statement.query_row([id], map_transaction).optional()?)
}

pub fn insert_transaction(conn: &Connection, transaction: &Transaction) -> LedgerResult<()> {
    conn.execute(
        "INSERT INTO transactions
            (id, book_id, kind, category_id, account_id, amount_cents, note, day, month, occurred_at_ms, created_at_ms, updated_at_ms)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            transaction.id,
            transaction.book_id,
            transaction.kind.as_str(),
            transaction.category_id,
            transaction.account_id,
            transaction.amount_cents,
            transaction.note,
            transaction.day,
            transaction.month,
            transaction.occurred_at_ms,
            transaction.created_at_ms,
            transaction.updated_at_ms,
        ],
    )?;
    Ok(())
}

pub fn update_transaction(conn: &Connection, transaction: &Transaction) -> LedgerResult<bool> {
    let changed = conn.execute(
        "UPDATE transactions
         SET kind = ?2, category_id = ?3, account_id = ?4, amount_cents = ?5,
             note = ?6, day = ?7, month = ?8, occurred_at_ms = ?9, updated_at_ms = ?10
         WHERE id = ?1",
        params![
            transaction.id,
            transaction.kind.as_str(),
            transaction.category_id,
            transaction.account_id,
            transaction.amount_cents,
            transaction.note,
            transaction.day,
            transaction.month,
            transaction.occurred_at_ms,
            transaction.updated_at_ms,
        ],
    )?;
    Ok(changed > 0)
}

pub fn delete_transaction(conn: &Connection, id: &str) -> LedgerResult<bool> {
    Ok(conn.execute("DELETE FROM transactions WHERE id = ?1", [id])? > 0)
}

pub fn count_transactions_in_book(conn: &Connection, book_id: &str) -> LedgerResult<i64> {
    Ok(conn.query_row(
        "SELECT COUNT(*) FROM transactions WHERE book_id = ?1",
        [book_id],
        |row| row.get(0),
    )?)
}

// ---------------------------------------------------------------------------
// 附件
// ---------------------------------------------------------------------------

pub fn list_attachments(conn: &Connection, transaction_id: &str) -> LedgerResult<Vec<Attachment>> {
    let mut statement = conn.prepare(&format!(
        "SELECT {ATTACHMENT_COLUMNS} FROM attachments
         WHERE transaction_id = ?1
         ORDER BY sort_order, created_at_ms, id"
    ))?;
    collect(&mut statement, [transaction_id], map_attachment)
}

pub fn get_attachment(conn: &Connection, id: &str) -> LedgerResult<Option<Attachment>> {
    let mut statement =
        conn.prepare(&format!("SELECT {ATTACHMENT_COLUMNS} FROM attachments WHERE id = ?1"))?;
    Ok(statement.query_row([id], map_attachment).optional()?)
}

pub fn count_attachments(conn: &Connection, transaction_id: &str) -> LedgerResult<i64> {
    Ok(conn.query_row(
        "SELECT COUNT(*) FROM attachments WHERE transaction_id = ?1",
        [transaction_id],
        |row| row.get(0),
    )?)
}

pub fn insert_attachment(conn: &Connection, attachment: &Attachment) -> LedgerResult<()> {
    conn.execute(
        "INSERT INTO attachments (id, transaction_id, path, mime, byte_size, sort_order, created_at_ms)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            attachment.id,
            attachment.transaction_id,
            attachment.path,
            attachment.mime,
            attachment.byte_size,
            attachment.sort_order,
            attachment.created_at_ms,
        ],
    )?;
    Ok(())
}

pub fn delete_attachment_row(conn: &Connection, id: &str) -> LedgerResult<bool> {
    Ok(conn.execute("DELETE FROM attachments WHERE id = ?1", [id])? > 0)
}

/// 某账单的附件相对路径（删除账单 / 账本前清理文件用）。
pub fn attachment_paths_for_transaction(
    conn: &Connection,
    transaction_id: &str,
) -> LedgerResult<Vec<String>> {
    let mut statement =
        conn.prepare("SELECT path FROM attachments WHERE transaction_id = ?1 ORDER BY sort_order")?;
    let rows = statement.query_map([transaction_id], |row| row.get::<_, String>(0))?;
    let mut paths = Vec::new();
    for row in rows {
        paths.push(row?);
    }
    Ok(paths)
}

/// 某账本全部账单的附件相对路径（删除账本前清理文件用）。
pub fn attachment_paths_for_book(conn: &Connection, book_id: &str) -> LedgerResult<Vec<String>> {
    let mut statement = conn.prepare(
        "SELECT a.path FROM attachments a
         JOIN transactions t ON t.id = a.transaction_id
         WHERE t.book_id = ?1
         ORDER BY a.transaction_id, a.sort_order",
    )?;
    let rows = statement.query_map([book_id], |row| row.get::<_, String>(0))?;
    let mut paths = Vec::new();
    for row in rows {
        paths.push(row?);
    }
    Ok(paths)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn memory_db() -> Connection {
        let mut conn = Connection::open_in_memory().expect("open");
        crate::schema::migrate(&mut conn).expect("migrate");
        conn
    }

    fn sample_book(id: &str, name: &str) -> Book {
        Book {
            id: id.to_string(),
            name: name.to_string(),
            created_at_ms: 1,
            sort_order: 0,
        }
    }

    #[test]
    fn duplicate_book_name_is_a_validation_error() {
        let conn = memory_db();
        insert_book(&conn, &sample_book("book_a", "日常账")).expect("first insert");
        let error = insert_book(&conn, &sample_book("book_b", "日常账")).expect_err("duplicate");
        assert!(matches!(error, LedgerError::Validation(_)), "{error:?}");
    }

    #[test]
    fn deleting_book_cascades_transactions_and_blocks_orphan_accounts() {
        let conn = memory_db();
        insert_book(&conn, &sample_book("book_a", "日常账")).expect("book");
        conn.execute(
            "INSERT INTO accounts (id, book_id, kind, name, icon_name, color, initial_balance_cents, sort_order, created_at_ms, updated_at_ms)
             VALUES ('acc_1', 'book_a', 'asset', '现金', 'mdi:cash', 'theme', 0, 0, 1, 1)",
            [],
        )
        .expect("account");
        conn.execute(
            "INSERT INTO transactions (id, book_id, kind, category_id, account_id, amount_cents, note, day, month, occurred_at_ms, created_at_ms, updated_at_ms)
             VALUES ('tx_1', 'book_a', 'expense', 'expense_food', 'acc_1', 100, '', '2025-09-08', '2025-09', 1, 1, 1)",
            [],
        )
        .expect("transaction");

        assert!(delete_book(&conn, "book_a").expect("delete"));
        assert_eq!(count_transactions_in_book(&conn, "book_a").expect("count"), 0);
        let accounts: i64 = conn
            .query_row("SELECT COUNT(*) FROM accounts", [], |row| row.get(0))
            .expect("count accounts");
        assert_eq!(accounts, 0);
    }

    #[test]
    fn deleting_account_keeps_transaction_with_null_account() {
        let conn = memory_db();
        insert_book(&conn, &sample_book("book_a", "日常账")).expect("book");
        conn.execute(
            "INSERT INTO accounts (id, book_id, kind, name, icon_name, color, initial_balance_cents, sort_order, created_at_ms, updated_at_ms)
             VALUES ('acc_1', 'book_a', 'asset', '现金', 'mdi:cash', 'theme', 0, 0, 1, 1)",
            [],
        )
        .expect("account");
        conn.execute(
            "INSERT INTO transactions (id, book_id, kind, category_id, account_id, amount_cents, note, day, month, occurred_at_ms, created_at_ms, updated_at_ms)
             VALUES ('tx_1', 'book_a', 'expense', 'expense_food', 'acc_1', 100, '', '2025-09-08', '2025-09', 1, 1, 1)",
            [],
        )
        .expect("transaction");

        assert!(delete_account(&conn, "acc_1").expect("delete"));
        let transaction = get_transaction(&conn, "tx_1")
            .expect("query")
            .expect("账单应保留");
        assert_eq!(transaction.account_id, None);
    }

    #[test]
    fn category_name_uniqueness_is_per_kind() {
        let conn = memory_db();
        conn.execute(
            "INSERT INTO categories (id, kind, name, icon_name, color, sort_order, hidden, created_at_ms, updated_at_ms)
             VALUES ('c1', 'expense', '餐饮', 'mdi:noodles', 'theme', 0, 0, 1, 1)",
            [],
        )
        .expect("insert");
        assert!(category_name_taken(&conn, EntryKind::Expense, "餐饮", None).expect("query"));
        assert!(!category_name_taken(&conn, EntryKind::Income, "餐饮", None).expect("query"));
        assert!(!category_name_taken(&conn, EntryKind::Expense, "餐饮", Some("c1")).expect("query"));
    }
}
