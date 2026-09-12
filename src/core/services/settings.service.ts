// App 设置 IPC 服务。命令名只在这里出现，页面不直接调用 Tauri。
//
// 记账端只保留「外观偏好」：主题 / 动效 / 圆角 / InfoBar 自动关闭时长。
// 退出行为、后台策略、双指缩放、开机自启都不是设置项（见壳层实现）。

import { invoke, isTauri } from '../ipc/transport';
import type { AppSettings } from '../ipc/types';
import type { AppUiPreferences } from '../ipc/generated/domain/AppUiPreferences';
import type { AppPreferences, ThemeMode } from '../../hooks/preferences/preferencesStore';
import { MOTION_SPEED_DEFAULT, MOTION_SPEED_MAX, MOTION_SPEED_MIN, type MotionLevel } from '../design/motion';
import { normalizeRadiusStyle } from '../design/radius';

export type BackendSettings = AppSettings;

export const DEFAULT_UI_PREFERENCES: AppUiPreferences = {
    theme: 'auto',
    motionEnabled: true,
    motionLevel: 'standard',
    motionSpeed: MOTION_SPEED_DEFAULT,
    radiusStyle: 'standard',
    infoBarDismissInfoMs: 5000,
    infoBarDismissSuccessMs: 4000,
    infoBarDismissWarningMs: 6000,
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
    uiPreferences: DEFAULT_UI_PREFERENCES,
};

const VALID_THEMES: ReadonlySet<ThemeMode> = new Set<ThemeMode>([
    'auto', 'light', 'dark', 'latte', 'frappe', 'macchiato', 'mocha',
]);

function normalizeTheme(value: unknown): ThemeMode {
    return typeof value === 'string' && VALID_THEMES.has(value as ThemeMode)
        ? value as ThemeMode
        : 'auto';
}

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
        theme: normalizeTheme(ui.theme),
        motionEnabled: ui.motionEnabled !== false,
        motionLevel: normalizeMotionLevel(ui.motionLevel),
        motionSpeed: normalizeMotionSpeed(ui.motionSpeed),
        radiusStyle: normalizeRadiusStyle(ui.radiusStyle),
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
            motionEnabled: prefs.motionEnabled,
            motionLevel: prefs.motionLevel,
            motionSpeed: prefs.motionSpeed,
            radiusStyle: prefs.radiusStyle,
        },
    };
}
