use tokio::sync::broadcast;

use tk_domain::domain_event::{DomainEvent, DomainEventKind};

/// 事件订阅过滤器。`None` 字段不参与过滤。
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct EventFilter {
    pub kind: Option<DomainEventKind>,
}

impl EventFilter {
    pub fn all() -> Self {
        Self::default()
    }

    pub fn kind(kind: DomainEventKind) -> Self {
        Self { kind: Some(kind) }
    }

    pub fn matches(&self, event: &DomainEvent) -> bool {
        if let Some(kind) = self.kind
            && event.kind() != kind
        {
            return false;
        }
        true
    }
}

pub struct EventSubscription {
    receiver: broadcast::Receiver<DomainEvent>,
    filter: EventFilter,
}

impl EventSubscription {
    /// 拉取下一条匹配事件。Channel 关闭后返回 None。
    /// Lagged(消费太慢丢消息)只记 warn 后继续,不中断订阅。
    pub async fn next(&mut self) -> Option<DomainEvent> {
        loop {
            match self.receiver.recv().await {
                Ok(event) if self.filter.matches(&event) => return Some(event),
                Ok(_) => continue,
                Err(broadcast::error::RecvError::Lagged(skipped)) => {
                    tracing::warn!(
                        target: "tk::event_bus",
                        skipped,
                        "broadcast receiver lagged; events were dropped"
                    );
                    continue;
                }
                Err(broadcast::error::RecvError::Closed) => return None,
            }
        }
    }
}

pub trait EventBus: Send + Sync {
    fn publish(&self, event: DomainEvent);
    fn subscribe(&self, filter: EventFilter) -> EventSubscription;
}

pub const DEFAULT_BROADCAST_CAPACITY: usize = 1024;

/// broadcast 实现:多生产者多消费者,每个订阅者拿全量并按 filter 过滤。
/// 注意 broadcast 无 backlog:订阅前发的事件直接丢。
#[derive(Debug, Clone)]
pub struct BroadcastEventBus {
    sender: broadcast::Sender<DomainEvent>,
}

impl BroadcastEventBus {
    pub fn new(capacity: usize) -> Self {
        let capacity = capacity.max(1);
        let (sender, _) = broadcast::channel(capacity);
        Self { sender }
    }
}

impl Default for BroadcastEventBus {
    fn default() -> Self {
        Self::new(DEFAULT_BROADCAST_CAPACITY)
    }
}

impl EventBus for BroadcastEventBus {
    fn publish(&self, event: DomainEvent) {
        let _ = self.sender.send(event);
    }

    fn subscribe(&self, filter: EventFilter) -> EventSubscription {
        EventSubscription {
            receiver: self.sender.subscribe(),
            filter,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn filter_blocks_other_kinds() {
        let bus = BroadcastEventBus::default();
        let mut sub = bus.subscribe(EventFilter::kind(DomainEventKind::TaskProgress));

        bus.publish(DomainEvent::app_log_appended("x"));
        bus.publish(DomainEvent::task_progress("t1", 42, "half"));

        let got = sub.next().await.expect("should receive task progress");
        assert!(matches!(
            got,
            DomainEvent::TaskProgress { progress: 42, .. }
        ));
    }

    #[tokio::test]
    async fn all_filter_receives_everything() {
        let bus = BroadcastEventBus::default();
        let mut sub = bus.subscribe(EventFilter::all());

        bus.publish(DomainEvent::app_log_appended("line-1"));
        match sub.next().await {
            Some(DomainEvent::AppLogAppended { line }) => assert_eq!(line, "line-1"),
            other => panic!("unexpected event: {other:?}"),
        }
    }
}
