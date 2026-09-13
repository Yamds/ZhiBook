//! Schema 定义与迁移。
//!
//! 版本号用 `PRAGMA user_version` 记录；每次结构变更新增一个 `apply_vN`，
//! 在 `migrate` 里按版本顺序补齐。迁移必须是幂等可重入的：
//! 中途失败时事务回滚，下次启动从头再来。
//!
//! v1 表结构：
//! - `books`        账本
//! - `accounts`     账户（归属账本，余额由初始值 + 关联账单聚合，不落库）
//! - `categories`   分类（全局共享，`hidden` 软删除）
//! - `transactions` 账单
//! - `attachments`  附件元信息（文件在磁盘，库里只存相对路径）
//! - `meta`         键值杂项（当前账本等）
//!
//! v2 新增：
//! - `recurring_rules` 固定收支规则（每日 05:00 自动记一笔）
//! - `recurring_runs`  幂等台账：同一条规则同一天最多生成一笔

use rusqlite::{Connection, Transaction};

use crate::error::{LedgerError, LedgerResult};

/// 当前 schema 版本。
pub const SCHEMA_VERSION: i64 = 2;

/// 说明：`transactions.category_id` 故意不加外键——分类只做软删除，
/// 且历史账单必须能在分类被隐藏后继续显示，不允许任何级联。
const V1: &str = r#"
CREATE TABLE books (
    id            TEXT    PRIMARY KEY,
    name          TEXT    NOT NULL,
    created_at_ms INTEGER NOT NULL,
    sort_order    INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_books_name ON books (name);

CREATE TABLE accounts (
    id                    TEXT    PRIMARY KEY,
    book_id               TEXT    NOT NULL REFERENCES books (id) ON DELETE CASCADE,
    kind                  TEXT    NOT NULL,
    name                  TEXT    NOT NULL,
    icon_name             TEXT    NOT NULL,
    color                 TEXT    NOT NULL,
    initial_balance_cents INTEGER NOT NULL DEFAULT 0,
    sort_order            INTEGER NOT NULL,
    created_at_ms         INTEGER NOT NULL,
    updated_at_ms         INTEGER NOT NULL
);

CREATE INDEX idx_accounts_book ON accounts (book_id, sort_order);

CREATE TABLE categories (
    id            TEXT    PRIMARY KEY,
    kind          TEXT    NOT NULL,
    name          TEXT    NOT NULL,
    icon_name     TEXT    NOT NULL,
    color         TEXT    NOT NULL,
    sort_order    INTEGER NOT NULL,
    hidden        INTEGER NOT NULL DEFAULT 0,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
);

CREATE INDEX idx_categories_kind ON categories (kind, sort_order);
CREATE UNIQUE INDEX idx_categories_kind_name ON categories (kind, name);

CREATE TABLE transactions (
    id            TEXT    PRIMARY KEY,
    book_id       TEXT    NOT NULL REFERENCES books (id) ON DELETE CASCADE,
    kind          TEXT    NOT NULL,
    category_id   TEXT    NOT NULL,
    account_id    TEXT    REFERENCES accounts (id) ON DELETE SET NULL,
    amount_cents  INTEGER NOT NULL CHECK (amount_cents > 0),
    note          TEXT    NOT NULL DEFAULT '',
    day           TEXT    NOT NULL,
    month         TEXT    NOT NULL,
    occurred_at_ms INTEGER NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
);

CREATE INDEX idx_transactions_book_day
    ON transactions (book_id, day DESC, occurred_at_ms DESC);
CREATE INDEX idx_transactions_book_month
    ON transactions (book_id, month, kind);
CREATE INDEX idx_transactions_book_category
    ON transactions (book_id, category_id);
CREATE INDEX idx_transactions_account
    ON transactions (account_id);

CREATE TABLE attachments (
    id             TEXT    PRIMARY KEY,
    transaction_id TEXT    NOT NULL REFERENCES transactions (id) ON DELETE CASCADE,
    path           TEXT    NOT NULL,
    mime           TEXT    NOT NULL,
    byte_size      INTEGER NOT NULL,
    sort_order     INTEGER NOT NULL,
    created_at_ms  INTEGER NOT NULL
);

CREATE INDEX idx_attachments_transaction ON attachments (transaction_id, sort_order);

CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"#;

/// v2：固定收支规则 + 幂等台账。
///
/// `category_id` 同样不加外键（分类只做软删除）；`account_id` 用
/// `ON DELETE SET NULL`：删除账户后规则变成「未指定账户」继续生效。
const V2: &str = r#"
CREATE TABLE recurring_rules (
    id            TEXT    PRIMARY KEY,
    book_id       TEXT    NOT NULL REFERENCES books (id) ON DELETE CASCADE,
    kind          TEXT    NOT NULL,
    amount_cents  INTEGER NOT NULL CHECK (amount_cents > 0),
    note          TEXT    NOT NULL DEFAULT '',
    category_id   TEXT    NOT NULL,
    account_id    TEXT    REFERENCES accounts (id) ON DELETE SET NULL,
    enabled       INTEGER NOT NULL DEFAULT 1,
    start_day     TEXT    NOT NULL,
    last_run_day  TEXT,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
);

CREATE INDEX idx_recurring_rules_book ON recurring_rules (book_id, created_at_ms);

CREATE TABLE recurring_runs (
    rule_id        TEXT    NOT NULL REFERENCES recurring_rules (id) ON DELETE CASCADE,
    day            TEXT    NOT NULL,
    transaction_id TEXT    NOT NULL,
    created_at_ms  INTEGER NOT NULL,
    PRIMARY KEY (rule_id, day)
);
"#;

/// 把库升到 [`SCHEMA_VERSION`]；已是最新则直接返回。
pub fn migrate(conn: &mut Connection) -> LedgerResult<()> {
    let current: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if current > SCHEMA_VERSION {
        return Err(LedgerError::corrupt(format!(
            "数据库版本 {current} 高于当前程序支持的 {SCHEMA_VERSION}，请升级应用"
        )));
    }
    if current < 1 {
        apply_v1(conn)?;
    }
    if current < 2 {
        apply_v2(conn)?;
    }
    conn.pragma_update(None, "user_version", SCHEMA_VERSION)?;
    Ok(())
}

fn apply_v1(conn: &mut Connection) -> LedgerResult<()> {
    let tx: Transaction<'_> = conn.transaction()?;
    tx.execute_batch(V1)?;
    tx.commit()?;
    Ok(())
}

fn apply_v2(conn: &mut Connection) -> LedgerResult<()> {
    let tx: Transaction<'_> = conn.transaction()?;
    tx.execute_batch(V2)?;
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fresh() -> Connection {
        Connection::open_in_memory().expect("open in memory")
    }

    #[test]
    fn migrate_sets_version_and_is_idempotent() {
        let mut conn = fresh();
        migrate(&mut conn).expect("first migrate");
        migrate(&mut conn).expect("second migrate");
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("read version");
        assert_eq!(version, SCHEMA_VERSION);
    }

    #[test]
    fn migrate_refuses_future_version() {
        let mut conn = fresh();
        conn.pragma_update(None, "user_version", SCHEMA_VERSION + 1)
            .expect("bump version");
        assert!(matches!(
            migrate(&mut conn),
            Err(LedgerError::Corrupt(_))
        ));
    }

    #[test]
    fn v1_creates_all_tables() {
        let mut conn = fresh();
        migrate(&mut conn).expect("migrate");
        for table in [
            "books",
            "accounts",
            "categories",
            "transactions",
            "attachments",
            "meta",
            "recurring_rules",
            "recurring_runs",
        ] {
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                    [table],
                    |row| row.get(0),
                )
                .expect("query sqlite_master");
            assert_eq!(count, 1, "缺少表 {table}");
        }
    }
}
