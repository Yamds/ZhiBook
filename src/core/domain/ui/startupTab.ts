// 「启动页签」设置（FR-SET-2 行为页签的第一项）。
//
// 值必须与 `src/app/navigation.ts` 的 `AppRoute` 完全一致（底部 5 个页签）：
// 这是跨层约定，所以放 `core/domain`（`app/` 依赖 `core/`，反向不行），
// 一致性由 `startupTab.test.ts` 钉住（两边任一改动而另一边没跟上就会红）。

export const STARTUP_TABS = [
    { value: 'bills', labelKey: 'nav.bills' },
    { value: 'details', labelKey: 'nav.details' },
    { value: 'home', labelKey: 'nav.home' },
    { value: 'add', labelKey: 'nav.add' },
    { value: 'assets', labelKey: 'nav.assets' },
] as const;

export type StartupTab = (typeof STARTUP_TABS)[number]['value'];

/** 默认启动页签 = 日历（首页）。 */
export const DEFAULT_STARTUP_TAB: StartupTab = 'home';

const STARTUP_TAB_VALUES: ReadonlySet<string> = new Set(STARTUP_TABS.map((tab) => tab.value));

export function isStartupTab(value: unknown): value is StartupTab {
    return typeof value === 'string' && STARTUP_TAB_VALUES.has(value);
}

/** 未知值一律落回默认页签，别让非法偏好把 App 卡在空白页。 */
export function normalizeStartupTab(value: unknown): StartupTab {
    return isStartupTab(value) ? value : DEFAULT_STARTUP_TAB;
}
