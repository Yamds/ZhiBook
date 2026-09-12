// 设置页：源项目的垂直设置布局，改动即时生效（无保存 / 撤销）。
//
// 页签顺序即滑动顺序：外观 ←→ 行为。滑动由 app/swipeNavigation 仲裁，
// 页签消费不掉时才交给壳去切「概览 / 设置」。

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../shared/ui';
import { useBackendSettings } from '../../hooks/preferences/useBackendSettings';
import { useNestedSwipe, neighborOf } from '../../app/swipeNavigation';
import { draftFromBackendAndPrefs } from './settings-draft';
import { AppearanceTab } from './tabs/AppearanceTab';
import { BehaviorTab } from './tabs/BehaviorTab';

const TAB_ORDER = ['appearance', 'behavior'] as const;
type SettingsTab = typeof TAB_ORDER[number];

export function SettingsPage() {
    const { settings, patch } = useBackendSettings();
    const [tab, setTab] = useState<SettingsTab>('appearance');
    const draft = settings ? draftFromBackendAndPrefs(settings) : null;

    // 页签优先消费横滑；到边界返回 false，让壳去切顶级路由。
    useNestedSwipe((direction) => {
        const next = neighborOf(TAB_ORDER, tab, direction);
        if (!next) return false;
        setTab(next);
        return true;
    });

    return (
        <div className="flex h-full min-h-0 w-full flex-col">
            <header className="shrink-0 pb-3 pt-2">
                <h1 className="font-display text-xl font-semibold leading-none text-text">设置</h1>
                <p className="mt-1.5 text-[13px] text-text-secondary">修改后立即生效并自动保存；左右滑动可切换页面与页签</p>
            </header>
            <Tabs value={tab} onValueChange={(value) => setTab(value as SettingsTab)} className="flex min-h-0 flex-1 flex-col">
                <div className="sticky top-0 z-[5] shrink-0 border-b border-border-subtle bg-canvas/95 backdrop-blur-sm">
                    <TabsList className="scrollbar-hide min-w-0 shrink overflow-x-auto border-b-0">
                        <TabsTrigger value="appearance">外观</TabsTrigger>
                        <TabsTrigger value="behavior">行为</TabsTrigger>
                    </TabsList>
                </div>
                <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-0.5 pr-2">
                    <TabsContent value="appearance" className="pb-10 pt-7 focus-visible:outline-none">
                        <AppearanceTab draft={draft} patchDraft={patch} />
                    </TabsContent>
                    <TabsContent value="behavior" className="pb-10 pt-7 focus-visible:outline-none">
                        <BehaviorTab draft={draft} patchDraft={patch} />
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
}

export default SettingsPage;
