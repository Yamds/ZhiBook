// 后端持久化设置 hook：查询 + 即时保存。
//
// 设置页没有「保存 / 撤销」：每次改动都
//   1. 乐观写入 Query 缓存 —— 控件立刻反映新值，不等 IPC 往返；
//   2. 应用到客户端偏好 —— 主题 / 动效 / 圆角 / 双指缩放当场生效；
//   3. 后端落盘做 250ms 防抖 —— 拖速度滑块不会把磁盘打爆。
//
// 只有失败才弹 InfoBar；成功不再打扰（改一下弹一次提示会很吵）。

import { useCallback, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsService } from '../../core/services/settings.service';
import type { AppSettings } from '../../core/ipc/types';
import {
    applyClientPrefsFromDraft,
    backendFromDraft,
    draftFromBackendAndPrefs,
    type SettingsDraft,
} from '../../modules/settings/settings-draft';
import { pushInfoBar } from '../ui/globalInfoBarStore';

/** 后端设置的 Query key。壳与设置页共用，避免 key 字面量散落。 */
export const APP_SETTINGS_QUERY_KEY = ['appSettings'] as const;

const PERSIST_DEBOUNCE_MS = 250;

export function useBackendSettings() {
    const queryClient = useQueryClient();
    const query = useQuery({ queryKey: APP_SETTINGS_QUERY_KEY, queryFn: settingsService.get });

    const mutation = useMutation({
        mutationFn: (next: AppSettings) => settingsService.set(next),
        onError: (error: Error) => {
            pushInfoBar({
                key: 'app-settings-save',
                tone: 'danger',
                title: '设置保存失败',
                content: error.message || String(error),
            });
        },
    });

    // mutate 的引用每次 render 都会变；放进 ref 才能让 patch 保持稳定。
    const mutationRef = useRef(mutation);
    mutationRef.current = mutation;

    const pendingRef = useRef<AppSettings | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const flush = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        const next = pendingRef.current;
        pendingRef.current = null;
        if (next) mutationRef.current.mutate(next);
    }, []);

    const patch = useCallback((partial: Partial<SettingsDraft>) => {
        const baseline = queryClient.getQueryData<AppSettings>(APP_SETTINGS_QUERY_KEY);
        if (!baseline) return;
        const draft: SettingsDraft = { ...draftFromBackendAndPrefs(baseline), ...partial };
        const next = backendFromDraft(draft, baseline);
        queryClient.setQueryData(APP_SETTINGS_QUERY_KEY, next);
        void applyClientPrefsFromDraft(draft);
        pendingRef.current = next;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(flush, PERSIST_DEBOUNCE_MS);
    }, [queryClient, flush]);

    // 离开设置页时把还没落盘的改动补上，避免防抖窗口内退出丢设置。
    useEffect(() => flush, [flush]);

    return {
        settings: query.data ?? null,
        isLoading: query.isLoading,
        error: query.error,
        /** 改一项设置。立即生效，后端写入防抖。 */
        patch,
    };
}
