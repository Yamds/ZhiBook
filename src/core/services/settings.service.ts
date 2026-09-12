// App 设置 IPC 服务。命令名只在这里出现，页面不直接调用 Tauri。

import { invoke, isTauri } from '../ipc/transport';
import type { AppSettings } from '../ipc/types';
import type { AppUiPreferences } from '../ipc/generated/domain/AppUiPreferences';
import {
    normalizeCloseAction,
    type AppPreferences,
    type ThemeMode,
} from '../../hooks/preferences/preferencesStore';
import { MOTION_SPEED_DEFAULT, MOTION_SPEED_MAX, MOTION_SPEED_MIN, type MotionLevel } from '../design/motion';
import { normalizeRadiusStyle } from '../design/radius';

export type AfterCloseUiBehavior = 'hide' | 'delayed_lightweight' | 'immediate_lightweight';
export type UiModeOnStartup = 'normal' | 'tray_only';
export type BackendSettings = AppSettings;

const DEFAULT_UI: AppUiPreferences = {
    theme: 'auto',
    motionEnabled: true,
    motionLevel: 'standard',
    motionSpeed: MOTION_SPEED_DEFAULT,
    radiusStyle: 'standard',
    allowPinchZoom: true,
    infoBarDismissInfoMs: 5000,
    infoBarDismissSuccessMs: 4000,
    infoBarDismissWarningMs: 6000,
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
    closeAction: 'close',
    afterCloseUiBehavior: 'delayed_lightweight',
    enterLightweightDelaySecs: 300,
    uiModeOnStartup: 'normal',
    launchOnStartup: false,
    uiPreferences: DEFAULT_UI,
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

function normalizeAfterClose(value: unknown): AfterCloseUiBehavior {
    return value === 'hide' || value === 'immediate_lightweight' ? value : 'delayed_lightweight';
}

function normalizeUiMode(value: unknown): UiModeOnStartup {
    return value === 'tray_only' ? 'tray_only' : 'normal';
}

export function clientPrefsFromBackend(settings: AppSettings): AppPreferences {
    const ui = settings.uiPreferences ?? DEFAULT_UI;
    return {
        theme: normalizeTheme(ui.theme),
        closeAction: normalizeCloseAction(settings.closeAction),
        motionEnabled: ui.motionEnabled !== false,
        motionLevel: normalizeMotionLevel(ui.motionLevel),
        motionSpeed: normalizeMotionSpeed(ui.motionSpeed),
        radiusStyle: normalizeRadiusStyle(ui.radiusStyle),
        allowPinchZoom: ui.allowPinchZoom !== false,
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

export function settingsWithPreferences(settings: AppSettings, prefs: AppPreferences): AppSettings {
    return {
        ...settings,
        closeAction: prefs.closeAction,
        afterCloseUiBehavior: normalizeAfterClose(settings.afterCloseUiBehavior),
        enterLightweightDelaySecs: Math.max(60, Math.min(1800, Math.round(settings.enterLightweightDelaySecs || 300))),
        uiModeOnStartup: normalizeUiMode(settings.uiModeOnStartup),
        uiPreferences: {
            ...settings.uiPreferences,
            theme: prefs.theme,
            motionEnabled: prefs.motionEnabled,
            motionLevel: prefs.motionLevel,
            motionSpeed: prefs.motionSpeed,
            radiusStyle: prefs.radiusStyle,
            allowPinchZoom: prefs.allowPinchZoom,
        },
    };
}

export { normalizeCloseAction };
