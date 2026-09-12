//! App 级配置类型
//!
//! - AppSettings: 设置页聚合配置(窗口行为 / 自启 / 外观偏好)
//! - AppUiPreferences: 外观偏好,与前端 localStorage 偏好store 同步
//!
//! 约定: 设置项字段用 `#[serde(rename = "camelCase")]` + `default` 兜底,
//! 旧配置文件缺字段时反序列化不会失败,而是落到合理默认值。

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::macros::default_true;

string_enum! {
    /// 物理返回键行为
    ///
    /// Android 上没有窗口关闭按钮，返回键就是唯一的退出入口。
    /// 未知值兜底为 Unknown(String), 保证旧配置文件里非标准值不会导致反序列化失败
    #[derive(Debug, Clone, PartialEq, Eq, Default, TS)]
    #[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
    #[ts(type = "\"close\" | \"tray\"")]
    pub enum CloseAction {
        #[default]
        Close => "close",
        Tray => "tray",
    }
}

string_enum! {
    /// 启动时 UI 模式。
    ///
    /// Android 上系统禁止后台广播拉起界面(Android 10+ 后台 Activity 启动限制),
    /// 该项当前不在设置页暴露,保留字段以维持 Schema 稳定。
    #[derive(Debug, Clone, PartialEq, Eq, Default, TS)]
    #[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
    #[ts(type = "\"normal\" | \"tray_only\"")]
    pub enum UiModeOnStartup {
        #[default]
        Normal => "normal",
        TrayOnly => "tray_only",
    }
}

string_enum! {
    /// 退到后台后 WebView 的资源策略。
    ///
    /// 原生侧在 Activity onStop 时通过 JS 桥拉取，到点后结束进程释放内存。
    #[derive(Debug, Clone, PartialEq, Eq, Default, TS)]
    #[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
    #[ts(type = "\"hide\" | \"delayed_lightweight\" | \"immediate_lightweight\"")]
    pub enum AfterCloseUiBehavior {
        Hide => "hide",
        #[default]
        DelayedLightweight => "delayed_lightweight",
        ImmediateLightweight => "immediate_lightweight",
    }
}

fn default_enter_lightweight_delay_secs() -> u32 {
    300
}

pub const LIGHTWEIGHT_DELAY_MIN_SECS: u32 = 60;
pub const LIGHTWEIGHT_DELAY_MAX_SECS: u32 = 1800;

pub fn clamp_lightweight_delay_secs(raw: u32) -> u32 {
    if raw == 0 {
        return 0;
    }
    raw.clamp(LIGHTWEIGHT_DELAY_MIN_SECS, LIGHTWEIGHT_DELAY_MAX_SECS)
}

fn default_ui_theme() -> String {
    "auto".to_string()
}

fn default_ui_motion_level() -> String {
    "standard".to_string()
}

fn default_ui_radius_style() -> String {
    "standard".to_string()
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
    #[serde(rename = "motionEnabled", default = "default_true")]
    pub motion_enabled: bool,
    #[serde(rename = "motionLevel", default = "default_ui_motion_level")]
    pub motion_level: String,
    #[serde(rename = "motionSpeed", default = "default_ui_motion_speed")]
    pub motion_speed: f64,
    #[serde(rename = "radiusStyle", default = "default_ui_radius_style")]
    pub radius_style: String,
    /// 允许双指缩放界面。Android WebView 的 pinch zoom，默认开启。
    #[serde(rename = "allowPinchZoom", default = "default_true")]
    pub allow_pinch_zoom: bool,
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
            motion_enabled: true,
            motion_level: default_ui_motion_level(),
            motion_speed: default_ui_motion_speed(),
            radius_style: default_ui_radius_style(),
            allow_pinch_zoom: true,
            info_bar_dismiss_info_ms: default_infobar_dismiss_info_ms(),
            info_bar_dismiss_success_ms: default_infobar_dismiss_success_ms(),
            info_bar_dismiss_warning_ms: default_infobar_dismiss_warning_ms(),
        }
    }
}

/// 设置页 App 级配置聚合
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../src/core/ipc/generated/domain/")]
pub struct AppSettings {
    /// 物理返回键行为: close 退出程序, tray 退到后台
    #[serde(rename = "closeAction", default)]
    pub close_action: CloseAction,
    /// 退到后台后的界面内存策略
    #[serde(rename = "afterCloseUiBehavior", default)]
    pub after_close_ui_behavior: AfterCloseUiBehavior,
    #[serde(
        rename = "enterLightweightDelaySecs",
        default = "default_enter_lightweight_delay_secs"
    )]
    pub enter_lightweight_delay_secs: u32,
    /// 启动时 UI 模式(Android 端不暴露,见枚举文档)
    #[serde(rename = "uiModeOnStartup", default)]
    pub ui_mode_on_startup: UiModeOnStartup,
    /// 开机自启。Android 10+ 限制后台拉起界面，设置页以只读方式展示。
    #[serde(rename = "launchOnStartup", default)]
    pub launch_on_startup: bool,
    /// 外观偏好
    #[serde(rename = "uiPreferences", default)]
    pub ui_preferences: AppUiPreferences,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            close_action: CloseAction::default(),
            after_close_ui_behavior: AfterCloseUiBehavior::default(),
            enter_lightweight_delay_secs: default_enter_lightweight_delay_secs(),
            ui_mode_on_startup: UiModeOnStartup::default(),
            launch_on_startup: false,
            ui_preferences: AppUiPreferences::default(),
        }
    }
}

impl AppSettings {
    /// 写盘前规范化:未知枚举回落默认、区间钳制。
    /// 任何设置字段进来都过一遍,保证落盘值一定合法。
    pub fn normalize(&mut self) {
        if matches!(self.close_action, CloseAction::Unknown(_)) {
            self.close_action = CloseAction::default();
        }
        if matches!(self.ui_mode_on_startup, UiModeOnStartup::Unknown(_)) {
            self.ui_mode_on_startup = UiModeOnStartup::default();
        }
        if matches!(
            self.after_close_ui_behavior,
            AfterCloseUiBehavior::Unknown(_)
        ) {
            self.after_close_ui_behavior = AfterCloseUiBehavior::default();
        }
        if self.after_close_ui_behavior == AfterCloseUiBehavior::DelayedLightweight {
            self.enter_lightweight_delay_secs =
                clamp_lightweight_delay_secs(self.enter_lightweight_delay_secs);
            if self.enter_lightweight_delay_secs == 0 {
                self.enter_lightweight_delay_secs = default_enter_lightweight_delay_secs();
            }
        }
        let ui = &mut self.ui_preferences;
        ui.info_bar_dismiss_info_ms = clamp_infobar_dismiss_ms(ui.info_bar_dismiss_info_ms);
        ui.info_bar_dismiss_success_ms = clamp_infobar_dismiss_ms(ui.info_bar_dismiss_success_ms);
        ui.info_bar_dismiss_warning_ms = clamp_infobar_dismiss_ms(ui.info_bar_dismiss_warning_ms);
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
        assert_eq!(parsed.close_action, CloseAction::Close);
    }

    /// 非默认值整组写入的 round-trip
    #[test]
    fn app_settings_round_trips_non_default_values() {
        let cfg = AppSettings {
            close_action: CloseAction::Tray,
            after_close_ui_behavior: AfterCloseUiBehavior::DelayedLightweight,
            enter_lightweight_delay_secs: 300,
            ui_mode_on_startup: UiModeOnStartup::TrayOnly,
            launch_on_startup: true,
            ui_preferences: AppUiPreferences {
                theme: "mocha".to_string(),
                ..AppUiPreferences::default()
            },
        };
        let json = serde_json::to_string(&cfg).expect("serialize 不应失败");
        assert!(json.contains(r#""closeAction":"tray""#));
        assert!(json.contains(r#""uiModeOnStartup":"tray_only""#));
        let back: AppSettings = serde_json::from_str(&json).expect("反序列化失败");
        assert_eq!(back, cfg);
    }

    /// string_enum 宏:未知值回落 Unknown 且不丢原文(无损 round-trip)
    #[test]
    fn string_enum_unknown_round_trips() {
        let parsed: CloseAction = serde_json::from_str(r#""minimize""#).expect("未知值不应报错");
        assert_eq!(parsed, CloseAction::Unknown("minimize".to_string()));
        assert_eq!(serde_json::to_string(&parsed).unwrap(), r#""minimize""#);
    }

    #[test]
    fn normalize_clamps_and_repairs_unknown() {
        let mut cfg = AppSettings {
            close_action: CloseAction::Unknown("garbage".to_string()),
            ..AppSettings::default()
        };
        cfg.normalize();
        assert_eq!(cfg.close_action, CloseAction::Close);
    }
}
