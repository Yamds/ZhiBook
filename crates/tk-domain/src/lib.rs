//! Layer 1 数据契约: 跨边界类型定义
//!
//! 依赖白名单: serde / serde_json / thiserror / ts-rs。
//! 禁止引入运行时依赖(tokio / reqwest 等)。

#[macro_use]
mod macros;

pub mod app_config;
pub mod bootstrap;
pub mod domain_event;
pub mod errors;
pub mod kinds;
pub mod migration;

// 顶层 re-export:下游 crate / Tauri 壳统一从这里拿类型

pub use app_config::{AppSettings, AppUiPreferences, clamp_infobar_dismiss_ms};
pub use bootstrap::{BootstrapSnapshot, BootstrapStatus, RepairAction};
pub use domain_event::{DOMAIN_EVENT_ENVELOPE_VERSION, DomainEvent, DomainEventKind};
pub use errors::{AppError, ConfigError, MigrationError, PathError};
pub use kinds::SchemaVersion;
pub use migration::{
    BackupInfo, MigrationOutcome, MigrationReport, MigrationSource, MigrationStage,
    MigrationWarning,
};
