use serde::{Deserialize, Serialize};

/// 配置 schema 版本号。落盘迁移报告据此判断是否需要升级。
///
/// 新增破坏性配置变更时:追加 V{n}、把 CURRENT 抬高、并在 tk-config 的
/// MigrationStep 链里补一步(from = 旧版本, to = 新版本)。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct SchemaVersion(pub u16);

impl SchemaVersion {
    pub const V1: Self = Self(1);
    pub const CURRENT: Self = Self::V1;

    pub const fn new(value: u16) -> Self {
        Self(value)
    }

    pub const fn get(self) -> u16 {
        self.0
    }
}

impl From<u16> for SchemaVersion {
    fn from(value: u16) -> Self {
        Self::new(value)
    }
}

impl From<SchemaVersion> for u16 {
    fn from(value: SchemaVersion) -> Self {
        value.get()
    }
}
