//! App 级配置类型
//!
//! - AppSettings: 设置页聚合配置
//! - AppUiPreferences: 外观偏好,与前端 localStorage 偏好 store 同步
//!
//! 约定: 设置项字段用 `#[serde(rename = "camelCase")]` + `default` 兜底,
//! 旧配置文件缺字段时反序列化不会失败,而是落到合理默认值。
//!
//! 记账端只保留「外观」一类设置。历史版本里的退出行为 / 后台策略 /
//! 双指缩放 / 开机自启字段已全部删除: serde 默认忽略未知字段,
//! 所以旧版 `app-settings.json` 可以无损读取,无需迁移步骤。

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::macros::default_true;

fn default_ui_theme() -> String {
    "auto".to_string()
}

fn default_ui_startup_tab() -> String {
    "home".to_string()
}

/// 启动页签白名单，与前端 `src/core/domain/ui/startupTab.ts` 一一对应。
pub const STARTUP_TABS: [&str; 5] = ["bills", "details", "home", "add", "assets"];

/// 非法启动页签一律落回首页（日历），别让脏配置把 App 卡在空白页。
pub fn normalize_startup_tab(raw: &str) -> String {
    if STARTUP_TABS.contains(&raw) {
        raw.to_string()
    } else {
        default_ui_startup_tab()
    }
}

fn default_ui_motion_level() -> String {
    "standard".to_string()
}

fn default_ui_radius_style() -> String {
    "standard".to_string()
}

/// 界面语言。`auto` = 跟随系统（支持列表与回落规则见前端 `core/i18n/languages.ts`）。
fn default_ui_language() -> String {
    "auto".to_string()
}

fn default_ui_motion_speed() -> f64 {
    0.5
}

fn default_infobar_dismiss_info_ms() -> u64 {
    5000
}

fn default_infobar_dismiss_success_ms() -> u64 {
    4000
}

fn default_infobar_dismiss_warning_ms() -> u64 {
    6000
}

fn default_reminder_hour() -> u32 {
    20
}

fn default_reminder_minute() -> u32 {
    0
}

fn default_reminder_title() -> String {
    "Hello~".to_string()
}

fn default_reminder_body() -> String {
    "今天要记得记账哦~".to_string()
}

/// 提醒标题 / 内容长度上限。
pub const REMINDER_TITLE_MAX: usize = 32;
pub const REMINDER_BODY_MAX: usize = 64;

/// 记账提醒（本地系统通知）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct ReminderPreferences {
    /// 是否开启。
    #[serde(rename = "enabled", default)]
    pub enabled: bool,
    /// 提醒时刻（本地时间，0~23）。
    #[serde(rename = "hour", default = "default_reminder_hour")]
    pub hour: u32,
    #[serde(rename = "minute", default = "default_reminder_minute")]
    pub minute: u32,
    #[serde(rename = "title", default = "default_reminder_title")]
    pub title: String,
    #[serde(rename = "body", default = "default_reminder_body")]
    pub body: String,
}

impl Default for ReminderPreferences {
    fn default() -> Self {
        Self {
            enabled: false,
            hour: default_reminder_hour(),
            minute: default_reminder_minute(),
            title: default_reminder_title(),
            body: default_reminder_body(),
        }
    }
}

fn normalize_reminder_text(value: &str, default: &str, max: usize) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return default.to_string();
    }
    trimmed.chars().take(max).collect()
}

/// InfoBar 非 danger 自动关闭时长上限(毫秒),0 = 不自动关
pub const INFOBAR_DISMISS_MS_MAX: u64 = 60_000;

pub fn clamp_infobar_dismiss_ms(raw: u64) -> u64 {
    if raw == 0 {
        return 0;
    }
    raw.clamp(1000, INFOBAR_DISMISS_MS_MAX)
}

/// 外观偏好(后端为权威存储,前端 localStorage 是镜像;
/// 属性名与前端 AppUiPreferences TS 类型由 serde rename 对齐)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct AppUiPreferences {
    #[serde(rename = "theme", default = "default_ui_theme")]
    pub theme: String,
    /// 启动时进入的页签（bills / details / home / add / assets）
    #[serde(rename = "startupTab", default = "default_ui_startup_tab")]
    pub startup_tab: String,
    #[serde(rename = "motionEnabled", default = "default_true")]
    pub motion_enabled: bool,
    #[serde(rename = "motionLevel", default = "default_ui_motion_level")]
    pub motion_level: String,
    #[serde(rename = "motionSpeed", default = "default_ui_motion_speed")]
    pub motion_speed: f64,
    #[serde(rename = "radiusStyle", default = "default_ui_radius_style")]
    pub radius_style: String,
    /// 启动动画(启动页)。关闭后冷启动直接进主界面,不再播放启动层。
    #[serde(rename = "splashEnabled", default = "default_true")]
    pub splash_enabled: bool,
    /// 界面语言（auto / zh-CN）。auto 时由前端按设备语言解析。
    #[serde(rename = "language", default = "default_ui_language")]
    pub language: String,
    /// InfoBar info tone 自动关闭毫秒,0 = 不自动关
    #[serde(
        rename = "infoBarDismissInfoMs",
        default = "default_infobar_dismiss_info_ms"
    )]
    #[ts(type = "number")]
    pub info_bar_dismiss_info_ms: u64,
    /// InfoBar success tone 自动关闭毫秒
    #[serde(
        rename = "infoBarDismissSuccessMs",
        default = "default_infobar_dismiss_success_ms"
    )]
    #[ts(type = "number")]
    pub info_bar_dismiss_success_ms: u64,
    /// InfoBar warning tone 自动关闭毫秒,danger 始终不自动关
    #[serde(
        rename = "infoBarDismissWarningMs",
        default = "default_infobar_dismiss_warning_ms"
    )]
    #[ts(type = "number")]
    pub info_bar_dismiss_warning_ms: u64,
}

impl Default for AppUiPreferences {
    fn default() -> Self {
        Self {
            theme: default_ui_theme(),
            startup_tab: default_ui_startup_tab(),
            motion_enabled: true,
            motion_level: default_ui_motion_level(),
            motion_speed: default_ui_motion_speed(),
            radius_style: default_ui_radius_style(),
            splash_enabled: true,
            language: default_ui_language(),
            info_bar_dismiss_info_ms: default_infobar_dismiss_info_ms(),
            info_bar_dismiss_success_ms: default_infobar_dismiss_success_ms(),
            info_bar_dismiss_warning_ms: default_infobar_dismiss_warning_ms(),
        }
    }
}

/// 设置页 App 级配置聚合
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct AppSettings {
    /// 外观偏好
    #[serde(rename = "uiPreferences", default)]
    pub ui_preferences: AppUiPreferences,
    /// 记账提醒（本地通知）
    #[serde(rename = "reminder", default)]
    pub reminder: ReminderPreferences,
}

impl AppSettings {
    /// 写盘前规范化:区间钳制。
    /// 任何设置字段进来都过一遍,保证落盘值一定合法。
    pub fn normalize(&mut self) {
        let ui = &mut self.ui_preferences;
        ui.startup_tab = normalize_startup_tab(&ui.startup_tab);
        ui.info_bar_dismiss_info_ms = clamp_infobar_dismiss_ms(ui.info_bar_dismiss_info_ms);
        ui.info_bar_dismiss_success_ms = clamp_infobar_dismiss_ms(ui.info_bar_dismiss_success_ms);
        ui.info_bar_dismiss_warning_ms = clamp_infobar_dismiss_ms(ui.info_bar_dismiss_warning_ms);
        let reminder = &mut self.reminder;
        reminder.hour = reminder.hour.min(23);
        reminder.minute = reminder.minute.min(59);
        reminder.title = normalize_reminder_text(
            &reminder.title,
            &default_reminder_title(),
            REMINDER_TITLE_MAX,
        );
        reminder.body = normalize_reminder_text(
            &reminder.body,
            &default_reminder_body(),
            REMINDER_BODY_MAX,
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 空对象反序列化必须还原成 Default:保证没有 app-settings.json 时
    /// 读到的就是一组合理默认值
    #[test]
    fn app_settings_empty_object_falls_back_to_defaults() {
        let parsed: AppSettings = serde_json::from_str("{}").expect("空对象应能反序列化为默认值");
        assert_eq!(parsed, AppSettings::default());
    }

    /// 非默认值整组写入的 round-trip
    #[test]
    fn app_settings_round_trips_non_default_values() {
        let cfg = AppSettings {
            ui_preferences: AppUiPreferences {
                theme: "mocha".to_string(),
                motion_enabled: false,
                motion_speed: 0.8,
                splash_enabled: false,
                info_bar_dismiss_info_ms: 8000,
                ..AppUiPreferences::default()
            },
            ..AppSettings::default()
        };
        let json = serde_json::to_string(&cfg).expect("serialize 不应失败");
        assert!(json.contains(r#""theme":"mocha""#));
        assert!(json.contains(r#""splashEnabled":false"#));
        assert!(json.contains(r#""infoBarDismissInfoMs":8000"#));
        let back: AppSettings = serde_json::from_str(&json).expect("反序列化失败");
        assert_eq!(back, cfg);
    }

    /// 旧版本配置文件带已删除字段(退出行为/后台策略/双指缩放/开机自启)时,
    /// 必须能正常读取并保留还需要的外观偏好。
    #[test]
    fn legacy_config_with_removed_fields_still_reads() {
        let legacy = r#"{
            "closeAction": "tray",
            "afterCloseUiBehavior": "immediate_lightweight",
            "enterLightweightDelaySecs": 60,
            "uiModeOnStartup": "normal",
            "launchOnStartup": true,
            "uiPreferences": {
                "theme": "latte",
                "motionEnabled": true,
                "motionLevel": "rich",
                "motionSpeed": 0.6,
                "radiusStyle": "round",
                "allowPinchZoom": true,
                "infoBarDismissInfoMs": 5000,
                "infoBarDismissSuccessMs": 4000,
                "infoBarDismissWarningMs": 6000
            }
        }"#;
        let parsed: AppSettings = serde_json::from_str(legacy).expect("旧配置应能读取");
        assert_eq!(parsed.ui_preferences.theme, "latte");
        assert_eq!(parsed.ui_preferences.motion_level, "rich");
        assert_eq!(parsed.ui_preferences.radius_style, "round");
        // 已删除字段不再出现在新序列化结果里
        let json = serde_json::to_string(&parsed).expect("serialize 不应失败");
        assert!(!json.contains("closeAction"));
        assert!(!json.contains("allowPinchZoom"));
    }

    #[test]
    fn startup_tab_defaults_to_home_and_rejects_unknown_values() {
        // 缺字段时落到 home
        let parsed: AppSettings = serde_json::from_str("{\"uiPreferences\":{}}").expect("应能读取");
        assert_eq!(parsed.ui_preferences.startup_tab, "home");

        // 合法值保留，非法值（含设置页本身）落回 home
        assert_eq!(normalize_startup_tab("add"), "add");
        assert_eq!(normalize_startup_tab("settings"), "home");
        assert_eq!(normalize_startup_tab(""), "home");
        assert_eq!(normalize_startup_tab("HOME"), "home");

        // normalize() 写盘前会洗掉脏值
        let mut cfg = AppSettings {
            ui_preferences: AppUiPreferences {
                startup_tab: "settings".to_string(),
                ..AppUiPreferences::default()
            },
            ..AppSettings::default()
        };
        cfg.normalize();
        assert_eq!(cfg.ui_preferences.startup_tab, "home");
    }

    #[test]
    fn normalize_clamps_infobar_dismiss_ms() {
        let mut cfg = AppSettings {
            ui_preferences: AppUiPreferences {
                info_bar_dismiss_info_ms: 10,
                ..AppUiPreferences::default()
            },
            ..AppSettings::default()
        };
        cfg.normalize();
        assert_eq!(cfg.ui_preferences.info_bar_dismiss_info_ms, 1000);
    }

    #[test]
    fn reminder_defaults_and_normalization() {
        let parsed: AppSettings = serde_json::from_str("{\"uiPreferences\":{}}").expect("应能读取");
        assert!(!parsed.reminder.enabled);
        assert_eq!(parsed.reminder.hour, 20);
        assert_eq!(parsed.reminder.minute, 0);
        assert_eq!(parsed.reminder.title, "Hello~");
        assert_eq!(parsed.reminder.body, "今天要记得记账哦~");

        let mut cfg = AppSettings {
            reminder: ReminderPreferences {
                enabled: true,
                hour: 99,
                minute: 99,
                title: "   ".to_string(),
                body: "x".repeat(REMINDER_BODY_MAX + 10),
            },
            ..AppSettings::default()
        };
        cfg.normalize();
        assert_eq!(cfg.reminder.hour, 23);
        assert_eq!(cfg.reminder.minute, 59);
        assert_eq!(cfg.reminder.title, "Hello~");
        assert_eq!(cfg.reminder.body.chars().count(), REMINDER_BODY_MAX);
    }
}
