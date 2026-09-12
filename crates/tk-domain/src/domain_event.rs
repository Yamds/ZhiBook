// DomainEvent:全系统事件数据类型
//
// 纯 serde 数据结构,零运行时依赖。行为逻辑(EventBus / BroadcastEventBus /
// 订阅过滤)在 tk-traits/events.rs;src-tauri 负责把广播订阅桥接成 WebView 事件。
//
// 关键约定:
// - to_envelope_json() 会注入顶层 `v` 版本字段:前端按 {"v":1,"kind":...} 校验
// - tauri_event_name() 返回的字符串即 Tauri emit 渠道名,是前后端单一字面量来源

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DomainEventKind {
    TaskProgress,
    #[serde(rename = "app_log_appended")]
    AppLogAppended,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum DomainEvent {
    /// 通用任务进度:长任务(下载/安装/批处理)广播进度用
    TaskProgress {
        task_id: String,
        progress: u8,
        message: String,
    },
    /// 桌面日志新增行(设置-日志页实时刷新用)
    #[serde(rename = "app_log_appended")]
    AppLogAppended { line: String },
}

/// 事件信封版本:结构演进时 bump,前端按版本做兼容处理
pub const DOMAIN_EVENT_ENVELOPE_VERSION: u32 = 1;

impl DomainEvent {
    pub fn to_envelope_json(&self) -> Result<String, serde_json::Error> {
        let mut value = serde_json::to_value(self)?;
        if let serde_json::Value::Object(map) = &mut value {
            map.insert(
                "v".to_string(),
                serde_json::Value::from(DOMAIN_EVENT_ENVELOPE_VERSION),
            );
        }
        serde_json::to_string(&value)
    }

    pub fn kind(&self) -> DomainEventKind {
        match self {
            Self::TaskProgress { .. } => DomainEventKind::TaskProgress,
            Self::AppLogAppended { .. } => DomainEventKind::AppLogAppended,
        }
    }

    pub fn tauri_event_name(&self) -> &'static str {
        match self {
            Self::TaskProgress { .. } => "task_progress",
            Self::AppLogAppended { .. } => "app_log_appended",
        }
    }

    // -- helper constructors --

    pub fn task_progress(
        task_id: impl Into<String>,
        progress: u8,
        message: impl Into<String>,
    ) -> Self {
        Self::TaskProgress {
            task_id: task_id.into(),
            progress,
            message: message.into(),
        }
    }

    pub fn app_log_appended(line: impl Into<String>) -> Self {
        Self::AppLogAppended { line: line.into() }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn envelope_json_carries_version_field() {
        let e = DomainEvent::task_progress("t", 50, "half");
        let v = serde_json::to_value(
            serde_json::from_str::<serde_json::Value>(&e.to_envelope_json().expect("serialize"))
                .expect("valid json"),
        )
        .expect("value");
        assert_eq!(v["v"], 1);
        assert_eq!(v["kind"], "task_progress");
    }

    #[test]
    fn tauri_event_name_matches_serde_kind() {
        // 单一字面量来源契约:emit 渠道名 == serde kind 标签
        let events = [
            DomainEvent::task_progress("t", 0, "m"),
            DomainEvent::app_log_appended("line"),
        ];
        for e in events {
            let v = serde_json::to_value(&e).expect("serialize");
            assert_eq!(v["kind"], serde_json::Value::from(e.tauri_event_name()));
        }
    }

    #[test]
    fn round_trip() {
        let e = DomainEvent::TaskProgress {
            task_id: "abc".to_string(),
            progress: 50,
            message: "half".to_string(),
        };
        let json = serde_json::to_string(&e).expect("serialize");
        let back: DomainEvent = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(back, e);
        assert_eq!(back.kind(), DomainEventKind::TaskProgress);
    }
}
