//! 记账域类型（跨 IPC 契约的唯一定义源）。
//!
//! 约定：
//! - 字段 camelCase（serde rename_all），TS 类型由 ts-rs 导出到 `src/core/ipc/generated/domain/`；
//! - 金额一律「分」的整数（i64 → TS number），禁止浮点参与金额运算；
//! - 时间戳一律 Unix 毫秒；
//! - 日期键 day = `YYYY-MM-DD`、month = `YYYY-MM`（本地日历日，由前端按设备时区算出后写入，
//!   Rust 侧不做时区推断）；
//! - 这里只放纯数据：禁止依赖 rusqlite / tauri / 文件系统。

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// 单笔金额上限（分）：¥ 999,999,999.99（与前端 `core/domain/money` 的上限一致）。
pub const MAX_AMOUNT_CENTS: i64 = 99_999_999_999;

/// 单笔账单附件上限（张），见 BRD Q8。
pub const MAX_ATTACHMENTS_PER_TRANSACTION: i64 = 9;

/// 备注最大字符数。
pub const MAX_NOTE_CHARS: usize = 64;

/// 收支方向（分类与账单共用）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub enum EntryKind {
    Expense,
    Income,
}

impl EntryKind {
    /// SQLite 里持久化的字符串。
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Expense => "expense",
            Self::Income => "income",
        }
    }

    /// 从 SQLite 字符串还原。
    pub fn from_db(value: &str) -> Option<Self> {
        match value {
            "expense" => Some(Self::Expense),
            "income" => Some(Self::Income),
            _ => None,
        }
    }

    /// 收入取 +1、支出取 -1（用于结余与账户余额口径）。
    pub fn sign(self) -> i64 {
        match self {
            Self::Income => 1,
            Self::Expense => -1,
        }
    }
}

/// 账户性质：资产 / 负债。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub enum AccountKind {
    Asset,
    Liability,
}

impl AccountKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Asset => "asset",
            Self::Liability => "liability",
        }
    }

    pub fn from_db(value: &str) -> Option<Self> {
        match value {
            "asset" => Some(Self::Asset),
            "liability" => Some(Self::Liability),
            _ => None,
        }
    }

    /// 该账户类型下「一笔账单」对余额的影响方向。
    ///
    /// 资产账户：收入 +、支出 −；负债账户：支出 +（欠更多）、收入 −（还款）。
    pub fn balance_delta(self, kind: EntryKind, amount_cents: i64) -> i64 {
        self.balance_from_signed_delta(0, kind.sign() * amount_cents)
    }

    /// 把「收入 − 支出」形式的累计增量换算成该账户类型的余额。
    ///
    /// 资产账户余额 = 初始 + 增量；负债账户欠款 = 初始 − 增量。
    pub fn balance_from_signed_delta(self, initial_cents: i64, signed_delta_cents: i64) -> i64 {
        match self {
            Self::Asset => initial_cents + signed_delta_cents,
            Self::Liability => initial_cents - signed_delta_cents,
        }
    }
}

/// 统计口径：支出 / 收入 / 结余（收入 − 支出）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub enum StatsKind {
    Expense,
    Income,
    Balance,
}

impl StatsKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Expense => "expense",
            Self::Income => "income",
            Self::Balance => "balance",
        }
    }
}

// ---------------------------------------------------------------------------
// 实体（存储 + 跨 IPC 读取模型）
// ---------------------------------------------------------------------------

/// 账本：数据分区（账单 / 账户 / 统计的最小隔离单位）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct Book {
    pub id: String,
    pub name: String,
    #[ts(type = "number")]
    pub created_at_ms: i64,
    #[ts(type = "number")]
    pub sort_order: i64,
}

/// 账户：资金载体，归属某个账本。
///
/// `balance_cents` 不落库：读取时按「初始余额 + 关联账单累计」聚合得到，
/// 避免出现与账单不一致的冗余余额。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct Account {
    pub id: String,
    pub book_id: String,
    pub kind: AccountKind,
    pub name: String,
    pub icon_name: String,
    /// `theme` 或 `#RRGGBB`。
    pub color: String,
    #[ts(type = "number")]
    pub initial_balance_cents: i64,
    /// 当前余额（分）；资产 / 负债均以正数表示量级，可为负。
    #[ts(type = "number")]
    pub balance_cents: i64,
    #[ts(type = "number")]
    pub sort_order: i64,
    #[ts(type = "number")]
    pub created_at_ms: i64,
    #[ts(type = "number")]
    pub updated_at_ms: i64,
}

/// 分类：全局共享（不随账本隔离），删除 = `hidden` 软删除。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct Category {
    pub id: String,
    pub kind: EntryKind,
    pub name: String,
    pub icon_name: String,
    /// `theme` 或 `#RRGGBB`。
    pub color: String,
    #[ts(type = "number")]
    pub sort_order: i64,
    /// 软删除标记：true 时不出现在宫格，历史账单仍可显示。
    pub hidden: bool,
    #[ts(type = "number")]
    pub created_at_ms: i64,
    #[ts(type = "number")]
    pub updated_at_ms: i64,
}

/// 账单。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct Transaction {
    pub id: String,
    pub book_id: String,
    pub kind: EntryKind,
    pub category_id: String,
    /// 可选关联账户（null = 未指定，只影响收支统计、不影响账户余额）。
    pub account_id: Option<String>,
    /// 金额（分，恒 > 0）。
    #[ts(type = "number")]
    pub amount_cents: i64,
    pub note: String,
    /// `YYYY-MM-DD`（本地日历日）。
    pub day: String,
    /// `YYYY-MM`（冗余，便于按月聚合）。
    pub month: String,
    #[ts(type = "number")]
    pub occurred_at_ms: i64,
    #[ts(type = "number")]
    pub created_at_ms: i64,
    #[ts(type = "number")]
    pub updated_at_ms: i64,
}

/// 附件元信息（文件在磁盘上，数据库只存相对数据根的路径）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct Attachment {
    pub id: String,
    pub transaction_id: String,
    /// 相对 `<data_root>` 的路径，形如 `ledger/attachments/<tx>/<id>.jpg`。
    pub path: String,
    pub mime: String,
    #[ts(type = "number")]
    pub byte_size: i64,
    #[ts(type = "number")]
    pub sort_order: i64,
    #[ts(type = "number")]
    pub created_at_ms: i64,
}

/// 附件内容（展示用；P3 用 base64 over IPC，避免额外协议配置）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct AttachmentData {
    pub attachment: Attachment,
    pub base64: String,
}

// ---------------------------------------------------------------------------
// 写入模型（IPC 入参）
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct NewBook {
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct BookPatch {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct NewAccount {
    pub book_id: String,
    pub kind: AccountKind,
    pub name: String,
    pub icon_name: String,
    pub color: String,
    #[ts(type = "number")]
    pub initial_balance_cents: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct AccountPatch {
    pub id: String,
    pub kind: AccountKind,
    pub name: String,
    pub icon_name: String,
    pub color: String,
    #[ts(type = "number")]
    pub initial_balance_cents: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct NewCategory {
    pub kind: EntryKind,
    pub name: String,
    pub icon_name: String,
    pub color: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct CategoryPatch {
    pub id: String,
    pub name: String,
    pub icon_name: String,
    pub color: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct NewTransaction {
    pub book_id: String,
    pub kind: EntryKind,
    pub category_id: String,
    pub account_id: Option<String>,
    #[ts(type = "number")]
    pub amount_cents: i64,
    pub note: String,
    pub day: String,
    pub month: String,
    #[ts(type = "number")]
    pub occurred_at_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct TransactionPatch {
    pub id: String,
    pub kind: EntryKind,
    pub category_id: String,
    pub account_id: Option<String>,
    #[ts(type = "number")]
    pub amount_cents: i64,
    pub note: String,
    pub day: String,
    pub month: String,
    #[ts(type = "number")]
    pub occurred_at_ms: i64,
}

/// 排序提交：按数组顺序重排（不出现的项保持相对顺序排在末尾）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct ReorderRequest {
    pub ids: Vec<String>,
}

/// 新建附件的入参（前端压缩后的字节流，base64 传输）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct NewAttachment {
    pub transaction_id: String,
    pub mime: String,
    pub base64: String,
}

// ---------------------------------------------------------------------------
// 统计读取模型（Rust 聚合后返回，不落库）
// ---------------------------------------------------------------------------

/// 某月的逐日明细（仅返回有数据的日期，日历用）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct DaySummary {
    pub day: String,
    #[ts(type = "number")]
    pub expense_cents: i64,
    #[ts(type = "number")]
    pub income_cents: i64,
    #[ts(type = "number")]
    pub balance_cents: i64,
    #[ts(type = "number")]
    pub count: i64,
}

/// 单个月份的收支合计（年度卡片 / 环形图用）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct MonthPoint {
    /// `YYYY-MM`。
    pub month: String,
    #[ts(type = "number")]
    pub expense_cents: i64,
    #[ts(type = "number")]
    pub income_cents: i64,
    #[ts(type = "number")]
    pub balance_cents: i64,
}

/// 年度汇总：本年结余 / 支出 / 收入 + 12 个月序列。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct YearSummary {
    pub year: i32,
    #[ts(type = "number")]
    pub expense_cents: i64,
    #[ts(type = "number")]
    pub income_cents: i64,
    #[ts(type = "number")]
    pub balance_cents: i64,
    pub months: Vec<MonthPoint>,
}

/// 单口径的月度统计（详情卡片概览 + 趋势图）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct KindMonthStats {
    /// 口径总额（结余口径 = 收入 − 支出，可为负）。
    #[ts(type = "number")]
    pub total_cents: i64,
    /// 口径笔数（结余口径 = 收入笔数 + 支出笔数）。
    #[ts(type = "number")]
    pub count: i64,
    /// 单日最高（口径内绝对值最大的那天，保留符号）。
    #[ts(type = "number")]
    pub max_day_cents: i64,
    pub max_day: Option<String>,
    /// 日均（总额 / 当月天数，四舍五入）。
    #[ts(type = "number")]
    pub daily_average_cents: i64,
    /// 当月逐日金额（index 0 = 1 日；无数据为 0）。
    /// 走 JSON 传 number：`i64` 直出会被 ts-rs 标成 bigint，与 IPC 实际类型不符。
    #[ts(type = "Array<number>")]
    pub daily: Vec<i64>,
}

/// 月度统计总览：三种口径一次返回。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct MonthStats {
    /// `YYYY-MM`。
    pub month: String,
    #[ts(type = "number")]
    pub days: i64,
    pub expense: KindMonthStats,
    pub income: KindMonthStats,
    pub balance: KindMonthStats,
}

/// 分类占比 / 排行条目。
///
/// `merged = true` 表示这是「其它」合并桶（Top10 之外的项目汇总），
/// 展开明细时用同一个集合的 `all` 字段。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct CategoryShare {
    pub category_id: String,
    pub name: String,
    pub icon_name: String,
    pub color: String,
    /// 带符号金额（结余口径下收入为正、支出为负）。
    #[ts(type = "number")]
    pub amount_cents: i64,
    /// 绝对值（排行与占比都按绝对值排序）。
    #[ts(type = "number")]
    pub abs_amount_cents: i64,
    #[ts(type = "number")]
    pub count: i64,
    /// 占该口径总额的比例（0..1）。
    pub share: f64,
    /// 分类是否已被软删除（历史数据仍要显示）。
    pub hidden: bool,
    pub merged: bool,
}

/// 单口径的完整占比集合。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct CategoryShareSet {
    /// 该口径总额（绝对值之和）。
    #[ts(type = "number")]
    pub total_cents: i64,
    #[ts(type = "number")]
    pub count: i64,
    /// Top10 + 「其它」合并桶（合并桶仅在项目数 > 10 时出现）。
    pub items: Vec<CategoryShare>,
    /// 完整明细（按绝对值降序），用于展开「其它」与类目排行。
    pub all: Vec<CategoryShare>,
}

/// 三种口径的占比集合。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct ShareBreakdown {
    pub expense: CategoryShareSet,
    pub income: CategoryShareSet,
    pub balance: CategoryShareSet,
}

/// 明细排行条目（单笔账单）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct TransactionRank {
    pub id: String,
    pub kind: EntryKind,
    pub category_id: String,
    pub category_name: String,
    pub category_icon_name: String,
    pub category_color: String,
    #[ts(type = "number")]
    pub amount_cents: i64,
    /// 带符号金额：收入为正、支出为负。
    #[ts(type = "number")]
    pub signed_cents: i64,
    pub day: String,
    #[ts(type = "number")]
    pub occurred_at_ms: i64,
    pub note: String,
}

/// 资产趋势的一个月快照。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct AssetPoint {
    /// `YYYY-MM`。
    pub month: String,
    #[ts(type = "number")]
    pub total_asset_cents: i64,
    #[ts(type = "number")]
    pub liability_cents: i64,
    #[ts(type = "number")]
    pub net_cents: i64,
}

/// 资产总览：净资产卡片 + 按月趋势。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct AssetsOverview {
    #[ts(type = "number")]
    pub total_asset_cents: i64,
    #[ts(type = "number")]
    pub liability_cents: i64,
    /// 净资产 = 总资产 − 负债。
    #[ts(type = "number")]
    pub net_cents: i64,
    pub trend: Vec<AssetPoint>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn entry_kind_maps_sign_and_db_string() {
        assert_eq!(EntryKind::Income.sign(), 1);
        assert_eq!(EntryKind::Expense.sign(), -1);
        assert_eq!(EntryKind::from_db("income"), Some(EntryKind::Income));
        assert_eq!(EntryKind::from_db("nope"), None);
    }

    /// 资产账户：收入加、支出减；负债账户：支出加（欠更多）、收入减（还款）。
    #[test]
    fn account_balance_delta_follows_brd_rule() {
        assert_eq!(AccountKind::Asset.balance_delta(EntryKind::Income, 100), 100);
        assert_eq!(AccountKind::Asset.balance_delta(EntryKind::Expense, 100), -100);
        assert_eq!(
            AccountKind::Liability.balance_delta(EntryKind::Expense, 100),
            100
        );
        assert_eq!(
            AccountKind::Liability.balance_delta(EntryKind::Income, 100),
            -100
        );
    }

    /// 累计增量口径：资产 初始 + (收入 − 支出)，负债 初始 − (收入 − 支出)。
    #[test]
    fn account_balance_from_signed_delta() {
        assert_eq!(
            AccountKind::Asset.balance_from_signed_delta(1000, -350),
            650
        );
        assert_eq!(
            AccountKind::Liability.balance_from_signed_delta(1000, 350),
            650
        );
        assert_eq!(
            AccountKind::Liability.balance_from_signed_delta(1000, -350),
            1350
        );
    }

    #[test]
    fn kinds_serialize_to_lowercase() {
        let json = serde_json::to_string(&EntryKind::Expense).expect("serialize");
        assert_eq!(json, "\"expense\"");
        let json = serde_json::to_string(&AccountKind::Liability).expect("serialize");
        assert_eq!(json, "\"liability\"");
        let json = serde_json::to_string(&StatsKind::Balance).expect("serialize");
        assert_eq!(json, "\"balance\"");
    }
}
