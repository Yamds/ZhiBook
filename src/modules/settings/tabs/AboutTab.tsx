// 「关于」页签：版本 / 简介 / Git 仓库 / 帮助文档 / 新手引导 / 开源许可 / 鸣谢。
//
// 不展示包名；版本号来自 tauri.conf.json（经 app 插件读取），浏览器预览下拿不到时
// 退回内置版本标签。仓库与协议链接走 `openExternalUrl`（Tauri opener）。

import { useState } from 'react';
import logo from '../../../assets/logo-72.png';
import { navigateTo } from '../../../app/navigationStore';
import { UI_ICONS } from '../../../core/design/icons';
import { APP_PRODUCT_NAME, APP_VERSION_LABEL } from '../../../core/domain/app-meta';
import { openExternalUrl } from '../../../core/ipc/transport';
import { useAppInfo } from '../../../hooks/app/useAppInfo';
import { useBackendSettings } from '../../../hooks/preferences/useBackendSettings';
import { startOnboarding } from '../../onboarding/onboardingStore';
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
    const { data, isLoading } = useAppInfo();
    const { patchBackend } = useBackendSettings();
    const [helpOpen, setHelpOpen] = useState(false);
    const [licensesOpen, setLicensesOpen] = useState(false);

    const appName = data?.name ?? APP_PRODUCT_NAME;
    const version = isLoading
        ? '—'
        : data?.version
          ? `v${data.version}`
          : APP_VERSION_LABEL;

    return (
        <>
            <SettingsTabSections>
                <SettingsSection
                    title="关于制账"
                    description="本地优先、离线可用的 Android 记账应用"
                    layout="panel"
                >
                    <div className="flex items-center gap-3">
                        <img
                            src={logo}
                            alt={`${appName} 图标`}
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
                        制账把数据留在你自己手里：账单与附件全部保存在本机，不注册、不联网也能用；
                        需要跨设备时，可选把数据端到端加密后推送到你自己的 Git 仓库。支持日历记账、
                        固定收支、记账提醒、密码锁、多账本与主题换肤。
                    </p>

                    <div className="mt-4">
                        <p className="text-[12px] font-medium text-text">Git 仓库</p>
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

                <SettingsSection title="帮助" description="使用指引与常见问题">
                    <SettingsEntryRow
                        icon={UI_ICONS.help}
                        label="帮助文档"
                        description="数据在哪、换机迁移、提醒 / 密码锁 / 云端备份等常见问题"
                        onClick={() => setHelpOpen(true)}
                    />
                    <SettingsEntryRow
                        icon={UI_ICONS.guide}
                        label="新手引导"
                        description="重新观看日历、记账与设置的操作指引"
                        value="重新播放"
                        onClick={() => {
                            navigateTo('home');
                            // 重新武装添加页分段引导：下次进入添加页会再播一次
                            patchBackend((current) => ({
                                ...current,
                                uiPreferences: { ...current.uiPreferences, addTourCompleted: false },
                            }));
                            startOnboarding('main');
                        }}
                    />
                </SettingsSection>

                <SettingsSection title="开源" description="本项目的许可与主要开源组件">
                    <SettingsEntryRow
                        icon={UI_ICONS.license}
                        label="开源许可"
                        description="制账以 GNU GPL v3.0 发布；另附主要依赖的许可清单"
                        value="GPL-3.0"
                        onClick={() => setLicensesOpen(true)}
                    />
                </SettingsSection>

                <SettingsSection title="鸣谢" layout="panel">
                    <p className="text-[12.5px] leading-relaxed text-text-secondary">
                        感谢 <span className="font-medium text-text">NapCatQQ-Desktop</span> 项目——
                        制账的框架与界面基于它搭建（同样以 GPL-3.0 发布）。
                    </p>
                </SettingsSection>
            </SettingsTabSections>

            <HelpSheet open={helpOpen} onOpenChange={setHelpOpen} />
            <LicensesSheet open={licensesOpen} onOpenChange={setLicensesOpen} />
        </>
    );
}

export default AboutTab;
