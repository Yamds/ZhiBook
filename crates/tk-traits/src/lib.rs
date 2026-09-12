//! tk-traits: Layer 2 接口契约
//!
//! 本 crate 只定义 trait + 必要的关联类型,不提供具体实现
//! (LocalConfigStore 等在 tk-config 等下游 crate 里完成)。
//!
//! 跨 crate 数据类型来自 [tk_domain],通过 use tk_domain::... 引入,
//! 避免反向依赖。

pub mod config_store;
pub mod events;
pub mod migration_step;

pub use config_store::{ConfigStore, JsonTransaction, JsonWrite, TransactionReport};
pub use events::{BroadcastEventBus, EventBus, EventFilter, EventSubscription};
pub use migration_step::MigrationStep;
