// 功能 Tab（原「行为」Tab，P10 改名并移到「外观」之前）。
//
// 设置类功能的入口都收在这里：启动页签、固定收支（P11），
// 后续阶段继续追加记账提醒 / 密码锁 / 数据导入导出。
// 改动即时保存（与外观一致），但**启动页签要下次启动才生效**。

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UI_ICONS } from '../../../core/design/icons';
import { useCloudBackupState } from '../../../hooks/cloud/useCloudBackup';
import { useCurrentBook } from '../../../hooks/ledger';
import { useRecurringRules } from '../../../hooks/ledger/useLedgerRecurring';
import { useBackendSettings } from '../../../hooks/preferences/useBackendSettings';
import { useLockState } from '../../../hooks/security/usePinLock';
import { PinSettingsSheet } from '../../security/PinSettingsSheet';
import { CloudBackupSheet } from '../feature/CloudBackupSheet';
import { DataTransferSheet } from '../feature/DataTransferSheet';
import { ReminderSettingsSheet } from '../feature/ReminderSettingsSheet';
import type { SettingsDraft } from '../settings-draft';
import {
    FieldRow,
    SettingsEntryRow,
    SettingsSection,
    SettingsTabSections,
    StartupTabSegment,
} from '../_shared';
import { RecurringListSheet } from '../feature/RecurringListSheet';

interface Props {
    draft: SettingsDraft | null;
    patchDraft: (patch: Partial<SettingsDraft>) => void;
}

export function FeatureTab({ draft, patchDraft }: Props) {
    const { t } = useTranslation();
    const { currentBook } = useCurrentBook();
    const { data: rules } = useRecurringRules();
    const { settings } = useBackendSettings();
    const { configured } = useLockState();
    const { data: cloudState } = useCloudBackupState();
    const [recurringOpen, setRecurringOpen] = useState(false);
    const [pinOpen, setPinOpen] = useState(false);
    const [reminderOpen, setReminderOpen] = useState(false);
    const [dataOpen, setDataOpen] = useState(false);
    const [cloudOpen, setCloudOpen] = useState(false);

    const bookRules = (rules ?? []).filter((rule) => rule.bookId === currentBook?.id);
    const enabledCount = bookRules.filter((rule) => rule.enabled).length;
    const recurringValue =
        bookRules.length === 0
            ? t('settings.feature.notSet')
            : t('settings.feature.recurringValue', {
                  enabled: enabledCount,
                  total: bookRules.length,
              });
    const reminder = settings?.reminder;
    const reminderValue = reminder?.enabled
        ? t('settings.feature.reminderDailyAt', {
              time: `${String(reminder.hour).padStart(2, '0')}:${String(reminder.minute).padStart(2, '0')}`,
          })
        : t('settings.feature.off');

    if (!draft) return <p className="text-[13px] text-text-tertiary">{t('settings.loading')}</p>;

    return (
        <>
            <SettingsTabSections>
                <SettingsSection title={t('settings.feature.startupSection')} description={t('settings.feature.startupSectionDesc')}>
                    <FieldRow
                        label={t('settings.feature.startupTab')}
                        description={t('settings.feature.startupTabDesc')}
                        layout="stacked"
                        isLast
                    >
                        <StartupTabSegment
                            value={draft.startupTab}
                            onChange={(value) => patchDraft({ startupTab: value })}
                        />
                    </FieldRow>
                </SettingsSection>

                <SettingsSection title={t('settings.feature.ledgerSection')} description={t('settings.feature.ledgerSectionDesc')}>
                    <SettingsEntryRow
                        icon={UI_ICONS.repeat}
                        label={t('settings.feature.recurring')}
                        description={t('settings.feature.recurringDesc')}
                        value={recurringValue}
                        onClick={() => setRecurringOpen(true)}
                    />
                    <SettingsEntryRow
                        icon={UI_ICONS.bell}
                        label={t('settings.feature.reminder')}
                        description={t('settings.feature.reminderDesc')}
                        value={reminderValue}
                        onClick={() => setReminderOpen(true)}
                    />
                </SettingsSection>

                <SettingsSection title={t('settings.feature.securitySection')} description={t('settings.feature.securitySectionDesc')}>
                    <SettingsEntryRow
                        icon={UI_ICONS.lock}
                        label={t('settings.feature.pinLock')}
                        description={t('settings.feature.pinLockDesc')}
                        value={configured ? t('settings.feature.on') : t('settings.feature.off')}
                        onClick={() => setPinOpen(true)}
                    />
                </SettingsSection>

                <SettingsSection title={t('settings.feature.dataSection')} description={t('settings.feature.dataSectionDesc')}>
                    <SettingsEntryRow
                        icon={UI_ICONS.cloudUpload}
                        label={t('settings.feature.cloudBackup')}
                        description={t('settings.feature.cloudBackupDesc')}
                        value={
                            !cloudState?.configured
                                ? t('settings.feature.notConfigured')
                                : cloudState.autoBackupEnabled
                                  ? t('settings.feature.cloudAutoBackup')
                                  : cloudState.lastBackupAtMs
                                    ? t('settings.feature.cloudBackedUp')
                                    : t('settings.feature.cloudPendingFirstBackup')
                        }
                        onClick={() => setCloudOpen(true)}
                    />
                    <SettingsEntryRow
                        icon={UI_ICONS.databaseExport}
                        label={t('settings.feature.dataTransfer')}
                        description={t('settings.feature.dataTransferDesc')}
                        value="JSON + ZIP"
                        onClick={() => setDataOpen(true)}
                    />
                </SettingsSection>
            </SettingsTabSections>

            <RecurringListSheet
                open={recurringOpen}
                onOpenChange={setRecurringOpen}
                bookId={currentBook?.id}
            />
            <PinSettingsSheet open={pinOpen} onOpenChange={setPinOpen} />
            <ReminderSettingsSheet open={reminderOpen} onOpenChange={setReminderOpen} />
            <DataTransferSheet open={dataOpen} onOpenChange={setDataOpen} />
            <CloudBackupSheet open={cloudOpen} onOpenChange={setCloudOpen} />
        </>
    );
}

export default FeatureTab;
