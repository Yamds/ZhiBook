// App 设置 IPC 服务。命令名只在这里出现，页面不直接调用 Tauri。
//
// 记账端只保留「外观偏好」：主题 / 动效 / 圆角 / InfoBar 自动关闭时长。
// 退出行为、后台策略、双指缩放、开机自启都不是设置项（见壳层实现）。

import { invoke, isTauri } from '../ipc/transport';
import type { AppSettings } from '../ipc/types';
import type { AppUiPreferences } from '../ipc/generated/domain/AppUiPreferences';
import type { ReminderPreferences } from '../ipc/generated/domain/ReminderPreferences';
import type { AppPreferences } from '../../hooks/preferences/preferencesStore';
import { MOTION_SPEED_DEFAULT, MOTION_SPEED_MAX, MOTION_SPEED_MIN, type MotionLevel } from '../design/motion';
import { normalizeRadiusStyle } from '../design/radius';
import { normalizeThemeValue } from '../design/themes';
import { DEFAULT_LANGUAGE, normalizeLanguage } from '../i18n/languages';
import { DEFAULT_STARTUP_TAB, normalizeStartupTab } from '../domain/ui/startupTab';

export const DEFAULT_UI_PREFERENCES: AppUiPreferences = {
    theme: 'auto',
    startupTab: DEFAULT_STARTUP_TAB,
    motionEnabled: true,
    motionLevel: 'standard',
    motionSpeed: MOTION_SPEED_DEFAULT,
    radiusStyle: 'standard',
    splashEnabled: true,
    language: DEFAULT_LANGUAGE,
    infoBarDismissInfoMs: 5000,
    infoBarDismissSuccessMs: 4000,
    infoBarDismissWarningMs: 6000,
};

/** 记账提醒默认值（与 Rust `ReminderPreferences::default` 一致）。
 *
 * `title` / `body` 是**落库数据**（用户可改），Rust 侧的种子值是中文；
 * 前端只在“用户从未改过”时用当前语言的默认文案顶替（见 `reminderTextOrDefault`）。
 */
const BUILTIN_REMINDER_TITLE = 'Hello~';
// i18n-allow: 下一行是与 Rust 种子值对齐的**数据**，不是界面文案。
const BUILTIN_REMINDER_BODY = '今天要记得记账哦?~';

export const DEFAULT_REMINDER_PREFERENCES: ReminderPreferences = {
    enabled: false,
    hour: 20,
    minute: 0,
    title: BUILTIN_REMINDER_TITLE,
    body: BUILTIN_REMINDER_BODY,
};

/** 提醒标题 / 内容的默认文案 key（新增语言时只改语言文件）。 */
export const REMINDER_TITLE_KEY = 'settings.reminder.defaultTitle';
export const REMINDER_BODY_KEY = 'settings.reminder.defaultBody';

/** 该字段是否还是内置默认值（不是用户自己写的）。 */
export function isBuiltinReminderTitle(value: string): boolean {
    return value.trim() === BUILTIN_REMINDER_TITLE;
}

export function isBuiltinReminderBody(value: string): boolean {
    return value.trim() === BUILTIN_REMINDER_BODY;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
    uiPreferences: DEFAULT_UI_PREFERENCES,
    reminder: DEFAULT_REMINDER_PREFERENCES,
};

function normalizeMotionLevel(value: unknown): MotionLevel {
    return value === 'elegant' || value === 'rich' ? value : 'standard';
}

function normalizeMotionSpeed(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return MOTION_SPEED_DEFAULT;
    return Math.max(MOTION_SPEED_MIN, Math.min(MOTION_SPEED_MAX, value));
}

export function clientPrefsFromBackend(settings: AppSettings): AppPreferences {
    const ui = settings.uiPreferences ?? DEFAULT_UI_PREFERENCES;
    return {
        theme: normalizeThemeValue(ui.theme),
        startupTab: normalizeStartupTab(ui.startupTab),
        motionEnabled: ui.motionEnabled !== false,
        motionLevel: normalizeMotionLevel(ui.motionLevel),
        motionSpeed: normalizeMotionSpeed(ui.motionSpeed),
        radiusStyle: normalizeRadiusStyle(ui.radiusStyle),
        splashEnabled: ui.splashEnabled !== false,
        language: normalizeLanguage(ui.language),
    };
}

export const settingsService = {
    async get(): Promise<AppSettings> {
        if (!isTauri) return structuredClone(DEFAULT_APP_SETTINGS);
        const value = await invoke<AppSettings>('get_app_settings');
        return value ?? structuredClone(DEFAULT_APP_SETTINGS);
    },
    async set(settings: AppSettings): Promise<void> {
        if (isTauri) await invoke<void>('set_app_settings', { settings });
    },
};

/** 用客户端偏好覆盖后端设置里的 uiPreferences（其余字段原样保留）。 */
export function settingsWithPreferences(settings: AppSettings, prefs: AppPreferences): AppSettings {
    return {
        ...settings,
        uiPreferences: {
            ...(settings.uiPreferences ?? DEFAULT_UI_PREFERENCES),
            theme: prefs.theme,
            startupTab: prefs.startupTab,
            motionEnabled: prefs.motionEnabled,
            motionLevel: prefs.motionLevel,
            motionSpeed: prefs.motionSpeed,
            radiusStyle: prefs.radiusStyle,
            splashEnabled: prefs.splashEnabled,
            language: prefs.language,
        },
    };
}
