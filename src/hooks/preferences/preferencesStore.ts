// 客户端偏好的模块级 store。纯前端，落盘到 localStorage。
//
// 设置页改动即时生效：settings-draft 调 applySnapshot 一次性写入，
// 后端落盘由 useBackendSettings 防抖。其它页面只读。
//
// 当前承载：
//   theme           auto / light / dark / latte / frappe / macchiato / mocha
//   closeAction     close（退出程序）/ tray（退到后台）
//   motionEnabled   动画总开关。系统级 prefers-reduced-motion 命中时也会被强制覆盖
//   motionLevel     elegant / standard / rich。决定动画风格强度
//   motionSpeed     0.5 ~ 1.5（内部值）。0.5 = 体感 1× 基准，越大越快
//   radiusStyle     square / standard / round。全局圆角风格（统一系数缩放）
//   allowPinchZoom  是否允许双指缩放整个界面

import { useSyncExternalStore } from 'react';
import {
    MOTION_SPEED_DEFAULT,
    MOTION_SPEED_MAX,
    MOTION_SPEED_MIN,
    type MotionLevel,
} from '../../core/design/motion';
import {
    RADIUS_STYLE_DEFAULT,
    type RadiusStyle,
    normalizeRadiusStyle,
    applyRadiusStyle,
} from '../../core/design/radius';
import { syncRootChromeBackground } from '../../core/design/surfaceCanvas';
import { applyPinchZoom } from '../../core/platform/pinchZoom';

export type ThemeMode = 'light' | 'dark' | 'auto' | 'latte' | 'frappe' | 'macchiato' | 'mocha';
export type CloseAction = 'close' | 'tray';

export function normalizeCloseAction(raw: unknown): CloseAction {
    return raw === 'tray' ? 'tray' : 'close';
}

export interface AppPreferences {
    theme: ThemeMode;
    closeAction: CloseAction;
    motionEnabled: boolean;
    motionLevel: MotionLevel;
    motionSpeed: number;
    radiusStyle: RadiusStyle;
    allowPinchZoom: boolean;
}

const STORAGE_KEY = 'yamds-bill:preferences:v1';

const defaultPrefs: AppPreferences = {
    theme: 'auto',
    closeAction: 'close',
    motionEnabled: true,
    motionLevel: 'standard',
    motionSpeed: MOTION_SPEED_DEFAULT,
    radiusStyle: RADIUS_STYLE_DEFAULT,
    allowPinchZoom: true,
};

let state: AppPreferences = loadFromStorage();
const listeners = new Set<() => void>();

function loadFromStorage(): AppPreferences {
    if (typeof window === 'undefined') return defaultPrefs;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaultPrefs;
        const parsed = JSON.parse(raw) as Partial<AppPreferences>;
        return {
            theme: normalizeTheme(parsed.theme),
            closeAction: parsed.closeAction === 'tray' ? 'tray' : 'close',
            motionEnabled: parsed.motionEnabled !== false,
            motionLevel: normalizeMotionLevel(parsed.motionLevel),
            motionSpeed: normalizeMotionSpeed(parsed.motionSpeed),
            radiusStyle: normalizeRadiusStyle(parsed.radiusStyle),
            allowPinchZoom: parsed.allowPinchZoom !== false,
        };
    } catch {
        return defaultPrefs;
    }
}

function persist() {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // localStorage 满了 / 隐私模式；偏好丢就丢，不阻塞业务。
    }
}

const VALID_THEMES: ReadonlySet<ThemeMode> = new Set<ThemeMode>([
    'auto', 'light', 'dark', 'latte', 'frappe', 'macchiato', 'mocha',
]);

function normalizeTheme(raw: unknown): ThemeMode {
    return typeof raw === 'string' && VALID_THEMES.has(raw as ThemeMode)
        ? (raw as ThemeMode)
        : 'auto';
}

function normalizeMotionLevel(raw: unknown): MotionLevel {
    return raw === 'elegant' || raw === 'rich' ? raw : 'standard';
}

function normalizeMotionSpeed(raw: unknown): number {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return MOTION_SPEED_DEFAULT;
    return Math.max(MOTION_SPEED_MIN, Math.min(MOTION_SPEED_MAX, raw));
}

function notify() {
    for (const fn of listeners) fn();
}

function update(patch: Partial<AppPreferences>) {
    state = { ...state, ...patch };
    persist();
    notify();
    applySideEffects();
}

/// 把当前偏好应用到 DOM / window。`AppNext` 启动时调一次让初始状态生效；
/// 用户切偏好时由 update 自动调。
export function applySideEffects() {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    // 主题：auto 时 attribute 留空让 CSS 走 prefers-color-scheme；
    // 其它值（light / dark / latte / frappe / macchiato / mocha）直接写入。
    if (state.theme === 'auto') {
        root.removeAttribute('data-theme');
    } else {
        root.setAttribute('data-theme', state.theme);
    }
    // 圆角风格：覆盖 :root 上的 --radius-* CSS 变量。
    applyRadiusStyle(state.radiusStyle);
    // 双指缩放：改写 viewport meta，立即生效。
    applyPinchZoom(state.allowPinchZoom);
    syncRootChromeBackground();
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('theme-changed'));
    }
}

export const preferencesStore = {
    get(): AppPreferences {
        return state;
    },
    setTheme(theme: ThemeMode) {
        update({ theme: normalizeTheme(theme) });
    },
    setCloseAction(action: CloseAction) {
        update({ closeAction: action === 'tray' ? 'tray' : 'close' });
    },
    setMotionEnabled(enabled: boolean) {
        update({ motionEnabled: !!enabled });
    },
    setMotionLevel(level: MotionLevel) {
        update({ motionLevel: normalizeMotionLevel(level) });
    },
    setMotionSpeed(speed: number) {
        update({ motionSpeed: normalizeMotionSpeed(speed) });
    },
    setRadiusStyle(style: RadiusStyle) {
        update({ radiusStyle: normalizeRadiusStyle(style) });
    },
    setAllowPinchZoom(enabled: boolean) {
        update({ allowPinchZoom: !!enabled });
    },
    reset() {
        state = { ...defaultPrefs };
        persist();
        notify();
        applySideEffects();
    },
    /** 设置页改动即时落库；不单独对外暴露批量入口之外的形式。 */
    applySnapshot(patch: Partial<AppPreferences>) {
        state = {
            theme: normalizeTheme(patch.theme ?? state.theme),
            closeAction:
                patch.closeAction !== undefined
                    ? normalizeCloseAction(patch.closeAction)
                    : state.closeAction,
            motionEnabled:
                patch.motionEnabled !== undefined ? !!patch.motionEnabled : state.motionEnabled,
            motionLevel: normalizeMotionLevel(patch.motionLevel ?? state.motionLevel),
            motionSpeed: normalizeMotionSpeed(
                patch.motionSpeed !== undefined ? patch.motionSpeed : state.motionSpeed,
            ),
            radiusStyle: normalizeRadiusStyle(
                patch.radiusStyle ?? state.radiusStyle,
            ),
            allowPinchZoom:
                patch.allowPinchZoom !== undefined ? !!patch.allowPinchZoom : state.allowPinchZoom,
        };
        persist();
        notify();
        applySideEffects();
    },
    subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },
};

/// React 视图。组件 mount 时同步 store 当前快照，store 变化时重新渲染。
export function usePreferences(): AppPreferences {
    return useSyncExternalStore(
        (l) => preferencesStore.subscribe(l),
        () => preferencesStore.get(),
        () => state,
    );
}
