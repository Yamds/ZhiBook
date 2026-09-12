// 设置页：当前只有「外观」一个页签，但页签结构完整保留 ——
// 以后新增「数据」「关于」等分类时只往 SETTINGS_TABS 里加一条，页面逻辑不用改。
//
// 入口：日历页再次点击底部「日历」页签（该槽位随后显示为「设置」）。
// 返回：点「设置」页签或按返回键都回日历页。

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../shared/ui';
import { useBackendSettings } from '../../hooks/preferences/useBackendSettings';
import { neighborOf, useNestedSwipe } from '../../app/swipeNavigation';
import { draftFromBackendAndPrefs } from './settings-draft';
import { AppearanceTab } from './tabs/AppearanceTab';

/** 设置页签注册表：顺序即横滑顺序。 */
const SETTINGS_TABS = [
    { value: 'appearance', label: '外观' },
] as const;

type SettingsTab = typeof SETTINGS_TABS[number]['value'];

const TAB_ORDER: ReadonlyArray<SettingsTab> = SETTINGS_TABS.map((tab) => tab.value);

export function SettingsPage() {
    const { settings, patch } = useBackendSettings();
    const [tab, setTab] = useState<SettingsTab>('appearance');
    const draft = settings ? draftFromBackendAndPrefs(settings) : null;

    // 页签优先消费横滑；到边界返回 false，让壳去处理（当前壳在设置页不切页签）。
    useNestedSwipe((direction) => {
        const next = neighborOf(TAB_ORDER, tab, direction);
        if (!next) return false;
        setTab(next);
        return true;
    });

    return (
        <div className="flex h-full min-h-0 w-full flex-col">
            <Tabs value={tab} onValueChange={(value) => setTab(value as SettingsTab)} className="flex min-h-0 flex-1 flex-col">
                <div className="sticky top-0 z-[5] shrink-0 border-b border-border-subtle bg-canvas/95 backdrop-blur-sm">
                    <TabsList className="scrollbar-hide min-w-0 shrink overflow-x-auto border-b-0">
                        {SETTINGS_TABS.map((item) => (
                            <TabsTrigger key={item.value} value={item.value}>{item.label}</TabsTrigger>
                        ))}
                    </TabsList>
                </div>
                <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-0.5 pr-2">
                    <TabsContent value="appearance" className="pb-10 pt-7 focus-visible:outline-none">
                        <AppearanceTab draft={draft} patchDraft={patch} />
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
}

export default SettingsPage;
