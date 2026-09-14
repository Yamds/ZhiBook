// 新手引导步骤脚本（固定顺序）。
//
// 每一步：目标元素（页面上的 `data-tour` 锚点）+ 所在页面 + 文案。
//   - `tapTarget: true` 允许点目标本身推进（点真实按钮，顺便看到真实效果）；
//   - 其余步骤用气泡上的「下一步」推进；
//   - 任何一步都可以用「下一步」兜底，跨页由宿主自动 `navigateTo`，保证不卡死。
//
// 目标缺失 / 元素被隐藏时，宿主会短暂等待后自动跳过该步（引导期间不允许退出）。

import type { AppScreen } from '../../app/navigation';

export interface TourStep {
    readonly key: string;
    /** 目标元素的 `data-tour` 选择器；缺省 = 屏幕居中的结束卡。 */
    readonly target?: string;
    /** 这一步属于哪个页面；推进到该步时若不在该页，宿主会自动导航过去。 */
    readonly screen: AppScreen;
    readonly title: string;
    readonly body: string;
    /** 点目标本身也能推进（默认只能用「下一步」）。 */
    readonly tapTarget?: boolean;
}

export const TOUR_STEPS: readonly TourStep[] = [
    {
        key: 'calendar-day',
        screen: 'home',
        target: '[data-tour="home-calendar"]',
        tapTarget: true,
        title: '日历就是首页',
        body: '点按任意一天记一笔；长按某一天，可以查看当天的明细。',
    },
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
        body: '支持 + − 连算；点「完成」就记下这一笔。长按右侧的重置图标可以清零重输。',
    },
    {
        key: 'add-date',
        screen: 'add',
        target: '[data-tour="add-date-button"]',
        title: '日期与时间',
        body: '日期按钮在时间左边：点它换日期，旁边可以选具体时间；备注写在右边。',
    },
    {
        key: 'back-home',
        screen: 'add',
        target: '[data-tour="nav-home"]',
        tapTarget: true,
        title: '回到日历',
        body: '记完账，点这里回到日历首页。',
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
        key: 'settings-tabs',
        screen: 'settings',
        target: '[data-tour="settings-tabs"]',
        title: '设置分三个页签',
        body: '功能：固定收支 / 记账提醒 / 密码锁 / 数据；外观：主题与动画；关于：版本、帮助与开源许可。',
    },
    {
        key: 'settings-feature',
        screen: 'settings',
        target: '[data-tour="settings-entry-recurring"]',
        title: '固定收支与更多',
        body: '房租、工资可以设成固定收支，每天自动记一笔；提醒和加密的云端备份也都在「功能」里。',
    },
    {
        key: 'done',
        screen: 'settings',
        title: '就介绍到这里',
        body: '想再看一遍：设置 →「功能」或「关于」里的「新手引导」。祝你记账愉快！',
    },
];
