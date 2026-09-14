// 功能 Tab（原「行为」Tab，P10 改名并移到「外观」之前）。
//
// 设置类功能的入口都收在这里：启动页签、固定收支（P11），
// 后续阶段继续追加记账提醒 / 密码锁 / 数据导入导出。
// 改动即时保存（与外观一致），但**启动页签要下次启动才生效**。

import { useState } from 'react';
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
        bookRules.length === 0 ? '未设置' : `${enabledCount}/${bookRules.length} 启用`;
    const reminder = settings?.reminder;
    const reminderValue = reminder?.enabled
        ? `每天 ${String(reminder.hour).padStart(2, '0')}:${String(reminder.minute).padStart(2, '0')}`
        : '未开启';

    if (!draft) return <p className="text-[13px] text-text-tertiary">正在加载设置…</p>;

    return (
        <>
            <SettingsTabSections>
                <SettingsSection title="启动" description="改动会立即保存，下次启动生效">
                    <FieldRow
                        label="启动页签"
                        description="打开 App 后先进哪个页签；日历是默认首页"
                        layout="stacked"
                        isLast
                    >
                        <StartupTabSegment
                            value={draft.startupTab}
                            onChange={(value) => patchDraft({ startupTab: value })}
                        />
                    </FieldRow>
                </SettingsSection>

                <SettingsSection title="记账" description="自动化记账与提醒">
                    <SettingsEntryRow
                        icon={UI_ICONS.repeat}
                        label="固定收支"
                        description="每天 05:00 自动记一笔固定支出 / 收入；打开 App 时补齐漏掉的天数"
                        value={recurringValue}
                        onClick={() => setRecurringOpen(true)}
                    />
                    <SettingsEntryRow
                        icon={UI_ICONS.bell}
                        label="记账提醒"
                        description="到点用系统通知提醒你记账（App 不在前台也能收到）"
                        value={reminderValue}
                        onClick={() => setReminderOpen(true)}
                    />
                </SettingsSection>

                <SettingsSection title="安全" description="本地隐私保护">
                    <SettingsEntryRow
                        icon={UI_ICONS.lock}
                        label="密码锁"
                        description="打开 App / 离开后台超过 30 秒时需要输入密码"
                        value={configured ? '已开启' : '未开启'}
                        onClick={() => setPinOpen(true)}
                    />
                </SettingsSection>

                <SettingsSection title="数据" description="备份与迁移">
                    <SettingsEntryRow
                        icon={UI_ICONS.cloudUpload}
                        label="云端备份"
                        description="加密后推送到自己的 Git 仓库；多设备共用同一分支自动合并"
                        value={
                            !cloudState?.configured
                                ? '未配置'
                                : cloudState.autoBackupEnabled
                                  ? '自动备份'
                                  : cloudState.lastBackupAtMs
                                    ? '已备份'
                                    : '待首次备份'
                        }
                        onClick={() => setCloudOpen(true)}
                    />
                    <SettingsEntryRow
                        icon={UI_ICONS.databaseExport}
                        label="导入 / 导出"
                        description="导出 zip 备份包（含附件）；导入为覆盖式恢复"
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
