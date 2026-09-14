// 设置页草稿。设置页改动即时生效：先应用客户端偏好，后端写入由
// useBackendSettings 防抖。没有「保存 / 撤销」。
//
// 草稿就是外观偏好本身：退出行为 / 后台策略 / 双指缩放 / 开机自启都不是设置项。

import type { MotionLevel } from '../../core/design/motion';
import { scaleDuration } from '../../core/design/motion';
import type { RadiusStyle } from '../../core/design/radius';
import { playThemeTransition } from '../../core/design/themeTransition';
import type { AppSettings } from '../../core/ipc/types';
import { clientPrefsFromBackend, settingsWithPreferences } from '../../core/services/settings.service';
import { preferencesStore, type AppPreferences } from '../../hooks/preferences/preferencesStore';
import type { ThemeMode } from '../../core/design/themes';
import type { StartupTab } from '../../core/domain/ui/startupTab';

/** 设置页草稿 = 客户端外观偏好（后端 uiPreferences 的镜像）。 */
export type SettingsDraft = AppPreferences;

export function draftFromBackendAndPrefs(backend: AppSettings): SettingsDraft {
    return clientPrefsFromBackend(backend);
}

export function backendFromDraft(draft: SettingsDraft, baseline: AppSettings): AppSettings {
    return settingsWithPreferences(baseline, draft);
}

/** 把草稿里的客户端偏好一次性写到 preferencesStore；主题变化时走 View Transition。 */
export async function applyClientPrefsFromDraft(draft: SettingsDraft): Promise<void> {
    const previous = preferencesStore.get();
    const themeChanged = draft.theme !== previous.theme;
    const commit = () => {
        preferencesStore.applySnapshot({
            theme: draft.theme,
            startupTab: draft.startupTab,
            motionEnabled: draft.motionEnabled,
            motionLevel: draft.motionLevel,
            motionSpeed: draft.motionSpeed,
            radiusStyle: draft.radiusStyle,
            splashEnabled: draft.splashEnabled,
            language: draft.language,
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

export type { MotionLevel, RadiusStyle, ThemeMode, StartupTab };
