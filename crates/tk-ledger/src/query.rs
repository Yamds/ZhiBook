//! 统计聚合（全部走 SQL，返回 Rust 侧组装好的 DTO）。
//!
//! 口径约定（见 BRD §4.2 / §5）：
//! - 支出 / 收入 = 对应方向的金额之和；结余 = 收入 − 支出（可为负）；
//! - 占比与排行一律按**绝对值**排序（结余口径下收入为正、支出为负）；
//! - 资产趋势按月快照：净资产 = Σ资产账户余额 − Σ负债账户余额，
//!   余额 = 初始余额 + 关联账单累计（**只统计 `until_day` 及之前的账单**，
//!   与资产卡片口径一致——未来日期的账单要等到那天才生效）；
//! - 「其它」合并桶的 id 固定为 [`OTHER_BUCKET_ID`]，`merged = true`。

use std::collections::HashMap;

use rusqlite::{Connection, params};
use tk_domain::{
    AccountKind, AssetPoint, AssetsOverview, CategoryShare, CategoryShareSet, DaySummary, EntryKind,
    KindMonthStats, MonthPoint, MonthStats, ShareBreakdown, StatsKind, TransactionRank, YearSummary,
};

use crate::dates;
use crate::error::{LedgerError, LedgerResult};

/// 「其它」合并桶的固定 id。
pub const OTHER_BUCKET_ID: &str = "__other__";
const OTHER_BUCKET_NAME: &str = "其它";
const OTHER_BUCKET_ICON: &str = "mdi:dots-horizontal-circle-outline";
/// 占比概况展示的最高项数，其余合并为「其它」。
const TOP_ITEMS: usize = 10;
/// 趋势图默认回看月数。
pub const DEFAULT_TREND_MONTHS: usize = 12;

/// 单分类的累计口径。
#[derive(Debug, Default, Clone, Copy)]
struct CategoryTotals {
    expense_cents: i64,
    income_cents: i64,
    expense_count: i64,
    income_count: i64,
}

/// 分类展示元信息（含已软删除的分类，历史账单仍要显示）。
#[derive(Debug, Clone)]
struct CategoryMeta {
    name: String,
    icon_name: String,
    color: String,
    hidden: bool,
}

fn category_meta(conn: &Connection) -> LedgerResult<HashMap<String, CategoryMeta>> {
    let mut statement =
        conn.prepare("SELECT id, name, icon_name, color, hidden FROM categories")?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            CategoryMeta {
                name: row.get(1)?,
                icon_name: row.get(2)?,
                color: row.get(3)?,
                hidden: row.get::<_, i64>(4)? != 0,
            },
        ))
    })?;
    let mut meta = HashMap::new();
    for row in rows {
        let (id, value) = row?;
        meta.insert(id, value);
    }
    Ok(meta)
}

/// 按分类维度累计账单（`month` 闭区间）。
fn category_totals(
    conn: &Connection,
    book_id: &str,
    from_month: &str,
    to_month: &str,
) -> LedgerResult<HashMap<String, CategoryTotals>> {
    let mut statement = conn.prepare(
        "SELECT category_id,
                COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount_cents ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN kind = 'income'  THEN amount_cents ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN kind = 'expense' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN kind = 'income'  THEN 1 ELSE 0 END), 0)
         FROM transactions
         WHERE book_id = ?1 AND month >= ?2 AND month <= ?3
         GROUP BY category_id",
    )?;
    let rows = statement.query_map(params![book_id, from_month, to_month], |row| {
        Ok((
            row.get::<_, String>(0)?,
            CategoryTotals {
                expense_cents: row.get(1)?,
                income_cents: row.get(2)?,
                expense_count: row.get(3)?,
                income_count: row.get(4)?,
            },
        ))
    })?;
    let mut totals = HashMap::new();
    for row in rows {
        let (id, value) = row?;
        totals.insert(id, value);
    }
    Ok(totals)
}

/// 把一批条目整理成「Top10 + 其它」的占比集合。
fn share_set(mut items: Vec<CategoryShare>) -> CategoryShareSet {
    items.sort_by(|left, right| {
        right
            .abs_amount_cents
            .cmp(&left.abs_amount_cents)
            .then_with(|| left.name.cmp(&right.name))
    });
    let total_cents: i64 = items.iter().map(|item| item.abs_amount_cents).sum();
    let count: i64 = items.iter().map(|item| item.count).sum();
    for item in &mut items {
        item.share = if total_cents > 0 {
            item.abs_amount_cents as f64 / total_cents as f64
        } else {
            0.0
        };
    }

    let mut top: Vec<CategoryShare> = items.iter().take(TOP_ITEMS).cloned().collect();
    if items.len() > TOP_ITEMS {
        let rest = &items[TOP_ITEMS..];
        top.push(CategoryShare {
            category_id: OTHER_BUCKET_ID.to_string(),
            name: OTHER_BUCKET_NAME.to_string(),
            icon_name: OTHER_BUCKET_ICON.to_string(),
            color: "theme".to_string(),
            amount_cents: rest.iter().map(|item| item.amount_cents).sum(),
            abs_amount_cents: rest.iter().map(|item| item.abs_amount_cents).sum(),
            count: rest.iter().map(|item| item.count).sum(),
            share: rest.iter().map(|item| item.share).sum(),
            hidden: false,
            merged: true,
        });
    }

    CategoryShareSet {
        total_cents,
        count,
        items: top,
        all: items,
    }
}

/// 从累计结果生成某个口径的条目。
fn shares_for_kind(
    kind: StatsKind,
    totals: &HashMap<String, CategoryTotals>,
    meta: &HashMap<String, CategoryMeta>,
) -> Vec<CategoryShare> {
    let mut items = Vec::new();
    for (category_id, total) in totals {
        let (amount_cents, count) = match kind {
            StatsKind::Expense => (total.expense_cents, total.expense_count),
            StatsKind::Income => (total.income_cents, total.income_count),
            StatsKind::Balance => (
                total.income_cents - total.expense_cents,
                total.expense_count + total.income_count,
            ),
        };
        if amount_cents == 0 {
            continue;
        }
        let fallback = CategoryMeta {
            name: "未知分类".to_string(),
            icon_name: OTHER_BUCKET_ICON.to_string(),
            color: "theme".to_string(),
            hidden: false,
        };
        let info = meta.get(category_id).unwrap_or(&fallback);
        items.push(CategoryShare {
            category_id: category_id.clone(),
            name: info.name.clone(),
            icon_name: info.icon_name.clone(),
            color: info.color.clone(),
            amount_cents,
            abs_amount_cents: amount_cents.abs(),
            count,
            share: 0.0,
            hidden: info.hidden,
            merged: false,
        });
    }
    items
}

/// 某月的每日汇总（只返回有数据的日期，日历页用）。
pub fn day_summaries(conn: &Connection, book_id: &str, month: &str) -> LedgerResult<Vec<DaySummary>> {
    if !dates::is_valid_month_key(month) {
        return Err(LedgerError::validation(format!("月份格式不合法：{month}")));
    }
    let mut statement = conn.prepare(
        "SELECT day,
                COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount_cents ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN kind = 'income'  THEN amount_cents ELSE 0 END), 0),
                COUNT(*)
         FROM transactions
         WHERE book_id = ?1 AND month = ?2
         GROUP BY day
         ORDER BY day",
    )?;
    let rows = statement.query_map(params![book_id, month], |row| {
        let expense_cents: i64 = row.get(1)?;
        let income_cents: i64 = row.get(2)?;
        Ok(DaySummary {
            day: row.get(0)?,
            expense_cents,
            income_cents,
            balance_cents: income_cents - expense_cents,
            count: row.get(3)?,
        })
    })?;
    let mut items = Vec::new();
    for row in rows {
        items.push(row?);
    }
    Ok(items)
}

/// 月份统计：三种口径的总额 / 笔数 / 单日最高 / 日均 / 逐日序列。
pub fn month_stats(conn: &Connection, book_id: &str, month: &str) -> LedgerResult<MonthStats> {
    let (year, month_number) =
        dates::parse_month_key(month).ok_or_else(|| LedgerError::validation("月份格式不合法"))?;
    let days = dates::days_in_month(year, month_number);

    let mut expense_daily = vec![0_i64; days as usize];
    let mut income_daily = vec![0_i64; days as usize];
    let mut expense_count = 0_i64;
    let mut income_count = 0_i64;

    let mut statement = conn.prepare(
        "SELECT day, kind, SUM(amount_cents), COUNT(*)
         FROM transactions
         WHERE book_id = ?1 AND month = ?2
         GROUP BY day, kind",
    )?;
    let rows = statement.query_map(params![book_id, month], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, i64>(2)?,
            row.get::<_, i64>(3)?,
        ))
    })?;
    for row in rows {
        let (day, kind, total, count) = row?;
        let Some((_, _, day_number)) = dates::parse_day_key(&day) else {
            return Err(LedgerError::corrupt(format!("账单日期非法：{day}")));
        };
        let index = (day_number - 1) as usize;
        match EntryKind::from_db(&kind) {
            Some(EntryKind::Expense) => {
                expense_daily[index] += total;
                expense_count += count;
            }
            Some(EntryKind::Income) => {
                income_daily[index] += total;
                income_count += count;
            }
            None => return Err(LedgerError::corrupt(format!("账单类型非法：{kind}"))),
        }
    }

    let balance_daily: Vec<i64> = income_daily
        .iter()
        .zip(expense_daily.iter())
        .map(|(income, expense)| income - expense)
        .collect();

    Ok(MonthStats {
        month: month.to_string(),
        days: days as i64,
        expense: build_kind_stats(month, expense_daily, expense_count, days),
        income: build_kind_stats(month, income_daily, income_count, days),
        balance: build_kind_stats(month, balance_daily, expense_count + income_count, days),
    })
}

/// 半舍入（远离零）的整数除法：结余为负时也要对称。
fn div_round(value: i64, divisor: i64) -> i64 {
    if divisor <= 0 {
        return 0;
    }
    let half = divisor / 2;
    if value >= 0 {
        (value + half) / divisor
    } else {
        -((-value + half) / divisor)
    }
}

fn build_kind_stats(month: &str, daily: Vec<i64>, count: i64, days: u32) -> KindMonthStats {
    let total_cents: i64 = daily.iter().sum();
    let mut max_day_cents = 0_i64;
    let mut max_day = None;
    // 「单日最高」按绝对值比较，但保留原符号（结余为负时也要能看出是哪天跌得最狠）
    for (index, value) in daily.iter().enumerate() {
        if value.abs() > max_day_cents.abs() {
            max_day_cents = *value;
            max_day = Some(format!("{month}-{:02}", index + 1));
        }
    }
    KindMonthStats {
        total_cents,
        count,
        max_day_cents,
        max_day,
        daily_average_cents: div_round(total_cents, i64::from(days)),
        daily,
    }
}

/// 年度汇总：本年结余 / 支出 / 收入 + 12 个月序列。
pub fn year_summary(conn: &Connection, book_id: &str, year: i32) -> LedgerResult<YearSummary> {
    let from = dates::month_key(year, 1);
    let to = dates::month_key(year, 12);
    let mut months: Vec<MonthPoint> = (1..=12)
        .map(|month| MonthPoint {
            month: dates::month_key(year, month),
            expense_cents: 0,
            income_cents: 0,
            balance_cents: 0,
            expense_count: 0,
            income_count: 0,
        })
        .collect();

    let mut statement = conn.prepare(
        "SELECT month,
                COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount_cents ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN kind = 'income'  THEN amount_cents ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN kind = 'expense' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN kind = 'income'  THEN 1 ELSE 0 END), 0)
         FROM transactions
         WHERE book_id = ?1 AND month >= ?2 AND month <= ?3
         GROUP BY month",
    )?;
    let rows = statement.query_map(params![book_id, from, to], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, i64>(2)?,
            row.get::<_, i64>(3)?,
            row.get::<_, i64>(4)?,
        ))
    })?;
    for row in rows {
        let (month, expense_cents, income_cents, expense_count, income_count) = row?;
        let Some((_, month_number)) = dates::parse_month_key(&month) else {
            return Err(LedgerError::corrupt(format!("账单月份非法：{month}")));
        };
        let point = &mut months[(month_number - 1) as usize];
        point.expense_cents = expense_cents;
        point.income_cents = income_cents;
        point.balance_cents = income_cents - expense_cents;
        point.expense_count = expense_count;
        point.income_count = income_count;
    }

    let expense_cents = months.iter().map(|point| point.expense_cents).sum();
    let income_cents = months.iter().map(|point| point.income_cents).sum();
    Ok(YearSummary {
        year,
        expense_cents,
        income_cents,
        balance_cents: income_cents - expense_cents,
        months,
    })
}

/// 月度占比 / 排行数据（三种口径一次返回）。
pub fn share_breakdown(
    conn: &Connection,
    book_id: &str,
    from_month: &str,
    to_month: &str,
) -> LedgerResult<ShareBreakdown> {
    if !dates::is_valid_month_key(from_month) || !dates::is_valid_month_key(to_month) {
        return Err(LedgerError::validation("月份格式不合法"));
    }
    let totals = category_totals(conn, book_id, from_month, to_month)?;
    let meta = category_meta(conn)?;
    Ok(ShareBreakdown {
        expense: share_set(shares_for_kind(StatsKind::Expense, &totals, &meta)),
        income: share_set(shares_for_kind(StatsKind::Income, &totals, &meta)),
        balance: share_set(shares_for_kind(StatsKind::Balance, &totals, &meta)),
    })
}

/// 单笔账单排行（本月金额最大的若干笔）。
pub fn transaction_ranks(
    conn: &Connection,
    book_id: &str,
    month: &str,
    kind: StatsKind,
    limit: i64,
) -> LedgerResult<Vec<TransactionRank>> {
    if !dates::is_valid_month_key(month) {
        return Err(LedgerError::validation(format!("月份格式不合法：{month}")));
    }
    transaction_ranks_in_range(conn, book_id, month, month, kind, limit)
}

/// 一整年的单笔排行（年度视图，与月度排行同一套排序与口径）。
pub fn year_transaction_ranks(
    conn: &Connection,
    book_id: &str,
    year: i32,
    kind: StatsKind,
    limit: i64,
) -> LedgerResult<Vec<TransactionRank>> {
    let from = dates::month_key(year, 1);
    let to = dates::month_key(year, 12);
    transaction_ranks_in_range(conn, book_id, &from, &to, kind, limit)
}

fn transaction_ranks_in_range(
    conn: &Connection,
    book_id: &str,
    from_month: &str,
    to_month: &str,
    kind: StatsKind,
    limit: i64,
) -> LedgerResult<Vec<TransactionRank>> {
    let limit = limit.clamp(1, 100);
    let meta = category_meta(conn)?;
    let mut statement = conn.prepare(
        "SELECT id, kind, category_id, amount_cents, day, occurred_at_ms, note
         FROM transactions
         WHERE book_id = ?1 AND month >= ?2 AND month <= ?3 AND (?4 IS NULL OR kind = ?4)
         ORDER BY amount_cents DESC, occurred_at_ms DESC, id
         LIMIT ?5",
    )?;
    let kind_filter = match kind {
        StatsKind::Expense => Some("expense"),
        StatsKind::Income => Some("income"),
        StatsKind::Balance => None,
    };
    let rows = statement.query_map(params![book_id, from_month, to_month, kind_filter, limit], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, i64>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, i64>(5)?,
            row.get::<_, String>(6)?,
        ))
    })?;

    let mut items = Vec::new();
    for row in rows {
        let (id, kind_value, category_id, amount_cents, day, occurred_at_ms, note) = row?;
        let entry_kind = EntryKind::from_db(&kind_value)
            .ok_or_else(|| LedgerError::corrupt(format!("账单类型非法：{kind_value}")))?;
        let fallback = CategoryMeta {
            name: "未知分类".to_string(),
            icon_name: OTHER_BUCKET_ICON.to_string(),
            color: "theme".to_string(),
            hidden: false,
        };
        let info = meta.get(&category_id).unwrap_or(&fallback);
        items.push(TransactionRank {
            id,
            kind: entry_kind,
            category_id,
            category_name: info.name.clone(),
            category_icon_name: info.icon_name.clone(),
            category_color: info.color.clone(),
            amount_cents,
            signed_cents: entry_kind.sign() * amount_cents,
            day,
            occurred_at_ms,
            note,
        });
    }
    Ok(items)
}

/// 资产总览：净资产卡片 + 按月趋势。
///
/// `until_day` 只统计该日（含）之前的账单（通常传今天）。
pub fn assets_overview(
    conn: &Connection,
    book_id: &str,
    until_day: &str,
    months: usize,
) -> LedgerResult<AssetsOverview> {
    let (year, month, _) = dates::parse_day_key(until_day)
        .ok_or_else(|| LedgerError::validation(format!("日期格式不合法：{until_day}")))?;
    let end_month = dates::month_key(year, month);
    let month_list = dates::trailing_months(&end_month, months.max(1))
        .ok_or_else(|| LedgerError::validation("月份格式不合法"))?;

    let mut accounts: Vec<(String, AccountKind)> = Vec::new();
    let mut asset_total: i64 = 0;
    let mut liability_total: i64 = 0;
    {
        let mut statement = conn
            .prepare("SELECT id, kind, initial_balance_cents FROM accounts WHERE book_id = ?1")?;
        let rows = statement.query_map([book_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })?;
        for row in rows {
            let (id, kind_value, initial) = row?;
            let kind = AccountKind::from_db(&kind_value)
                .ok_or_else(|| LedgerError::corrupt(format!("账户类型非法：{kind_value}")))?;
            match kind {
                AccountKind::Asset => asset_total += initial,
                AccountKind::Liability => liability_total += initial,
            }
            accounts.push((id, kind));
        }
    }

    let mut deltas: HashMap<(String, String), i64> = HashMap::new();
    {
        let mut statement = conn.prepare(
            "SELECT account_id, month,
                    SUM(CASE WHEN kind = 'income' THEN amount_cents ELSE -amount_cents END)
             FROM transactions
             WHERE book_id = ?1 AND account_id IS NOT NULL AND day <= ?2
             GROUP BY account_id, month",
        )?;
        let rows = statement.query_map(params![book_id, until_day], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })?;
        for row in rows {
            let (account_id, month, delta) = row?;
            deltas.insert((account_id, month), delta);
        }
    }

    let mut trend = Vec::with_capacity(month_list.len());

    // 趋势窗口之前的账单必须先计入基线。
    //
    // 卡片口径（BRD FR-AST-6/11）是「初始余额 + 截至 until_day 的全部账单」，
    // 趋势只是把这段历史切成按月快照；`month_list` 只有最近 N 个月，
    // 若只累加窗口内的 delta，卡片和同页的账户余额就会对不上（且整体偏移）。
    let mut account_kinds: HashMap<&str, AccountKind> = HashMap::with_capacity(accounts.len());
    for (account_id, kind) in &accounts {
        account_kinds.insert(account_id.as_str(), *kind);
    }
    let window_start = month_list.first().map(String::as_str).unwrap_or("");
    for ((account_id, month), delta) in &deltas {
        if month.as_str() >= window_start {
            continue;
        }
        match account_kinds.get(account_id.as_str()) {
            Some(AccountKind::Asset) => asset_total += delta,
            Some(AccountKind::Liability) => liability_total -= delta,
            None => {}
        }
    }

    for month_key in &month_list {
        for (account_id, kind) in &accounts {
            let delta = deltas
                .get(&(account_id.clone(), month_key.clone()))
                .copied()
                .unwrap_or(0);
            match kind {
                AccountKind::Asset => asset_total += delta,
                AccountKind::Liability => liability_total -= delta,
            }
        }
        trend.push(AssetPoint {
            month: month_key.clone(),
            total_asset_cents: asset_total,
            liability_cents: liability_total,
            net_cents: asset_total - liability_total,
        });
    }

    Ok(AssetsOverview {
        total_asset_cents: asset_total,
        liability_cents: liability_total,
        net_cents: asset_total - liability_total,
        trend,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::seed;
    use crate::test_support::TestLedger;

    #[test]
    fn div_round_is_symmetric() {
        assert_eq!(div_round(10, 3), 3);
        assert_eq!(div_round(11, 3), 4);
        assert_eq!(div_round(-10, 3), -3);
        assert_eq!(div_round(-11, 3), -4);
        assert_eq!(div_round(5, 0), 0);
    }

    #[test]
    fn trailing_months_limits_assets_trend() {
        let ledger = TestLedger::new();
        let overview = ledger
            .assets_overview("book_default", "2025-09-08", 12)
            .expect("overview");
        assert_eq!(overview.trend.len(), 12);
        assert_eq!(overview.trend[0].month, "2024-10");
        assert_eq!(overview.trend[11].month, "2025-09");
        assert_eq!(overview.net_cents, 0);
    }

    #[test]
    fn seed_categories_are_listed_in_grid_order() {
        let ledger = TestLedger::new();
        let categories = ledger.list_categories(false).expect("categories");
        let expense: Vec<_> = categories
            .iter()
            .filter(|item| item.kind == EntryKind::Expense)
            .collect();
        assert_eq!(expense.len(), 37);
        assert_eq!(expense[0].id, "expense_food");
        assert_eq!(expense[0].sort_order, 0);
        assert_eq!(expense[36].id, "expense_game");
        assert_eq!(
            ledger
                .current_book_id()
                .expect("current book")
                .as_deref(),
            Some(seed::DEFAULT_BOOK_ID)
        );
    }
}
