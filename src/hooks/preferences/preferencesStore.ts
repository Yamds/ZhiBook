// 客户端偏好的模块级 store。纯前端，落盘到 localStorage。
//
// 设置页改动即时生效：settings-draft 调 applySnapshot 一次性写入，
// 后端落盘由 useBackendSettings 防抖。其它页面只读。
//
// 当前承载：
//   theme           auto / light / dark / latte / frappe / macchiato / mocha /
//                   everforest-{dark,light}-{hard,soft} / nord（合法值见 core/design/themes）
//   startupTab      启动时进的页签（bills / details / home / add / assets）
//   motionEnabled   动画总开关。系统级 prefers-reduced-motion 命中时也会被强制覆盖
//   motionLevel     elegant / standard / rich。决定动画风格强度
//   motionSpeed     0.5 ~ 1.5（内部值）。0.5 = 体感 1× 基准，越大越快
//   radiusStyle     square / standard / round。全局圆角风格（统一系数缩放）
//   splashEnabled   启动动画开关。关闭后冷启动直接进主界面，不播启动层
//   language        auto / zh-CN。界面文案语言，auto = 跟随系统（合法值见 core/i18n/languages）
//
// 退出行为 / 后台策略 / 双指缩放 / 开机自启已不是设置项：
// 首页返回键固定弹退出确认、退到后台不做特殊处理、缩放始终关闭。

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
import { findTheme, normalizeThemeValue, type ThemeMode } from '../../core/design/themes';
import { syncRootChromeBackground, readSurfaceCanvasColor } from '../../core/design/surfaceCanvas';
import { DEFAULT_LANGUAGE, normalizeLanguage, type AppLanguage } from '../../core/i18n/languages';
import { applyLanguage } from '../../core/i18n';
import {
    DEFAULT_STARTUP_TAB,
    normalizeStartupTab,
    type StartupTab,
} from '../../core/domain/ui/startupTab';

export type { ThemeMode };

export interface AppPreferences {
    theme: ThemeMode;
    startupTab: StartupTab;
    motionEnabled: boolean;
    motionLevel: MotionLevel;
    motionSpeed: number;
    radiusStyle: RadiusStyle;
    splashEnabled: boolean;
    language: AppLanguage;
}

const STORAGE_KEY = 'zhibook:preferences:v1';
/**
 * 首屏底色镜像：`index.html` 的内联引导脚本读它，在 React / CSS 到达前就把
 * `#root` 改成当前主题的画布色（否则暗色主题开机闪一帧白底）。
 * 存色值而不是主题名：新主题不需要再去 index.html 里枚举一遍。
 */
export const CANVAS_MIRROR_KEY = 'zhibook:canvas';

const defaultPrefs: AppPreferences = {
    theme: 'auto',
    startupTab: DEFAULT_STARTUP_TAB,
    motionEnabled: true,
    motionLevel: 'standard',
    motionSpeed: MOTION_SPEED_DEFAULT,
    radiusStyle: RADIUS_STYLE_DEFAULT,
    splashEnabled: true,
    language: DEFAULT_LANGUAGE,
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
            theme: normalizeThemeValue(parsed.theme),
            startupTab: normalizeStartupTab(parsed.startupTab),
            motionEnabled: parsed.motionEnabled !== false,
            motionLevel: normalizeMotionLevel(parsed.motionLevel),
            motionSpeed: normalizeMotionSpeed(parsed.motionSpeed),
            radiusStyle: normalizeRadiusStyle(parsed.radiusStyle),
            splashEnabled: parsed.splashEnabled !== false,
            language: normalizeLanguage(parsed.language),
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

/// 把当前偏好应用到 DOM / window。`AppBootGate` 启动时调一次让初始状态生效；
/// 用户切偏好时由 update 自动调。
export function applySideEffects() {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    // 主题：auto 时 attribute 留空让 CSS 走 prefers-color-scheme；
    // 显式主题（light / dark / catppuccin / everforest / nord）直接写入。
    const definition = findTheme(state.theme);
    if (state.theme === 'auto' || !definition) {
        root.removeAttribute('data-theme');
    } else {
        root.setAttribute('data-theme', state.theme);
    }
    // 纯色平面主题（Catppuccin / Everforest / Nord）关掉角落柔光与启动页极光
    root.setAttribute('data-theme-flat', definition?.flat ? 'true' : 'false');
    // 圆角风格：覆盖 :root 上的 --radius-* CSS 变量。
    applyRadiusStyle(state.radiusStyle);
    // 语言：落到 i18next 与 <html lang>。同步执行，首帧文案就是对的。
    applyLanguage(state.language);
    syncRootChromeBackground();
    mirrorCanvasColorForBoot();
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('theme-changed'));
    }
}

/** 把当前画布色写到 localStorage，给 index.html 的引导脚本用（避免开机闪底）。 */
function mirrorCanvasColorForBoot() {
    if (typeof window === 'undefined') return;
    try {
        const definition = findTheme(state.theme);
        // auto 跟系统走：**不镜像**。镜像值会在系统主题变化后过期，
        // 开机反而闪错颜色；这种情况交给 index.html 里的 prefers-color-scheme 兜底。
        if (!definition || state.theme === 'auto') {
            window.localStorage.removeItem(CANVAS_MIRROR_KEY);
            return;
        }
        const canvas = readSurfaceCanvasColor();
        if (canvas) window.localStorage.setItem(CANVAS_MIRROR_KEY, canvas);
    } catch {
        // 隐私模式 / 存储写满：镜像失败只是闪一下底，不影响功能
    }
}

export const preferencesStore = {
    get(): AppPreferences {
        return state;
    },
    setTheme(theme: ThemeMode) {
        update({ theme: normalizeThemeValue(theme) });
    },
    setStartupTab(tab: StartupTab) {
        update({ startupTab: normalizeStartupTab(tab) });
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
    setLanguage(language: AppLanguage) {
        update({ language: normalizeLanguage(language) });
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
            theme: normalizeThemeValue(patch.theme ?? state.theme),
            startupTab: normalizeStartupTab(patch.startupTab ?? state.startupTab),
            motionEnabled:
                patch.motionEnabled !== undefined ? !!patch.motionEnabled : state.motionEnabled,
            motionLevel: normalizeMotionLevel(patch.motionLevel ?? state.motionLevel),
            motionSpeed: normalizeMotionSpeed(
                patch.motionSpeed !== undefined ? patch.motionSpeed : state.motionSpeed,
            ),
            radiusStyle: normalizeRadiusStyle(
                patch.radiusStyle ?? state.radiusStyle,
            ),
            splashEnabled:
                patch.splashEnabled !== undefined ? !!patch.splashEnabled : state.splashEnabled,
            language: patch.language !== undefined ? normalizeLanguage(patch.language) : state.language,
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
