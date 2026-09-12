// 设置页：只保留「外观」一类内容，改动即时生效（无保存 / 撤销）。
//
// 入口只有一个：在日历页再次点击底部「日历」页签；返回键回日历页。
// 旧版的「行为」页签（退出行为 / 后台策略 / 双指缩放 / 开机自启）已整体删除：
// 这些行为现在是壳的固定策略，不再由用户配置。

import { useBackendSettings } from '../../hooks/preferences/useBackendSettings';
import { draftFromBackendAndPrefs } from './settings-draft';
import { AppearanceTab } from './tabs/AppearanceTab';

export function SettingsPage() {
    const { settings, patch } = useBackendSettings();
    const draft = settings ? draftFromBackendAndPrefs(settings) : null;

    return (
        <div className="flex h-full min-h-0 w-full flex-col">
            <header className="shrink-0 pb-3 pt-2">
                <h1 className="font-display text-xl font-semibold leading-none text-text">设置</h1>
                <p className="mt-1.5 text-[13px] text-text-secondary">修改后立即生效并自动保存</p>
            </header>
            <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-0.5 pr-2">
                <div className="pb-10 pt-7">
                    <AppearanceTab draft={draft} patchDraft={patch} />
                </div>
            </div>
        </div>
    );
}

export default SettingsPage;
