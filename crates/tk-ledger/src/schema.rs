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
//!
//! v3 新增（P15 多设备合并基础）：
//! - `tombstones` 硬删除墓碑：记录被删除的账本 / 账户 / 账单 / 附件 / 固定收支规则，
//!   合并时与「更新」比较时间戳，避免已删除的数据被其它设备重新带回来
//! - `books.updated_at_ms` 改名时间（账本没有独立的更新语义，补齐冲突比较基准）
//!
//! v4 修改：
//! - `categories` 的唯一索引改成**部分索引**（`WHERE hidden = 0`）：
//!   分类是软删除，隐藏后名字不应该再占位（否则用户删了「餐饮」就永远建不回同名分类，
//!   而列表里又看不到它）。只动索引、不动数据，旧库升级是一次 DROP/CREATE INDEX。

use rusqlite::{Connection, Transaction};
use tk_domain::error_payload;

use crate::error::{LedgerError, LedgerResult};

/// 当前 schema 版本。
pub const SCHEMA_VERSION: i64 = 4;

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

/// v3：多设备合并所需的墓碑与账本更新时间。
const V3: &str = r#"
ALTER TABLE books ADD COLUMN updated_at_ms INTEGER NOT NULL DEFAULT 0;
UPDATE books SET updated_at_ms = created_at_ms WHERE updated_at_ms = 0;

CREATE TABLE if NOT EXISTS tombstones (
    entity        TEXT    NOT NULL,
    entity_id     TEXT    NOT NULL,
    deleted_at_ms INTEGER NOT NULL,
    PRIMARY KEY (entity, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_tombstones_deleted ON tombstones (deleted_at_ms);
"#;

/// v4：分类名唯一性只约束「可见」分类（软删除后名字可以复用）。
const V4: &str = r#"
DROP INDEX IF EXISTS idx_categories_kind_name;
CREATE UNIQUE INDEX idx_categories_kind_name
    ON categories (kind, name) WHERE hidden = 0;
"#;

/// 把库升到 [`SCHEMA_VERSION`]；已是最新则直接返回。
pub fn migrate(conn: &mut Connection) -> LedgerResult<()> {
    let current: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if current > SCHEMA_VERSION {
        return Err(LedgerError::reported(error_payload!(
            "ledger.schema.too_new",
            "数据库版本 {current} 高于当前程序支持的 {supported}，请升级应用";
            current = current,
            supported = SCHEMA_VERSION
        )));
    }
    if current < 1 {
        apply_v1(conn)?;
    }
    if current < 2 {
        apply_v2(conn)?;
    }
    if current < 3 {
        apply_v3(conn)?;
    }
    if current < 4 {
        apply_v4(conn)?;
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

fn apply_v3(conn: &mut Connection) -> LedgerResult<()> {
    let tx: Transaction<'_> = conn.transaction()?;
    tx.execute_batch(V3)?;
    tx.commit()?;
    Ok(())
}

fn apply_v4(conn: &mut Connection) -> LedgerResult<()> {
    let tx: Transaction<'_> = conn.transaction()?;
    tx.execute_batch(V4)?;
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
            Err(LedgerError::Reported(_))
        ));
    }

    /// v2 旧库升级到 v3：补齐 `books.updated_at_ms`（用 created_at_ms 回填）并建墓碑表，旧数据不丢。
    #[test]
    fn migration_from_v2_backfills_book_updated_at() {
        let mut conn = fresh();
        {
            let tx = conn.transaction().expect("tx");
            tx.execute_batch(V1).expect("v1");
            tx.execute_batch(V2).expect("v2");
            tx.execute(
                "INSERT INTO books (id, name, created_at_ms, sort_order) VALUES ('b1', '日常', 111, 0)",
                [],
            )
            .expect("insert book");
            tx.commit().expect("commit");
        }
        conn.pragma_update(None, "user_version", 2).expect("v2 tag");
        migrate(&mut conn).expect("migrate v2 -> v3");
        let updated: i64 = conn
            .query_row("SELECT updated_at_ms FROM books WHERE id = 'b1'", [], |row| {
                row.get(0)
            })
            .expect("read updated_at_ms");
        assert_eq!(updated, 111);
        let tombstones: i64 = conn
            .query_row("SELECT COUNT(*) FROM tombstones", [], |row| row.get(0))
            .expect("read tombstones");
        assert_eq!(tombstones, 0);
    }

    /// v3 旧库升级到 v4：隐藏的分类不再占用名字（部分索引），旧数据不动。
    #[test]
    fn migration_from_v3_frees_hidden_category_names() {
        let mut conn = fresh();
        {
            let tx = conn.transaction().expect("tx");
            tx.execute_batch(V1).expect("v1");
            tx.execute_batch(V2).expect("v2");
            tx.execute_batch(V3).expect("v3");
            tx.execute(
                "INSERT INTO categories (id, kind, name, icon_name, color, sort_order, hidden, created_at_ms, updated_at_ms)
                 VALUES ('c1', 'expense', '餐饮', 'mdi:noodles', 'theme', 0, 1, 1, 1)",
                [],
            )
            .expect("hidden category");
            tx.commit().expect("commit");
        }
        conn.pragma_update(None, "user_version", 3).expect("v3 tag");
        migrate(&mut conn).expect("migrate v3 -> v4");

        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("read version");
        assert_eq!(version, 4);

        // 旧数据原封不动
        let (name, hidden): (String, i64) = conn
            .query_row("SELECT name, hidden FROM categories WHERE id = 'c1'", [], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })
            .expect("read category");
        assert_eq!(name, "餐饮");
        assert_eq!(hidden, 1);

        // 同名可见分类现在可以插入（旧索引会拒绝）
        conn.execute(
            "INSERT INTO categories (id, kind, name, icon_name, color, sort_order, hidden, created_at_ms, updated_at_ms)
             VALUES ('c2', 'expense', '餐饮', 'mdi:noodles', 'theme', 1, 0, 2, 2)",
            [],
        )
        .expect("重建同名可见分类");

        // 两个可见同名仍然被拒
        assert!(
            conn.execute(
                "INSERT INTO categories (id, kind, name, icon_name, color, sort_order, hidden, created_at_ms, updated_at_ms)
                 VALUES ('c3', 'expense', '餐饮', 'mdi:noodles', 'theme', 2, 0, 3, 3)",
                [],
            )
            .is_err(),
            "可见分类名必须仍然唯一"
        );
        // 同类型不同 kind 的可见同名不受影响
        conn.execute(
            "INSERT INTO categories (id, kind, name, icon_name, color, sort_order, hidden, created_at_ms, updated_at_ms)
             VALUES ('c4', 'income', '餐饮', 'mdi:noodles', 'theme', 0, 0, 4, 4)",
            [],
        )
        .expect("收入侧同名");
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
            "tombstones",
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
