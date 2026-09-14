// 记账提醒设置：开关 / 时间 / 标题 / 内容 + 通知权限与省电白名单引导。
//
// 改动即时保存（与设置页其它项一致），原生侧由 `useReminderSync` 统一下发。

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReminderPreferences } from '../../../core/ipc/types';
import { reminderBridge } from '../../../core/platform/reminderBridge';
import {
    DEFAULT_REMINDER_PREFERENCES,
    REMINDER_BODY_KEY,
    REMINDER_TITLE_KEY,
    isBuiltinReminderBody,
    isBuiltinReminderTitle,
} from '../../../core/services/settings.service';
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
    const { t } = useTranslation();
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
        // 第一次开启时把内置默认文案换成当前语言的版本：标题 / 内容是可编辑数据，
        // 用户改过就不再覆盖（见 isBuiltinReminder*）。
        const localizeMissingDefaults =
            enabled && (isBuiltinReminderTitle(reminder.title) || isBuiltinReminderBody(reminder.body))
                ? {
                      ...(isBuiltinReminderTitle(reminder.title) ? { title: t(REMINDER_TITLE_KEY) } : {}),
                      ...(isBuiltinReminderBody(reminder.body) ? { body: t(REMINDER_BODY_KEY) } : {}),
                  }
                : {};
        update({ enabled, ...localizeMissingDefaults });
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
            title={t('settings.feature.reminder')}
            description={t('settings.reminder.sheetDesc')}
        >
            <div className="flex flex-col gap-5">
                <div className="flex items-center justify-between rounded-md bg-inset px-3 py-3">
                    <div>
                        <p className="text-[13px] font-medium text-text">{t('settings.reminder.enable')}</p>
                        <p className="mt-0.5 text-[11.5px] text-text-tertiary">
                            {t('settings.reminder.enableDesc')}
                        </p>
                    </div>
                    <Switch checked={reminder.enabled} onCheckedChange={handleToggle} />
                </div>

                <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                        <p className="text-[13px] font-medium text-text">{t('settings.reminder.time')}</p>
                        <p className="mt-0.5 text-[11.5px] text-text-tertiary">{t('settings.reminder.timeDesc')}</p>
                    </div>
                    <TimePicker
                        hours={reminder.hour}
                        minutes={reminder.minute}
                        onChange={(next) => update({ hour: next.hours, minute: next.minutes })}
                        variant="field"
                        align="end"
                        side="bottom"
                        disabled={!reminder.enabled}
                        aria-label={t('settings.reminder.time')}
                    />
                </div>

                <TextField
                    label={t('settings.reminder.title')}
                    maxLength={32}
                    value={isBuiltinReminderTitle(reminder.title) ? t(REMINDER_TITLE_KEY) : reminder.title}
                    onValueChange={(value) => update({ title: value })}
                />
                <TextField
                    label={t('settings.reminder.body')}
                    maxLength={64}
                    value={isBuiltinReminderBody(reminder.body) ? t(REMINDER_BODY_KEY) : reminder.body}
                    onValueChange={(value) => update({ body: value })}
                />

                {reminder.enabled ? (
                    <div className="flex flex-col gap-2.5 rounded-md bg-inset px-3 py-3">
                        <StatusRow
                            ok={status.granted}
                            label={t('settings.reminder.permission')}
                            actionLabel={status.granted ? undefined : t('settings.reminder.grant')}
                            onAction={status.granted ? undefined : requestPermission}
                        />
                        <StatusRow
                            ok={status.ignoring}
                            label={t('settings.reminder.batteryWhitelist')}
                            actionLabel={status.ignoring ? undefined : t('settings.reminder.openSettings')}
                            onAction={status.ignoring ? undefined : () => reminderBridge.openBatterySettings()}
                        />
                        <p className="text-[11px] leading-relaxed text-text-tertiary">
                            {t('settings.reminder.romHint')}
                        </p>
                        <div className="mt-0.5 flex flex-col gap-1.5 border-t border-border-subtle pt-2.5">
                            <p className="text-[12px] font-medium text-text">{t('settings.reminder.improveTitle')}</p>
                            <p className="text-[11px] leading-relaxed text-text-secondary">
                                {t('settings.reminder.improveStep1Before')}
                                <span className="font-medium text-text"> {t('settings.reminder.improveStep1Highlight')} </span>
                                {t('settings.reminder.improveStep1After')}
                            </p>
                            <p className="text-[11px] leading-relaxed text-text-secondary">
                                {t('settings.reminder.improveStep2')}
                            </p>
                            <p className="text-[11px] leading-relaxed text-text-secondary">
                                {t('settings.reminder.improveStep3')}
                            </p>
                            <p className="text-[11px] leading-relaxed text-text-tertiary">
                                {t('settings.reminder.improveFootnote')}
                            </p>
                        </div>
                    </div>
                ) : null}

                {!status.available ? (
                    <p className="text-[11.5px] text-text-tertiary">
                        {t('settings.reminder.nativeUnsupported')}
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
    const { t } = useTranslation();
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
                {ok ? t('settings.reminder.ready') : t('settings.reminder.pending')}
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
