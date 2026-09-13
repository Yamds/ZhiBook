//! 主键生成。
//!
//! 单机应用不需要全局唯一保证：纳秒时间戳 + 进程内自增计数即可避免碰撞，
//! 同时保持按创建时间大致有序（便于排查）。不引入 uuid 依赖。
//!
//! 例外：内置种子数据使用**稳定 id**（如 `book_default`、`expense_food`），
//! 它们由生成脚本产出，不走这里。

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static COUNTER: AtomicU64 = AtomicU64::new(0);

/// 生成 `{prefix}_{nanos:x}_{seq:x}` 形式的主键。
pub fn new_id(prefix: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos())
        .unwrap_or(0);
    let seq = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{prefix}_{nanos:x}_{seq:x}")
}

/// 当前 Unix 毫秒时间戳。
pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_are_unique_and_prefixed() {
        let first = new_id("tx");
        let second = new_id("tx");
        assert_ne!(first, second);
        assert!(first.starts_with("tx_"));
    }

    #[test]
    fn now_ms_is_after_2020() {
        assert!(now_ms() > 1_577_836_800_000);
    }
}
