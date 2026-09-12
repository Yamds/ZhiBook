// 设置页草稿。设置页改动即时生效：先应用客户端偏好，后端写入由
// useBackendSettings 防抖。没有「保存 / 撤销」。

import type { MotionLevel } from '../../core/design/motion';
import { scaleDuration } from '../../core/design/motion';
import type { RadiusStyle } from '../../core/design/radius';
import { playThemeTransition } from '../../core/design/themeTransition';
import type { AppSettings } from '../../core/ipc/types';
import {
    clientPrefsFromBackend,
    settingsWithPreferences,
    type AfterCloseUiBehavior,
    type UiModeOnStartup,
} from '../../core/services/settings.service';
import { preferencesStore, type AppPreferences, type ThemeMode } from '../../hooks/preferences/preferencesStore';

export type SettingsDraft = AppPreferences & {
    afterCloseUiBehavior: AfterCloseUiBehavior;
    enterLightweightDelaySecs: number;
    uiModeOnStartup: UiModeOnStartup;
    launchOnStartup: boolean;
};

export function draftFromBackendAndPrefs(backend: AppSettings): SettingsDraft {
    const client = clientPrefsFromBackend(backend);
    return {
        ...client,
        afterCloseUiBehavior: backend.afterCloseUiBehavior,
        enterLightweightDelaySecs: backend.enterLightweightDelaySecs,
        uiModeOnStartup: backend.uiModeOnStartup,
        launchOnStartup: backend.launchOnStartup,
    };
}

export function backendFromDraft(draft: SettingsDraft, baseline: AppSettings): AppSettings {
    return settingsWithPreferences({
        ...baseline,
        afterCloseUiBehavior: draft.afterCloseUiBehavior,
        enterLightweightDelaySecs: draft.enterLightweightDelaySecs,
        uiModeOnStartup: draft.uiModeOnStartup,
        launchOnStartup: draft.launchOnStartup,
    }, draft);
}

/** 把草稿里的客户端偏好一次性写到 preferencesStore；主题变化时走 View Transition。 */
export async function applyClientPrefsFromDraft(draft: SettingsDraft): Promise<void> {
    const previous = preferencesStore.get();
    const themeChanged = draft.theme !== previous.theme;
    const commit = () => {
        preferencesStore.applySnapshot({
            theme: draft.theme,
            closeAction: draft.closeAction,
            motionEnabled: draft.motionEnabled,
            motionLevel: draft.motionLevel,
            motionSpeed: draft.motionSpeed,
            radiusStyle: draft.radiusStyle,
            allowPinchZoom: draft.allowPinchZoom,
        });
    };

    if (!themeChanged) {
        commit();
        return;
    }

    const enabled = draft.motionEnabled;
    const level = draft.motionLevel;
    // 圆形揭示的本体时长，基准取「体感 1× 下约 1.0s / 1.4s」。
    // scaleDuration 在体感 1×（内部 speed 0.5）时会 ×2，所以字面量是目标秒数的一半。
    const duration = !enabled || level === 'elegant'
        ? 0
        : level === 'rich'
            ? scaleDuration(0.7, draft.motionSpeed)
            : scaleDuration(0.5, draft.motionSpeed);

    await playThemeTransition(commit, {
        enabled,
        level,
        duration,
        easing: 'ease-in-out',
    });
}

export type { MotionLevel, RadiusStyle, ThemeMode };
