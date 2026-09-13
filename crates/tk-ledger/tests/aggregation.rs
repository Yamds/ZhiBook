//! 聚合验收测试：跨年 / 空月 / 闰月 / 负结余 / 账户联动 / 软删除分类。
//!
//! 全部走公开 API（`Ledger`），与命令层看到的语义一致。
//!
//! 集成测试 crate 里断言失败就该 panic，helper 里的 expect 是预期失败方式，
//! 所以放开这几条针对生产代码的 lint。
#![allow(clippy::expect_used, clippy::unwrap_used, clippy::panic)]

use tk_domain::{
    AccountKind, EntryKind, NewAccount, NewBook, NewCategory, NewTransaction, StatsKind,
};
use tk_ledger::{Ledger, seed};

/// 金额：元 → 分（测试数据用整数元，避免满屏的分）。
fn yuan(value: i64) -> i64 {
    value * 100
}

struct Fixture {
    ledger: Ledger,
    _temp: tempfile::TempDir,
    ticks: std::cell::Cell<i64>,
}

impl Fixture {
    fn new() -> Self {
        let temp = tempfile::tempdir().expect("temp dir");
        let ledger = Ledger::open(temp.path()).expect("open ledger");
        Self {
            ledger,
            _temp: temp,
            ticks: std::cell::Cell::new(0),
        }
    }

    fn book(&self) -> String {
        self.ledger
            .current_book_id()
            .expect("current book")
            .expect("seeded book")
    }

    #[allow(clippy::too_many_arguments)]
    fn add(
        &self,
        kind: EntryKind,
        category_id: &str,
        account_id: Option<&str>,
        amount_cents: i64,
        day: &str,
        note: &str,
    ) -> String {
        let tick = self.ticks.get() + 1;
        self.ticks.set(tick);
        self.ledger
            .create_transaction(NewTransaction {
                book_id: self.book(),
                kind,
                category_id: category_id.to_string(),
                account_id: account_id.map(str::to_string),
                amount_cents,
                note: note.to_string(),
                day: day.to_string(),
                month: day[0..7].to_string(),
                occurred_at_ms: tick,
            })
            .expect("create transaction")
            .id
    }

    fn account(&self, kind: AccountKind, name: &str, initial: i64) -> String {
        self.ledger
            .create_account(NewAccount {
                book_id: self.book(),
                kind,
                name: name.to_string(),
                icon_name: "mdi:cash".to_string(),
                color: "theme".to_string(),
                initial_balance_cents: initial,
            })
            .expect("create account")
            .id
    }
}

#[test]
fn month_stats_fill_every_day_of_a_leap_february() {
    let f = Fixture::new();
    f.add(
        EntryKind::Expense,
        "expense_food",
        None,
        3_550,
        "2024-02-29",
        "闰日午餐",
    );
    f.add(
        EntryKind::Expense,
        "expense_food",
        None,
        1_000,
        "2024-02-01",
        "月初",
    );

    let stats = f.ledger.month_stats(&f.book(), "2024-02").expect("stats");
    assert_eq!(stats.days, 29);
    assert_eq!(stats.expense.daily.len(), 29);
    assert_eq!(stats.expense.total_cents, 4_550);
    assert_eq!(stats.expense.count, 2);
    assert_eq!(stats.expense.daily[0], 1_000);
    assert_eq!(stats.expense.daily[28], 3_550);
    // 4_550 / 29 = 156.9 → 四舍五入 157
    assert_eq!(stats.expense.daily_average_cents, 157);
    assert_eq!(stats.expense.max_day.as_deref(), Some("2024-02-29"));
    assert_eq!(stats.balance.total_cents, -4_550);
}

#[test]
fn empty_month_is_all_zero_and_does_not_fail() {
    let f = Fixture::new();
    let stats = f.ledger.month_stats(&f.book(), "2025-07").expect("stats");
    assert_eq!(stats.days, 31);
    assert_eq!(stats.expense.total_cents, 0);
    assert_eq!(stats.balance.total_cents, 0);
    assert_eq!(stats.balance.max_day, None);
    assert_eq!(stats.balance.daily.iter().sum::<i64>(), 0);

    let year = f.ledger.year_summary(&f.book(), 2025).expect("year");
    assert_eq!(year.months.len(), 12);
    assert!(year.months.iter().all(|point| point.balance_cents == 0));
    assert_eq!(year.balance_cents, 0);

    assert!(
        f.ledger
            .day_summaries(&f.book(), "2025-07")
            .expect("days")
            .is_empty()
    );
}

#[test]
fn year_summary_groups_twelve_months_of_the_same_year() {
    let f = Fixture::new();
    f.add(EntryKind::Income, "income_salary", None, yuan(1000), "2025-01-10", "工资");
    f.add(EntryKind::Expense, "expense_housing", None, yuan(300), "2025-01-15", "房租");
    f.add(EntryKind::Expense, "expense_travel", None, yuan(200), "2024-12-31", "跨年不计入");

    let year = f.ledger.year_summary(&f.book(), 2025).expect("year");
    assert_eq!(year.income_cents, yuan(1000));
    assert_eq!(year.expense_cents, yuan(300));
    assert_eq!(year.balance_cents, yuan(700));
    assert_eq!(year.months[0].balance_cents, yuan(700));
    assert_eq!(year.months[11].balance_cents, 0);
    // 每月笔数（年度概览的「累计笔数」由前端求和）
    assert_eq!(year.months[0].expense_count, 1);
    assert_eq!(year.months[0].income_count, 1);
    assert_eq!(year.months[11].expense_count, 0);
    assert_eq!(year.months.iter().map(|p| p.expense_count).sum::<i64>(), 1);
}

#[test]
fn year_ranks_stay_inside_the_selected_year() {
    let f = Fixture::new();
    f.add(EntryKind::Expense, "expense_food", None, yuan(300), "2025-02-10", "本年");
    f.add(EntryKind::Expense, "expense_food", None, yuan(900), "2024-12-31", "上一年更大的那笔");
    f.add(EntryKind::Expense, "expense_food", None, yuan(100), "2026-01-02", "下一年");

    let ranks = f
        .ledger
        .year_transaction_ranks(&f.book(), 2025, StatsKind::Expense, 10)
        .expect("year ranks");
    assert_eq!(ranks.len(), 1);
    assert_eq!(ranks[0].note, "本年");
    assert_eq!(ranks[0].day, "2025-02-10");

    // 结余口径：同一年里收入 + / 支出 −，排序仍按金额（绝对值）
    f.add(EntryKind::Income, "income_salary", None, yuan(200), "2025-03-01", "奖金");
    let balance = f
        .ledger
        .year_transaction_ranks(&f.book(), 2025, StatsKind::Balance, 10)
        .expect("balance ranks");
    assert_eq!(balance.len(), 2);
    assert_eq!(balance[0].signed_cents, -yuan(300));
    assert_eq!(balance[1].signed_cents, yuan(200));
}

#[test]
fn negative_balance_keeps_sign_in_totals_and_average() {
    let f = Fixture::new();
    f.add(EntryKind::Income, "income_salary", None, yuan(100), "2025-03-05", "工资");
    f.add(EntryKind::Expense, "expense_housing", None, yuan(400), "2025-03-06", "房租");

    let stats = f.ledger.month_stats(&f.book(), "2025-03").expect("stats");
    assert_eq!(stats.balance.total_cents, -yuan(300));
    assert_eq!(stats.balance.count, 2);
    // -30000 / 31 = -967.7 → 四舍五入 -968
    assert_eq!(stats.balance.daily_average_cents, -968);
    assert_eq!(stats.balance.max_day.as_deref(), Some("2025-03-06"));
    // 单日最高看的是「当天结余」，3/6 只有支出 → -400（绝对值最大）
    assert_eq!(stats.balance.max_day_cents, -40_000);
    assert_eq!(stats.balance.daily[4], yuan(100));
    assert_eq!(stats.balance.daily[5], -40_000);
}

#[test]
fn period_share_walks_back_twelve_months_across_the_year_boundary() {
    let f = Fixture::new();
    f.add(EntryKind::Expense, "expense_food", None, yuan(100), "2025-02-01", "窗内最早");
    f.add(EntryKind::Expense, "expense_food", None, yuan(50), "2026-01-31", "窗内最晚");
    f.add(EntryKind::Expense, "expense_food", None, yuan(999), "2025-01-31", "窗外");

    let share = f
        .ledger
        .period_share_breakdown(&f.book(), "2026-01", 12)
        .expect("share");
    assert_eq!(share.expense.total_cents, yuan(150));
    assert_eq!(share.expense.all.len(), 1);
    assert_eq!(share.expense.all[0].category_id, "expense_food");
    assert!((share.expense.all[0].share - 1.0).abs() < f64::EPSILON);
}

#[test]
fn share_breakdown_merges_everything_after_top_ten() {
    let f = Fixture::new();
    // 12 个自定义分类，金额递减，保证排序稳定
    for index in 0..12 {
        let category = f
            .ledger
            .create_category(NewCategory {
                kind: EntryKind::Expense,
                name: format!("分类{index:02}"),
                icon_name: "mdi:tag-outline".to_string(),
                color: "theme".to_string(),
            })
            .expect("create category");
        f.add(
            EntryKind::Expense,
            &category.id,
            None,
            1_000 - index as i64 * 10,
            &format!("2025-05-{:02}", index % 9 + 1),
            "",
        );
    }

    let breakdown = f
        .ledger
        .month_share_breakdown(&f.book(), "2025-05")
        .expect("breakdown");
    assert_eq!(breakdown.expense.all.len(), 12);
    assert_eq!(breakdown.expense.items.len(), 11, "Top10 + 其它");
    let merged = breakdown.expense.items.last().expect("merged bucket");
    assert!(merged.merged);
    assert_eq!(merged.category_id, tk_ledger::query::OTHER_BUCKET_ID);
    assert_eq!(
        merged.count,
        breakdown.expense.all[10..].iter().map(|i| i.count).sum::<i64>()
    );
    let total_share: f64 = breakdown.expense.items.iter().map(|item| item.share).sum();
    assert!((total_share - 1.0).abs() < 1e-9);
    // 排行用同一份数据，按绝对值降序
    assert!(
        breakdown
            .expense
            .all
            .windows(2)
            .all(|pair| pair[0].abs_amount_cents >= pair[1].abs_amount_cents)
    );
}

#[test]
fn hidden_category_disappears_from_grid_but_stays_in_history() {
    let f = Fixture::new();
    let category = f
        .ledger
        .create_category(NewCategory {
            kind: EntryKind::Expense,
            name: "临时".to_string(),
            icon_name: "mdi:tag-outline".to_string(),
            color: "theme".to_string(),
        })
        .expect("create");
    f.add(EntryKind::Expense, &category.id, None, 5_000, "2025-06-06", "旧账");

    f.ledger.hide_category(&category.id).expect("hide");

    let visible = f.ledger.list_categories(false).expect("visible");
    assert!(visible.iter().all(|item| item.id != category.id));
    let all = f.ledger.list_categories(true).expect("all");
    assert!(all.iter().any(|item| item.id == category.id && item.hidden));

    let breakdown = f
        .ledger
        .month_share_breakdown(&f.book(), "2025-06")
        .expect("breakdown");
    assert_eq!(breakdown.expense.all.len(), 1);
    assert!(breakdown.expense.all[0].hidden);
    assert_eq!(breakdown.expense.all[0].name, "临时");
}

#[test]
fn transaction_ranks_split_sign_by_kind() {
    let f = Fixture::new();
    f.add(EntryKind::Expense, "expense_food", None, 34_450, "2025-09-08", "北京-杭州 D888号");
    f.add(EntryKind::Income, "income_salary", None, yuan(1000), "2025-09-10", "工资");
    f.add(EntryKind::Expense, "expense_drink", None, 1_800, "2025-09-11", "咖啡");

    let balance = f
        .ledger
        .transaction_ranks(&f.book(), "2025-09", StatsKind::Balance, 10)
        .expect("ranks");
    assert_eq!(balance.len(), 3);
    assert_eq!(balance[0].signed_cents, yuan(1000));
    assert_eq!(balance[0].kind, EntryKind::Income);
    assert_eq!(balance[1].signed_cents, -34_450);
    assert_eq!(balance[1].note, "北京-杭州 D888号");

    let expense = f
        .ledger
        .transaction_ranks(&f.book(), "2025-09", StatsKind::Expense, 10)
        .expect("ranks");
    assert_eq!(expense.len(), 2);
    assert!(expense.iter().all(|item| item.kind == EntryKind::Expense));
}

#[test]
fn account_balances_follow_asset_and_liability_rules() {
    let f = Fixture::new();
    let wallet = f.account(AccountKind::Asset, "现金", yuan(100));
    let card = f.account(AccountKind::Liability, "信用卡", 0);
    let stray = f.account(AccountKind::Asset, "闲置卡", 0);

    f.add(EntryKind::Expense, "expense_food", Some(&wallet), yuan(30), "2025-04-01", "买菜");
    f.add(EntryKind::Income, "income_salary", Some(&wallet), yuan(200), "2025-04-02", "工资");
    f.add(EntryKind::Expense, "expense_shopping", Some(&card), yuan(80), "2025-04-03", "刷信用卡");
    f.add(EntryKind::Income, "income_repay", Some(&card), yuan(50), "2025-04-04", "还款");
    // 未指定账户：只进统计，不动余额
    f.add(EntryKind::Expense, "expense_food", None, yuan(10), "2025-04-05", "现金买菜");

    let accounts = f
        .ledger
        .list_accounts(&f.book(), "2025-04-30")
        .expect("accounts");
    let balance_of = |id: &str| {
        accounts
            .iter()
            .find(|item| item.id == id)
            .expect("account")
            .balance_cents
    };
    assert_eq!(balance_of(&wallet), yuan(100) - yuan(30) + yuan(200));
    assert_eq!(balance_of(&card), yuan(80) - yuan(50));
    assert_eq!(balance_of(&stray), 0);

    let overview = f
        .ledger
        .assets_overview(&f.book(), "2025-04-30", 3)
        .expect("overview");
    assert_eq!(overview.total_asset_cents, yuan(270));
    assert_eq!(overview.liability_cents, yuan(30));
    assert_eq!(overview.net_cents, yuan(240));
    assert_eq!(overview.trend.len(), 3);
    assert_eq!(overview.trend[0].net_cents, yuan(100), "2 月只有初始余额");
    assert_eq!(overview.trend[2].month, "2025-04");
    assert_eq!(overview.trend[2].net_cents, yuan(240));
}

#[test]
fn future_dated_transactions_do_not_move_the_asset_card() {
    let f = Fixture::new();
    let wallet = f.account(AccountKind::Asset, "现金", yuan(100));
    f.add(EntryKind::Expense, "expense_food", Some(&wallet), yuan(30), "2025-04-20", "未来支出");

    let today = f
        .ledger
        .list_accounts(&f.book(), "2025-04-19")
        .expect("accounts");
    assert_eq!(today[0].balance_cents, yuan(100));
    let later = f
        .ledger
        .list_accounts(&f.book(), "2025-04-20")
        .expect("accounts");
    assert_eq!(later[0].balance_cents, yuan(70));
}

#[test]
fn deleting_account_keeps_transactions_as_unassigned() {
    let f = Fixture::new();
    let wallet = f.account(AccountKind::Asset, "现金", 0);
    let transaction_id = f.add(
        EntryKind::Expense,
        "expense_food",
        Some(&wallet),
        yuan(20),
        "2025-08-08",
        "买菜",
    );

    f.ledger.delete_account(&wallet).expect("delete account");

    let transaction = f
        .ledger
        .get_transaction(&transaction_id)
        .expect("query")
        .expect("账单保留");
    assert_eq!(transaction.account_id, None);
    assert_eq!(
        f.ledger.month_stats(&f.book(), "2025-08").expect("stats").expense.total_cents,
        yuan(20)
    );
}

#[test]
fn books_isolate_transactions_and_assets() {
    let f = Fixture::new();
    f.add(EntryKind::Expense, "expense_food", None, yuan(10), "2025-09-01", "默认账");

    let travel = f
        .ledger
        .create_book(NewBook {
            name: "旅行账".to_string(),
        })
        .expect("create book");
    f.ledger
        .create_transaction(NewTransaction {
            book_id: travel.id.clone(),
            kind: EntryKind::Expense,
            category_id: "expense_travel".to_string(),
            account_id: None,
            amount_cents: yuan(5000),
            note: "机票".to_string(),
            day: "2025-09-02".to_string(),
            month: "2025-09".to_string(),
            occurred_at_ms: 999,
        })
        .expect("create transaction in travel book");

    assert_eq!(
        f.ledger
            .year_summary(&f.book(), 2025)
            .expect("year")
            .expense_cents,
        yuan(10)
    );
    assert_eq!(
        f.ledger
            .year_summary(&travel.id, 2025)
            .expect("year")
            .expense_cents,
        yuan(5000)
    );

    // 分类是全局的：新账本也能用内置分类
    assert_eq!(
        f.ledger
            .list_categories(false)
            .expect("categories")
            .len(),
        47
    );
}

#[test]
fn details_lazy_loading_returns_descending_days_with_limit() {
    let f = Fixture::new();
    for day in 1..=9 {
        f.add(
            EntryKind::Expense,
            "expense_food",
            None,
            i64::from(day) * 100,
            &format!("2025-09-0{day}"),
            "",
        );
    }

    let batch = f
        .ledger
        .list_transactions_range(&f.book(), "2025-09-01", "2025-09-09", 4)
        .expect("range");
    assert_eq!(batch.len(), 4);
    assert_eq!(batch[0].day, "2025-09-09");
    assert_eq!(batch[3].day, "2025-09-06");

    let day_list = f
        .ledger
        .list_transactions_by_day(&f.book(), "2025-09-03")
        .expect("by day");
    assert_eq!(day_list.len(), 1);
    assert_eq!(day_list[0].amount_cents, 300);
}

#[test]
fn seeded_categories_are_available_for_the_add_page() {
    let temp = tempfile::tempdir().expect("temp dir");
    let ledger = Ledger::open(temp.path()).expect("open");
    let categories = ledger.list_categories(false).expect("categories");
    let expense = categories
        .iter()
        .filter(|item| item.kind == EntryKind::Expense)
        .count();
    let income = categories
        .iter()
        .filter(|item| item.kind == EntryKind::Income)
        .count();
    assert_eq!(expense, 37);
    assert_eq!(income, 10);

    let books = ledger.list_books().expect("books");
    assert_eq!(books.len(), 1);
    assert_eq!(books[0].id, seed::DEFAULT_BOOK_ID);
    assert_eq!(books[0].name, seed::DEFAULT_BOOK_NAME);
}
