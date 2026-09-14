// 外观 Tab：沿用源项目的主题预览、圆角和三档动效控件。

import { Switch } from '../../../shared/ui';
import type { SettingsDraft } from '../settings-draft';
import {
    FieldRow,
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
    if (!draft) return <p className="text-[13px] text-text-tertiary">正在加载设置…</p>;

    return (
        <SettingsTabSections>
            <SettingsSection title="界面" description="选中后立即预览并自动保存">
                <FieldRow label="主题" description="系统跟随 / 浅色 / 暗色 / Catppuccin 风味">
                    <span data-tour="settings-theme" className="inline-flex">
                        <ThemePicker value={draft.theme} onChange={(value) => patchDraft({ theme: value })} />
                    </span>
                </FieldRow>
                <FieldRow label="圆角风格" description="方正克制 · 标准平衡 · 圆润饱满，全局统一缩放" isLast>
                    <RadiusStyleSegment value={draft.radiusStyle} onChange={(value) => patchDraft({ radiusStyle: value })} />
                </FieldRow>
            </SettingsSection>
            <SettingsSection title="动效">
                <FieldRow label="启动动画" description="启动页四幕动画；关闭后冷启动直接进入主界面">
                    <Switch checked={draft.splashEnabled} onCheckedChange={(value) => patchDraft({ splashEnabled: value })} />
                </FieldRow>
                <FieldRow label="动画与体感" description="总开关。关闭后过渡退化为瞬时；系统「减少动画」仍会覆盖">
                    <Switch checked={draft.motionEnabled} onCheckedChange={(value) => patchDraft({ motionEnabled: value })} />
                </FieldRow>
                <FieldRow label="动画档位" description="优雅 仅淡入淡出 · 标准 含轻 spring · 丰富 按钮弹性与卡片浮起">
                    <MotionLevelSegment value={draft.motionLevel} onChange={(value) => patchDraft({ motionLevel: value })} disabled={!draft.motionEnabled} />
                </FieldRow>
                <FieldRow label="动画速度" description="1.00× 为默认体感；更快可拉到 3.00×" isLast>
                    <MotionSpeedSlider value={draft.motionSpeed} onChange={(value) => patchDraft({ motionSpeed: value })} disabled={!draft.motionEnabled} />
                </FieldRow>
            </SettingsSection>
        </SettingsTabSections>
    );
}
