use serde_json::Value;

use tk_domain::errors::MigrationError;
use tk_domain::kinds::SchemaVersion;

/// 配置迁移的单步。SchemaVersion 每抬一格,链上补一步;
/// orchestrator 负责按 from → to 顺序串起来执行。
pub trait MigrationStep: Send + Sync {
    fn id(&self) -> &'static str;
    fn from(&self) -> SchemaVersion;
    fn to(&self) -> SchemaVersion;
    fn apply(&self, payload: &mut Value) -> Result<(), MigrationError>;
}
