// 启动早期从 app-settings.json 恢复 UI 偏好，保证 Splash 前主题与圆角已就绪。

import { useEffect } from 'react';
import { settingsService, clientPrefsFromBackend } from '../../core/services/settings.service';
import { applySideEffects, preferencesStore } from './preferencesStore';
import { infoBarDismissPrefsStore } from './infoBarDismissPrefsStore';

let hydratedFromDisk = false;

export async function hydrateAppUiPreferencesFromDisk(): Promise<void> {
    if (hydratedFromDisk) return;
    try {
        const settings = await settingsService.get();
        preferencesStore.applySnapshot(clientPrefsFromBackend(settings));
        infoBarDismissPrefsStore.applyFromUiPreferences(settings.uiPreferences);
        hydratedFromDisk = true;
    } catch {
        applySideEffects();
    }
}

export function useAppUiPreferencesBootstrap(): void {
    useEffect(() => { void hydrateAppUiPreferencesFromDisk(); }, []);
}
