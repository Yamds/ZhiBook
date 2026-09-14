// 新手引导步骤脚本（固定顺序，分两段）。
//
// 分段的理由：进入 App 时不该把用户直接推到添加页。主引导只讲「日历 + 设置」；
// 添加页有自己的三条说明，等用户**自己第一次点进添加页**时再播一次。
//
// 每一步：目标元素（页面上的 `data-tour` 锚点）+ 所在页面 + 文案。
//   - `tapTarget: true`：点真实按钮也能推进（顺便看到真实效果）；洞口可点。
//   - 其余步骤只能用气泡上的按钮推进；洞口用透明阻断层盖住，避免误触。
//   - 目标缺失 / 元素被隐藏时，宿主短暂等待后自动跳过，保证不卡死。

import type { AppScreen } from '../../app/navigation';

/** 引导分段。 */
export type TourChapter = 'main' | 'add';

export interface TourStep {
    readonly key: string;
    /** 目标元素的 `data-tour` 选择器；缺省 = 屏幕居中的整段卡（如欢迎页）。 */
    readonly target?: string;
    /** 这一步属于哪个页面；推进到该步时若不在该页，宿主会自动导航过去。 */
    readonly screen: AppScreen;
    readonly title: string;
    readonly body: string;
    /** 点目标本身也能推进（默认只能用按钮）。 */
    readonly tapTarget?: boolean;
    /** 推进按钮文案覆盖（如欢迎页的「开始」）。 */
    readonly nextLabel?: string;
}

/** 主引导：欢迎 → 日历 → 进设置 → 点「外观」→ 主题。 */
export const MAIN_TOUR_STEPS: readonly TourStep[] = [
    {
        key: 'welcome',
        screen: 'home',
        title: '你好，欢迎使用制账',
        body: '感谢使用制账！接下来用不到一分钟，带你认识日历和设置。',
        nextLabel: '开始',
    },
    {
        key: 'calendar-day',
        screen: 'home',
        target: '[data-tour="home-calendar"]',
        title: '日历就是首页',
        body: '点按任意一天记一笔；长按某一天，可以查看当天的明细。',
    },
    {
        key: 'open-settings',
        screen: 'home',
        target: '[data-tour="nav-home"]',
        tapTarget: true,
        title: '进入设置',
        body: '在日历页再点一次「日历」，就进入设置页。',
    },
    {
        key: 'settings-appearance',
        screen: 'settings',
        target: '[data-tour="settings-tab-appearance"]',
        tapTarget: true,
        title: '点「外观」看看主题',
        body: '设置分「功能 / 外观 / 关于」三个页签，先看看外观。',
    },
    {
        key: 'settings-theme',
        screen: 'settings',
        target: '[data-tour="settings-theme"]',
        title: '12 套主题',
        body: '分类与图表颜色都跟着主题走。设置 →「功能」或「关于」里可以重看本引导。',
    },
];

/** 添加页引导：首次进入添加页时触发一次（分类 / 键盘 / 日期）。 */
export const ADD_TOUR_STEPS: readonly TourStep[] = [
    {
        key: 'add-category',
        screen: 'add',
        target: '[data-tour="add-category-grid"]',
        title: '先挑一个分类',
        body: '支出 / 收入在这里切换；长按分类进入编辑模式，可以改名、换图标和拖动排序。',
    },
    {
        key: 'add-keypad',
        screen: 'add',
        target: '[data-tour="add-keypad"]',
        title: '输入金额',
        body: '支持 + − 连算；点「完成」记一笔。长按右侧的重置图标可以清零重输。',
    },
    {
        key: 'add-date',
        screen: 'add',
        target: '[data-tour="add-date-button"]',
        title: '日期与时间',
        body: '日期在时间左边：点它换日期，旁边选具体时间；备注写在右边。',
    },
];

export const TOUR_STEPS: Record<TourChapter, readonly TourStep[]> = {
    main: MAIN_TOUR_STEPS,
    add: ADD_TOUR_STEPS,
};
