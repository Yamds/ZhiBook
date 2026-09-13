//! 测试辅助：临时目录 + 已迁移已种子的 [`Ledger`]。
//!
//! 用 `Deref` 暴露内部 `Ledger`，因此 `ledger.list_books()` 这类调用可以直接写。

use std::ops::Deref;

use tempfile::TempDir;

use crate::Ledger;

/// 每个测试独立的临时数据根；`TempDir` 析构时自动清理目录。
pub struct TestLedger {
    ledger: Ledger,
    _temp: TempDir,
}

impl TestLedger {
    pub fn new() -> Self {
        let temp = TempDir::new().expect("创建临时目录");
        let ledger = Ledger::open(temp.path()).expect("打开记账库");
        Self {
            ledger,
            _temp: temp,
        }
    }
}

impl Default for TestLedger {
    fn default() -> Self {
        Self::new()
    }
}

impl Deref for TestLedger {
    type Target = Ledger;

    fn deref(&self) -> &Self::Target {
        &self.ledger
    }
}
