//! Layer 3 配置设施。
//!
//! 这里提供可替换的本地实现；业务编排只依赖 tk-traits::ConfigStore，
//! 因此未来可以替换为数据库、远端配置或内存实现。

pub mod data_paths;
pub mod migration;
pub mod store;

pub use data_paths::{
    DataPaths, LOG_KEEP_DAYS, MAX_JSON_BAK_FILES, MAX_LOG_FILES, MAX_MIGRATION_BACKUPS,
};
pub use migration::MigrationOrchestrator;
pub use store::{LocalConfigStore, prune_json_bak_files, prune_migration_backups};
