//! 进程级领域事件总线（单例）。
//!
//! 为什么必须是单例：`setup` 里如果只把 bus 当成局部变量，`setup` 返回时它就被 drop，
//! 订阅任务随即收到 `Closed` 退出——桥看起来接上了，实际永远收不到事件。
//! 这里用 `OnceLock` 持有唯一实例：宿主在 `setup` 订阅它，任何想广播领域事件的
//! 地方都通过 [`bus()`] 拿到**同一个**实例发布。
//!
//! 当前业务还没有发布者（前端也没有订阅方），这是**刻意保留的扩展点**
//! （见 docs/08 第六·2 节「Rust EventBus 桥」）。保留的前提是桥本身是通的，
//! 否则将来接上发布者时会出现「发了但收不到」这种最难查的隐形故障。

use std::sync::OnceLock;

use tk_traits::BroadcastEventBus;

static BUS: OnceLock<BroadcastEventBus> = OnceLock::new();

/// 进程级事件总线（首次访问时创建，之后永不 drop）。
///
/// 用法：`crate::event_bus::bus().publish(DomainEvent::...)`（需要 `EventBus` trait 在作用域内）。
pub fn bus() -> &'static BroadcastEventBus {
    BUS.get_or_init(BroadcastEventBus::default)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tk_traits::{EventBus, EventFilter};
    use tk_domain::DomainEvent;

    /// 单例必须稳定：多次取到的是同一个实例，且事件真的能送达订阅者。
    #[tokio::test]
    async fn bus_is_shared_and_delivers_events() {
        let mut subscription = bus().subscribe(EventFilter::all());
        bus().publish(DomainEvent::app_log_appended("hello"));
        let event = subscription.next().await.expect("应收到事件");
        assert!(std::ptr::eq(bus(), bus()));
        match event {
            DomainEvent::AppLogAppended { line } => assert_eq!(line, "hello"),
            other => panic!("unexpected event: {other:?}"),
        }
    }
}
