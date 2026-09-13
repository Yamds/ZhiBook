// 设置页签注册表：**顺序即横滑顺序**。
//
// 「功能」页签最早叫「行为」（P8 只有启动页签），P10 起改名「功能」并移到「外观」之前，
// 成为设置页默认落地页签；后续阶段陆续往它里面加固定收支 / 记账提醒 / 密码锁 / 数据导入导出。
//
// 抽成独立模块是为了让页签顺序能被单测钉住（页面只管渲染，不再自己定义顺序）。

export const SETTINGS_TABS = [
    { value: 'feature', label: '功能' },
    { value: 'appearance', label: '外观' },
    { value: 'about', label: '关于' },
] as const;

export type SettingsTab = typeof SETTINGS_TABS[number]['value'];

/** 页签顺序（横滑仲裁与过渡方向用）。 */
export const SETTINGS_TAB_ORDER: ReadonlyArray<SettingsTab> = SETTINGS_TABS.map((tab) => tab.value);

/** 默认落地页签 = 第一个（功能）。 */
export const DEFAULT_SETTINGS_TAB: SettingsTab = SETTINGS_TABS[0].value;
