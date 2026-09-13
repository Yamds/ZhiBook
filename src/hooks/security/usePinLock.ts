// 密码锁的 React 接入：状态订阅、启动读取、回前台重新锁定。

import { useEffect, useSyncExternalStore } from 'react';
import { securityService } from '../../core/services/security.service';
import { lockStore, type LockState } from './lockStore';

/** 回前台超过 30 秒判为「离开过」，重新锁定。 */
export const RELOCK_AFTER_MS = 30_000;

export function useLockState(): LockState {
    return useSyncExternalStore(lockStore.subscribe, lockStore.getSnapshot, lockStore.getSnapshot);
}

/**
 * 启动时读取「是否设置密码」并写入 lockStore。
 *
 * @param lockWhenConfigured 已设置密码时是否立即锁定（启动=true；刚设置完=false）。
 */
export async function refreshPinConfigured(lockWhenConfigured = true): Promise<boolean> {
    const configured = await securityService.getPinConfigured();
    lockStore.setConfigured(configured, configured && lockWhenConfigured);
    return configured;
}

/** 挂一次：退到后台超过 [`RELOCK_AFTER_MS`] 回前台时重新锁定。 */
export function useAppLockLifecycle(): void {
    useEffect(() => {
        let hiddenAt = 0;
        const onVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                hiddenAt = Date.now();
                return;
            }
            if (document.visibilityState === 'visible' && hiddenAt > 0) {
                if (Date.now() - hiddenAt >= RELOCK_AFTER_MS) lockStore.lock();
                hiddenAt = 0;
            }
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    }, []);
}
