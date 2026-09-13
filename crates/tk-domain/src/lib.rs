//! Layer 1 数据契约: 跨边界类型定义
//!
//! 依赖白名单: serde / serde_json / thiserror / ts-rs。
//! 禁止引入运行时依赖(tokio / reqwest 等)。

#[macro_use]
mod macros;

pub mod app_config;
pub mod backup;
pub mod bootstrap;
pub mod domain_event;
pub mod errors;
pub mod kinds;
pub mod ledger;
pub mod migration;

// 顶层 re-export:下游 crate / Tauri 壳统一从这里拿类型

pub use app_config::{
    AppSettings, AppUiPreferences, REMINDER_BODY_MAX, REMINDER_TITLE_MAX, ReminderPreferences,
    clamp_infobar_dismiss_ms,
};
pub use backup::{BackupCounts, BackupPreview, BackupSummary, ImportSummary};
pub use bootstrap::{BootstrapSnapshot, BootstrapStatus, RepairAction};
pub use domain_event::{DOMAIN_EVENT_ENVELOPE_VERSION, DomainEvent, DomainEventKind};
pub use errors::{AppError, ConfigError, MigrationError, PathError};
pub use kinds::SchemaVersion;
pub use ledger::{
    Account, AccountKind, AccountPatch, AssetPoint, AssetsOverview, Attachment, AttachmentData,
    Book, BookPatch, Category, CategoryPatch, CategoryShare, CategoryShareSet, DaySummary,
    EntryKind, KindMonthStats, MAX_AMOUNT_CENTS, MAX_ATTACHMENTS_PER_TRANSACTION, MAX_NOTE_CHARS,
    MonthPoint, MonthStats, NewAccount, NewAttachment, NewBook, NewCategory, NewRecurringRule,
    NewTransaction, RecurringOccurrence, RecurringRule, RecurringRulePatch, RecurringRun,
    RecurringRunResult, ReorderRequest, ShareBreakdown, StatsKind, Transaction, TransactionPatch,
    TransactionRank, YearSummary,
};
pub use migration::{
    BackupInfo, MigrationOutcome, MigrationReport, MigrationSource, MigrationStage,
    MigrationWarning,
};
