// 行为 Tab（FR-SET-2）：目前只有一个设置项 —— 启动页签。
//
// 以后加「返回键行为 / 侧滑」之类的项就往这里追加 FieldRow，注册表不用动。
// 改动即时保存（与外观一致），但**启动页签要下次启动才生效**，所以文案里写清楚。

import type { SettingsDraft } from '../settings-draft';
import { FieldRow, SettingsSection, SettingsTabSections, StartupTabSegment } from '../_shared';

interface Props {
    draft: SettingsDraft | null;
    patchDraft: (patch: Partial<SettingsDraft>) => void;
}

export function BehaviourTab({ draft, patchDraft }: Props) {
    if (!draft) return <p className="text-[13px] text-text-tertiary">正在加载设置…</p>;

    return (
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
        </SettingsTabSections>
    );
}

export default BehaviourTab;
