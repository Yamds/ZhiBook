// 记账提醒设置：开关 / 时间 / 标题 / 内容 + 通知权限与省电白名单引导。
//
// 改动即时保存（与设置页其它项一致），原生侧由 `useReminderSync` 统一下发。

import { useEffect, useState } from 'react';
import type { ReminderPreferences } from '../../../core/ipc/types';
import { reminderBridge } from '../../../core/platform/reminderBridge';
import { DEFAULT_REMINDER_PREFERENCES } from '../../../core/services/settings.service';
import { useBackendSettings } from '../../../hooks/preferences/useBackendSettings';
import { BottomSheet } from '../../../shared/ui/BottomSheet';
import { Switch } from '../../../shared/ui/Switch';
import { TextField } from '../../../shared/ui/TextField';
import { TimePicker } from '../../../shared/ui/TimePicker';
import { cn } from '../../../shared/utils/cn';

export interface ReminderSettingsSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

interface NativeStatus {
    available: boolean;
    granted: boolean;
    ignoring: boolean;
}

export function ReminderSettingsSheet({ open, onOpenChange }: ReminderSettingsSheetProps) {
    const { settings, patchBackend } = useBackendSettings();
    const reminder: ReminderPreferences = settings?.reminder ?? DEFAULT_REMINDER_PREFERENCES;
    const [status, setStatus] = useState<NativeStatus>({
        available: false,
        granted: false,
        ignoring: false,
    });

    const refreshStatus = () => {
        setStatus({
            available: reminderBridge.isAvailable(),
            granted: reminderBridge.isPermissionGranted(),
            ignoring: reminderBridge.isIgnoringBatteryOptimizations(),
        });
    };

    useEffect(() => {
        if (open) refreshStatus();
    }, [open]);

    const update = (partial: Partial<ReminderPreferences>) => {
        patchBackend((current) => ({
            ...current,
            reminder: { ...current.reminder, ...partial },
        }));
    };

    const handleToggle = (enabled: boolean) => {
        update({ enabled });
        if (enabled) {
            reminderBridge.requestPermission();
            window.setTimeout(refreshStatus, 800);
        }
    };

    const requestPermission = () => {
        reminderBridge.requestPermission();
        window.setTimeout(refreshStatus, 800);
    };

    return (
        <BottomSheet
            open={open}
            onOpenChange={onOpenChange}
            title="记账提醒"
            description="到点用系统通知提醒你记账"
        >
            <div className="flex flex-col gap-5">
                <div className="flex items-center justify-between rounded-md bg-inset px-3 py-3">
                    <div>
                        <p className="text-[13px] font-medium text-text">开启提醒</p>
                        <p className="mt-0.5 text-[11.5px] text-text-tertiary">
                            默认关闭；开启后每天定时提醒
                        </p>
                    </div>
                    <Switch checked={reminder.enabled} onCheckedChange={handleToggle} />
                </div>

                <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                        <p className="text-[13px] font-medium text-text">提醒时间</p>
                        <p className="mt-0.5 text-[11.5px] text-text-tertiary">每天什么时候提醒</p>
                    </div>
                    <TimePicker
                        hours={reminder.hour}
                        minutes={reminder.minute}
                        onChange={(next) => update({ hour: next.hours, minute: next.minutes })}
                        variant="field"
                        align="end"
                        side="bottom"
                        disabled={!reminder.enabled}
                        aria-label="提醒时间"
                    />
                </div>

                <TextField
                    label="通知标题"
                    maxLength={32}
                    value={reminder.title}
                    onValueChange={(value) => update({ title: value })}
                />
                <TextField
                    label="通知内容"
                    maxLength={64}
                    value={reminder.body}
                    onValueChange={(value) => update({ body: value })}
                />

                {reminder.enabled ? (
                    <div className="flex flex-col gap-2.5 rounded-md bg-inset px-3 py-3">
                        <StatusRow
                            ok={status.granted}
                            label="通知权限"
                            actionLabel={status.granted ? undefined : '去授权'}
                            onAction={status.granted ? undefined : requestPermission}
                        />
                        <StatusRow
                            ok={status.ignoring}
                            label="电池优化白名单"
                            actionLabel={status.ignoring ? undefined : '去设置'}
                            onAction={status.ignoring ? undefined : () => reminderBridge.openBatterySettings()}
                        />
                        <p className="text-[11px] leading-relaxed text-text-tertiary">
                            国产 ROM 的省电策略可能延迟提醒；在系统里「强行停止」App 会取消闹钟，重新打开 App 后自动恢复。
                        </p>
                        <div className="mt-0.5 flex flex-col gap-1.5 border-t border-border-subtle pt-2.5">
                            <p className="text-[12px] font-medium text-text">提高通知到达率</p>
                            <p className="text-[11px] leading-relaxed text-text-secondary">
                                1. 打开系统「最近任务」，把制账卡片
                                <span className="font-medium text-text"> 向下滑 </span>
                                并点「锁定 / 加锁」，让系统不要清理它。
                            </p>
                            <p className="text-[11px] leading-relaxed text-text-secondary">
                                2. 允许通知、加入电池优化白名单（见上）。
                            </p>
                            <p className="text-[11px] leading-relaxed text-text-secondary">
                                3. 不要在系统设置里「强行停止」App，那会取消已排的闹钟。
                            </p>
                            <p className="text-[11px] leading-relaxed text-text-tertiary">
                                没锁住时，后台被清理后通知有概率发不出来。
                            </p>
                        </div>
                    </div>
                ) : null}

                {!status.available ? (
                    <p className="text-[11.5px] text-text-tertiary">
                        当前环境不支持本地通知（仅在 Android App 内生效）。
                    </p>
                ) : null}
            </div>
        </BottomSheet>
    );
}

function StatusRow({
    ok,
    label,
    actionLabel,
    onAction,
}: {
    ok: boolean;
    label: string;
    actionLabel?: string;
    onAction?: () => void;
}) {
    return (
        <div className="flex items-center gap-2">
            <span
                className={cn(
                    'h-2 w-2 shrink-0 rounded-full',
                    ok ? 'bg-success' : 'bg-warning',
                )}
            />
            <span className="text-[12.5px] text-text-secondary">{label}</span>
            <span className={cn('text-[11.5px]', ok ? 'text-success' : 'text-warning')}>
                {ok ? '已就绪' : '待设置'}
            </span>
            {actionLabel && onAction ? (
                <button
                    type="button"
                    onClick={onAction}
                    className="ml-auto rounded-sm bg-surface px-2.5 py-1 text-[11.5px] font-medium text-brand active:opacity-70"
                >
                    {actionLabel}
                </button>
            ) : null}
        </div>
    );
}

export default ReminderSettingsSheet;
