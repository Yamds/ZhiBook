//! Schema 迁移编排器。
//!
//! 模板默认没有业务迁移步骤；新增破坏性配置变更时，在 `migration_steps()`
//! 注册一个 tk-traits::MigrationStep，并把 tk-domain::SchemaVersion::CURRENT
//! 提升。编排器会负责报告、备份和失败状态。

use serde_json::Value;
use tk_domain::{
    BootstrapSnapshot, ConfigError, MigrationError, MigrationReport, MigrationStage,
    MigrationWarning, SchemaVersion,
};
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

/// 一个可直接复制的迁移步骤样例。
///
/// 它没有注册到默认列表，避免模板每次启动执行无意义迁移。
pub struct RenameFieldStep;

impl MigrationStep for RenameFieldStep {
    fn id(&self) -> &'static str {
        "example.rename_old_field"
    }

    fn from(&self) -> SchemaVersion {
        SchemaVersion::new(1)
    }

    fn to(&self) -> SchemaVersion {
        SchemaVersion::new(2)
    }

    fn apply(&self, payload: &mut Value) -> Result<(), MigrationError> {
        let Some(object) = payload.as_object_mut() else {
            return Err(MigrationError::InvalidPayload(
                "migration payload must be an object".to_string(),
            ));
        };
        if let Some(value) = object.remove("oldField") {
            object.insert("newField".to_string(), value);
        }
        Ok(())
    }
}

/// 让模板使用方可以在自己的启动流程中把 ConfigError 显式映射成迁移错误。
pub fn config_error(error: ConfigError) -> MigrationError {
    MigrationError::Config(error)
}

#[allow(dead_code)]
fn _example_warning() -> MigrationWarning {
    MigrationWarning::new(
        "example",
        "replace this with a user-facing migration warning",
    )
}

#[allow(dead_code)]
fn _example_stage() -> MigrationStage {
    MigrationStage::Completed
}
