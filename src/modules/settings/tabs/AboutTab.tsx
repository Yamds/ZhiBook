// 「关于」页签：版本 / 简介 / Git 仓库 / 帮助文档 / 开源许可 / 鸣谢。
//
// 不展示包名；版本号来自 tauri.conf.json（经 app 插件读取），浏览器预览下拿不到时
// 退回内置版本标签。仓库与协议链接走 `openExternalUrl`（Tauri opener）。

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import logo from '../../../assets/logo-72.png';
import { UI_ICONS } from '../../../core/design/icons';
import { APP_PRODUCT_NAME_KEY, APP_VERSION_LABEL } from '../../../core/domain/app-meta';
import { openExternalUrl } from '../../../core/ipc/transport';
import { useAppInfo } from '../../../hooks/app/useAppInfo';
import { AppIcon } from '../../../shared/ui/AppIcon';
import {
    SettingsEntryRow,
    SettingsSection,
    SettingsTabSections,
} from '../_shared';
import { HelpSheet } from '../about/HelpSheet';
import { LicensesSheet } from '../about/LicensesSheet';

const REPO_URL = 'https://github.com/Yamds/ZhiBook';
const REPO_LABEL = 'github.com/Yamds/ZhiBook';

export function AboutTab() {
    const { t } = useTranslation();
    const { data, isLoading } = useAppInfo();
    const [helpOpen, setHelpOpen] = useState(false);
    const [licensesOpen, setLicensesOpen] = useState(false);

    const appName = data?.name ?? t(APP_PRODUCT_NAME_KEY);
    const version = isLoading
        ? '—'
        : data?.version
          ? `v${data.version}`
          : APP_VERSION_LABEL;

    return (
        <>
            <SettingsTabSections>
                <SettingsSection
                    title={t('settings.about.aboutTitle')}
                    description={t('settings.about.aboutDesc')}
                    layout="panel"
                >
                    <div className="flex items-center gap-3">
                        <img
                            src={logo}
                            alt={t('settings.about.iconAlt', { name: appName })}
                            className="h-14 w-14 shrink-0 rounded-md"
                            draggable={false}
                        />
                        <div className="min-w-0 flex-1">
                            <p className="text-[16px] font-semibold text-text">{appName}</p>
                            <p className="mt-0.5 flex items-center gap-2 text-[12px] text-text-tertiary">
                                <span className="tabular-nums">{version}</span>
                                <span className="rounded-pill bg-inset px-1.5 py-0.5 text-[10.5px] font-medium">
                                    GPL-3.0
                                </span>
                            </p>
                        </div>
                    </div>

                    <p className="mt-4 text-[12.5px] leading-relaxed text-text-secondary">
                        {t('settings.about.intro')}
                    </p>

                    <div className="mt-4">
                        <p className="text-[12px] font-medium text-text">{t('settings.about.repo')}</p>
                        <button
                            type="button"
                            onClick={() => void openExternalUrl(REPO_URL)}
                            className="mt-1.5 flex w-full items-center gap-2 rounded-md bg-inset px-3 py-2.5 text-left active:bg-muted"
                        >
                            <AppIcon name={UI_ICONS.github} size={16} className="shrink-0 text-text-secondary" />
                            <span className="min-w-0 flex-1 truncate text-[12.5px] text-text">{REPO_LABEL}</span>
                            <AppIcon name={UI_ICONS.openInNew} size={13} className="shrink-0 text-text-tertiary" />
                        </button>
                    </div>
                </SettingsSection>

                <SettingsSection title={t('settings.about.helpSection')} description={t('settings.about.helpSectionDesc')}>
                    <SettingsEntryRow
                        icon={UI_ICONS.help}
                        label={t('settings.about.helpDoc')}
                        description={t('settings.about.helpDocDesc')}
                        onClick={() => setHelpOpen(true)}
                    />
                </SettingsSection>

                <SettingsSection title={t('settings.about.ossSection')} description={t('settings.about.ossSectionDesc')}>
                    <SettingsEntryRow
                        icon={UI_ICONS.license}
                        label={t('settings.about.licenses')}
                        description={t('settings.about.licensesDesc')}
                        value="GPL-3.0"
                        onClick={() => setLicensesOpen(true)}
                    />
                </SettingsSection>

                <SettingsSection title={t('settings.about.creditsSection')} layout="panel">
                    <p className="text-[12.5px] leading-relaxed text-text-secondary">
                        {t('settings.about.creditsBefore')}
                        <span className="font-medium text-text">NapCatQQ-Desktop</span>
                        {t('settings.about.creditsAfter')}
                    </p>
                </SettingsSection>
            </SettingsTabSections>

            <HelpSheet open={helpOpen} onOpenChange={setHelpOpen} />
            <LicensesSheet open={licensesOpen} onOpenChange={setLicensesOpen} />
        </>
    );
}

export default AboutTab;
