// 外观 Tab：沿用源项目的主题预览、圆角和三档动效控件。

import { useTranslation } from 'react-i18next';
import { Switch } from '../../../shared/ui';
import type { SettingsDraft } from '../settings-draft';
import {
    FieldRow,
    LanguageSegment,
    MotionLevelSegment,
    MotionSpeedSlider,
    RadiusStyleSegment,
    SettingsSection,
    SettingsTabSections,
    ThemePicker,
} from '../_shared';

interface Props {
    draft: SettingsDraft | null;
    patchDraft: (patch: Partial<SettingsDraft>) => void;
}

export function AppearanceTab({ draft, patchDraft }: Props) {
    const { t } = useTranslation();
    if (!draft) return <p className="text-[13px] text-text-tertiary">{t('settings.loading')}</p>;

    return (
        <SettingsTabSections>
            <SettingsSection
                title={t('settings.appearance.appearanceSection')}
                description={t('settings.appearance.appearanceSectionDesc')}
            >
                <FieldRow label={t('settings.appearance.theme')} description={t('settings.appearance.themeDesc')}>
                    <ThemePicker value={draft.theme} onChange={(value) => patchDraft({ theme: value })} />
                </FieldRow>
                <FieldRow label={t('settings.appearance.language')} description={t('settings.appearance.languageDesc')}>
                    <LanguageSegment value={draft.language} onChange={(value) => patchDraft({ language: value })} />
                </FieldRow>
                <FieldRow label={t('settings.appearance.radius')} description={t('settings.appearance.radiusDesc')} isLast>
                    <RadiusStyleSegment value={draft.radiusStyle} onChange={(value) => patchDraft({ radiusStyle: value })} />
                </FieldRow>
            </SettingsSection>
            <SettingsSection title={t('settings.appearance.motionSection')}>
                <FieldRow label={t('settings.appearance.splash')} description={t('settings.appearance.splashDesc')}>
                    <Switch checked={draft.splashEnabled} onCheckedChange={(value) => patchDraft({ splashEnabled: value })} />
                </FieldRow>
                <FieldRow label={t('settings.appearance.motionEnabled')} description={t('settings.appearance.motionEnabledDesc')}>
                    <Switch checked={draft.motionEnabled} onCheckedChange={(value) => patchDraft({ motionEnabled: value })} />
                </FieldRow>
                <FieldRow label={t('settings.appearance.motionLevel')} description={t('settings.appearance.motionLevelDesc')}>
                    <MotionLevelSegment value={draft.motionLevel} onChange={(value) => patchDraft({ motionLevel: value })} disabled={!draft.motionEnabled} />
                </FieldRow>
                <FieldRow label={t('settings.appearance.motionSpeed')} description={t('settings.appearance.motionSpeedDesc')} isLast>
                    <MotionSpeedSlider value={draft.motionSpeed} onChange={(value) => patchDraft({ motionSpeed: value })} disabled={!draft.motionEnabled} />
                </FieldRow>
            </SettingsSection>
        </SettingsTabSections>
    );
}
