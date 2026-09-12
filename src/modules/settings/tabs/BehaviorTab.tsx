// 行为 Tab：沿用源项目的分组布局与控件，语义映射到 Android。
//
// 字段与持久化格式和桌面模板保持一致（CloseAction / AfterCloseUiBehavior /
// enterLightweightDelaySecs / launchOnStartup），只把平台含义换成 Android 的真实行为：
//   点击关闭按钮 → 返回键行为（退出程序 / 退到后台）
//   关窗后界面   → 退到后台后的界面内存策略
//   释放前等待   → 结束后台前等待
//   开机自启     → Android 10+ 限制后台广播拉起界面，只读展示

import type { CloseAction } from '../../../hooks/preferences/preferencesStore';
import type { AfterCloseUiBehavior } from '../../../core/services/settings.service';
import { Select, Switch } from '../../../shared/ui';
import type { SettingsDraft } from '../settings-draft';
import { FieldRow, SettingsSection, SettingsTabSections } from '../_shared';

interface Props {
    draft: SettingsDraft | null;
    patchDraft: (patch: Partial<SettingsDraft>) => void;
}

export function BehaviorTab({ draft, patchDraft }: Props) {
    if (!draft) return <p className="text-[13px] text-text-tertiary">正在加载设置…</p>;
    return (
        <SettingsTabSections>
            <SettingsSection title="退出与后台" description="Android 上没有窗口，返回键与切到后台就是唯一的进出方式">
                <FieldRow label="返回键行为" description="在首页按返回键时：退出程序，或退到后台保留运行">
                    <Select value={draft.closeAction} onValueChange={(value) => patchDraft({ closeAction: value as CloseAction })} items={[{ value: 'close', label: '退出程序' }, { value: 'tray', label: '退到后台' }]} />
                </FieldRow>
                <FieldRow label="退到后台后" description="切到后台后是否在一段时间不用后结束后台，释放界面内存">
                    <Select value={draft.afterCloseUiBehavior} onValueChange={(value) => patchDraft({ afterCloseUiBehavior: value as AfterCloseUiBehavior })} items={[{ value: 'hide', label: '保持后台（占内存）' }, { value: 'delayed_lightweight', label: '一段时间不用后结束（推荐）' }, { value: 'immediate_lightweight', label: '立即结束后台' }]} />
                </FieldRow>
                {draft.afterCloseUiBehavior === 'delayed_lightweight' && <FieldRow label="结束前等待" description="应用不可见累计多久后结束后台">
                    <Select value={String(draft.enterLightweightDelaySecs)} onValueChange={(value) => patchDraft({ enterLightweightDelaySecs: Number(value) })} items={[{ value: '60', label: '1 分钟' }, { value: '180', label: '3 分钟' }, { value: '300', label: '5 分钟' }, { value: '900', label: '15 分钟' }, { value: '1800', label: '30 分钟' }]} />
                </FieldRow>}
            </SettingsSection>
            <SettingsSection title="交互">
                <FieldRow label="双指缩放" description="允许用两根手指捏合放大 / 缩小整个界面" isLast>
                    <Switch checked={draft.allowPinchZoom} onCheckedChange={(value) => patchDraft({ allowPinchZoom: value })} />
                </FieldRow>
            </SettingsSection>
            <SettingsSection title="启动">
                <FieldRow label="开机自启" description="Android 10 起系统禁止后台广播拉起界面，普通应用无法可靠实现该项；字段已保留，接入前台服务后可启用" isLast>
                    <Switch checked={draft.launchOnStartup} disabled onCheckedChange={() => undefined} />
                </FieldRow>
            </SettingsSection>
        </SettingsTabSections>
    );
}

export default BehaviorTab;
