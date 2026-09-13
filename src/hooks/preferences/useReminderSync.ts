// 把记账提醒配置下发给原生（AlarmManager 排程）。
//
// 挂一次即可：设置项变化时重排闹钟；App 启动时也会同步一次（覆盖重装 / 清数据后的状态）。

import { useEffect } from 'react';
import { reminderBridge } from '../../core/platform/reminderBridge';
import { useBackendSettings } from '../preferences/useBackendSettings';

export function useReminderSync(): void {
    const { settings } = useBackendSettings();
    const reminder = settings?.reminder;

    useEffect(() => {
        if (!reminder || !reminderBridge.isAvailable()) return;
        reminderBridge.schedule({
            enabled: reminder.enabled,
            hour: reminder.hour,
            minute: reminder.minute,
            title: reminder.title,
            body: reminder.body,
        });
        // 逐字段依赖：对象每次渲染都是新引用，直接依赖会重复下发。
    }, [
        reminder?.enabled,
        reminder?.hour,
        reminder?.minute,
        reminder?.title,
        reminder?.body,
    ]);
}
