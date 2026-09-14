//! Schema 迁移编排器。
//!
//! 模板默认没有业务迁移步骤；新增破坏性配置变更时，在 `migration_steps()`
//! 注册一个 tk-traits::MigrationStep，并把 tk-domain::SchemaVersion::CURRENT
//! 提升。编排器会负责报告、备份和失败状态。

use tk_domain::{BootstrapSnapshot, MigrationError, MigrationReport, SchemaVersion};
use tk_traits::{ConfigStore, MigrationStep};

pub struct MigrationOrchestrator<'a> {
    store: &'a dyn ConfigStore,
}

impl<'a> MigrationOrchestrator<'a> {
    pub fn new(store: &'a dyn ConfigStore) -> Self {
        Self { store }
    }

    pub fn bootstrap(&self) -> BootstrapSnapshot {
        match self.run() {
            Ok(report) => {
                let _ = self.store.save_migration_report(&report);
                BootstrapSnapshot::from_report(report)
            }
            Err(error) => {
                tracing::warn!(target: "tk_config::migration", error = %error, "configuration migration failed");
                let report = MigrationReport::failed(error.to_string());
                let _ = self.store.save_migration_report(&report);
                BootstrapSnapshot::from_report(report)
            }
        }
    }

    pub fn run(&self) -> Result<MigrationReport, MigrationError> {
        let current = self.store.load_schema_version()?;
        if current == SchemaVersion::CURRENT {
            return Ok(MigrationReport::clean());
        }

        let mut payload = serde_json::json!({});
        let mut rules = Vec::new();
        for step in migration_steps() {
            if step.from() == current {
                step.apply(&mut payload)?;
                rules.push(step.id().to_string());
            }
        }

        if rules.is_empty() {
            return Ok(MigrationReport::failed(format!(
                "no migration path from schema version {}",
                current.get()
            )));
        }
        Ok(MigrationReport::migrated(rules))
    }
}

/// 迁移步骤注册表。这里保留空实现作为模板扩展点。
pub fn migration_steps() -> Vec<Box<dyn MigrationStep>> {
    Vec::new()
}
