// 云端自动备份触发：启动 / 从后台回前台 / App 开着跨过 05:00 时各检查一次。
//
// 「逻辑日」由前端按本地 05:00 边界算（05:00 前算前一天），Rust 侧按逻辑日幂等，
// 因此同一个逻辑日最多真的备份一次。失败不记当天，下次启动会重试。

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { logicalDayKey, msUntilNextHourBoundary } from '../../core/domain/date';
import { cloudService } from '../../core/services/cloud.service';
import { backupSummaryText, mergeSummaryText } from '../../modules/settings/feature/cloud.logic';
import { ledgerKeys } from '../ledger/queryKeys';
import { pushInfoBar } from '../ui/globalInfoBarStore';
import { useCloudBackupState, useInvalidateCloudBackupState } from './useCloudBackup';

/** 逻辑日边界：本地 05:00。 */
const AUTO_BACKUP_HOUR = 5;

export function useCloudAutoBackup(): void {
    const queryClient = useQueryClient();
    const { data: state } = useCloudBackupState();
    const invalidate = useInvalidateCloudBackupState();
    const [tick, setTick] = useState(0);

    const runningRef = useRef(false);
    const attemptedRef = useRef<string | null>(null);
    // 回调引用每次渲染都会变，放进 ref 才能让 effect 只依赖 ready / tick。
    const callbacksRef = useRef({ queryClient, invalidate });
    callbacksRef.current = { queryClient, invalidate };

    // 未配置 / 没密钥时自动备份没有意义，也不该打扰用户。
    const ready = Boolean(state?.autoBackupEnabled && state?.configured && state?.key);

    // App 保持前台跨过 05:00 时也要检查一次。
    useEffect(() => {
        const timer = setTimeout(
            () => setTick((value) => value + 1),
            msUntilNextHourBoundary(new Date(), AUTO_BACKUP_HOUR),
        );
        return () => clearTimeout(timer);
    }, [tick]);

    // 从后台回到前台。
    useEffect(() => {
        const onVisibility = () => {
            if (document.visibilityState === 'visible') setTick((value) => value + 1);
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
    }, []);

    useEffect(() => {
        if (!ready || runningRef.current) return;
        const day = logicalDayKey(new Date(), AUTO_BACKUP_HOUR);
        // 同一次会话里同一个逻辑日只尝试一次；失败也等下个逻辑日 / 下次启动再试。
        if (attemptedRef.current === day) return;
        attemptedRef.current = day;
        runningRef.current = true;
        void (async () => {
            try {
                const summary = await cloudService.runAutoBackup(day);
                if (!summary) return;
                // 合并了其它设备的数据才会改动本机账本，这时要刷新账本缓存。
                if (summary.merged) {
                    await callbacksRef.current.queryClient.invalidateQueries({
                        queryKey: ledgerKeys.all,
                    });
                }
                await callbacksRef.current.invalidate();
                if (summary.pushed || summary.merged) {
                    pushInfoBar({
                        key: 'cloud-auto-backup',
                        tone: 'success',
                        title: '已自动备份到云端',
                        content: mergeSummaryText(summary.merged) ?? backupSummaryText(summary),
                    });
                }
            } catch (error) {
                pushInfoBar({
                    key: 'cloud-auto-backup-error',
                    tone: 'danger',
                    title: '自动备份失败',
                    content: error instanceof Error ? error.message : String(error),
                });
            } finally {
                runningRef.current = false;
            }
        })();
    }, [ready, tick]);
}
