//! 种子数据：默认账本 + 内置分类。
//!
//! 幂等：只在对应表为空时写入，重复启动不会重复建。
//! 分类目录由 `scripts/build-icon-subset.mjs` 生成（与前端同一份
//! `scripts/icon-catalog.mjs`），见 `seed_categories.generated.rs`。

use rusqlite::{Connection, params};

use crate::error::LedgerResult;
use crate::id::now_ms;
use crate::seed_categories::SEED_CATEGORIES;

/// 生成文件里的一行内置分类。
pub struct SeedCategory {
    pub id: &'static str,
    pub kind: &'static str,
    pub name: &'static str,
    pub icon_name: &'static str,
}

/// 默认账本 id（稳定值，切换 / 删除逻辑可依赖）。
pub const DEFAULT_BOOK_ID: &str = "book_default";
/// 默认账本名。
pub const DEFAULT_BOOK_NAME: &str = "默认账本";
/// 分类默认颜色：跟随主题色。
pub const DEFAULT_CATEGORY_COLOR: &str = "theme";
/// `meta` 表里当前账本的键。
pub const META_CURRENT_BOOK_KEY: &str = "current_book_id";

/// 种子执行结果（用于日志与测试断言）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SeedOutcome {
    pub book_created: bool,
    pub categories_created: bool,
}

/// 按需写入种子数据。
pub fn seed_if_needed(conn: &mut Connection) -> LedgerResult<SeedOutcome> {
    let book_created = ensure_default_book(conn)?;
    let categories_created = ensure_default_categories(conn)?;
    ensure_current_book(conn)?;
    Ok(SeedOutcome {
        book_created,
        categories_created,
    })
}

fn ensure_default_book(conn: &mut Connection) -> LedgerResult<bool> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM books", [], |row| row.get(0))?;
    if count > 0 {
        return Ok(false);
    }
    conn.execute(
        "INSERT INTO books (id, name, created_at_ms, sort_order) VALUES (?1, ?2, ?3, 0)",
        params![DEFAULT_BOOK_ID, DEFAULT_BOOK_NAME, now_ms()],
    )?;
    Ok(true)
}

fn ensure_default_categories(conn: &mut Connection) -> LedgerResult<bool> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM categories", [], |row| row.get(0))?;
    if count > 0 {
        return Ok(false);
    }
    let now = now_ms();
    let transaction = conn.transaction()?;
    {
        let mut statement = transaction.prepare(
            "INSERT INTO categories
                (id, kind, name, icon_name, color, sort_order, hidden, created_at_ms, updated_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?7)",
        )?;
        let mut sort_order = 0_i64;
        let mut current_kind = "";
        for category in SEED_CATEGORIES {
            if category.kind != current_kind {
                current_kind = category.kind;
                sort_order = 0;
            }
            statement.execute(params![
                category.id,
                category.kind,
                category.name,
                category.icon_name,
                DEFAULT_CATEGORY_COLOR,
                sort_order,
                now,
            ])?;
            sort_order += 1;
        }
    }
    transaction.commit()?;
    Ok(true)
}

/// 当前账本指针：缺失或指向已删除账本时，落到排序最靠前的账本。
pub fn ensure_current_book(conn: &Connection) -> LedgerResult<()> {
    let current: Option<String> = conn
        .query_row(
            "SELECT value FROM meta WHERE key = ?1",
            [META_CURRENT_BOOK_KEY],
            |row| row.get(0),
        )
        .ok();
    if let Some(book_id) = current
        && book_exists(conn, &book_id)?
    {
        return Ok(());
    }
    let fallback: Option<String> = conn
        .query_row(
            "SELECT id FROM books ORDER BY sort_order, created_at_ms, id LIMIT 1",
            [],
            |row| row.get(0),
        )
        .ok();
    if let Some(book_id) = fallback {
        set_meta(conn, META_CURRENT_BOOK_KEY, &book_id)?;
    }
    Ok(())
}

fn book_exists(conn: &Connection, book_id: &str) -> LedgerResult<bool> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM books WHERE id = ?1",
        [book_id],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

/// 写 meta（key 存在则覆盖）。
pub fn set_meta(conn: &Connection, key: &str, value: &str) -> LedgerResult<()> {
    conn.execute(
        "INSERT INTO meta (key, value) VALUES (?1, ?2)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

/// 读 meta。
pub fn get_meta(conn: &Connection, key: &str) -> LedgerResult<Option<String>> {
    Ok(conn
        .query_row("SELECT value FROM meta WHERE key = ?1", [key], |row| {
            row.get(0)
        })
        .ok())
}

/// 校验生成数据自身的一致性（单测用）：id 唯一、同组内名称唯一、kind 合法。
#[cfg(test)]
pub fn seed_catalog_is_valid() -> LedgerResult<()> {
    use std::collections::HashSet;

    use tk_domain::EntryKind;

    let mut ids = HashSet::new();
    let mut names = HashSet::new();
    for category in SEED_CATEGORIES {
        if !ids.insert(category.id) {
            return Err(crate::error::LedgerError::validation(format!(
                "种子分类 id 重复：{}",
                category.id
            )));
        }
        if EntryKind::from_db(category.kind).is_none() {
            return Err(crate::error::LedgerError::validation(format!(
                "种子分类 kind 非法：{}",
                category.kind
            )));
        }
        if !names.insert((category.kind, category.name)) {
            return Err(crate::error::LedgerError::validation(format!(
                "种子分类名称重复：{} {}",
                category.kind, category.name
            )));
        }
        if !category.icon_name.starts_with("mdi:") {
            return Err(crate::error::LedgerError::validation(format!(
                "种子分类图标名非法：{}",
                category.icon_name
            )));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seed_catalog_matches_brd_counts() {
        seed_catalog_is_valid().expect("种子目录自检");
        let expense = SEED_CATEGORIES
            .iter()
            .filter(|item| item.kind == "expense")
            .count();
        let income = SEED_CATEGORIES
            .iter()
            .filter(|item| item.kind == "income")
            .count();
        assert_eq!(expense, 37, "支出内置分类应为 37 项");
        assert_eq!(income, 10, "收入内置分类应为 10 项");
    }
}
