// 主题注册表（单一事实来源）。
//
// 为什么单独一个模块：主题值散落在 5 个地方（preferencesStore 的联合类型与白名单、
// settings.service 的校验、设置页的预览色块、surfaceCanvas 的明暗判定、index.css 的
// `:is(...)` 列表），每加一套主题都得改一圈，漏一处就是「预览色不对 / 启动底色闪一下」。
// 现在只在 `THEMES` 里加一行 + 在 `tokens.css` 里加一个 `:root[data-theme="..."]` 块。
//
// `flat: true` 的调色板（Catppuccin / Everforest / Nord 规范都要求纯色平面画布）
// 会由 `applySideEffects` 写到 `data-theme-flat`，CSS 用它关掉角落柔光与启动页极光。

export type ThemeMode =
    | 'auto'
    | 'light'
    | 'dark'
    | 'latte'
    | 'frappe'
    | 'macchiato'
    | 'mocha'
    | 'everforest-dark-hard'
    | 'everforest-dark-soft'
    | 'everforest-light-hard'
    | 'everforest-light-soft'
    | 'nord';

export interface ThemePreview {
    readonly canvas: string;
    readonly sidebar: string;
    readonly text: string;
    readonly subtext: string;
    readonly brand: string;
    readonly accent: string;
}

export interface ThemeDefinition {
    readonly value: ThemeMode;
    /** 设置页显示名的 i18n key。 */
    readonly labelKey: string;
    /** 设置页分组标题的 i18n key。 */
    readonly groupKey: string;
    /** 暗色画布：供启动底色 / 明暗判定使用（`auto` 由系统决定，标记为 false）。 */
    readonly dark: boolean;
    /** 纯色平面画布（禁用角落柔光与启动页极光）。 */
    readonly flat: boolean;
    /**
     * 预览色块。**必须与 `tokens.css` 里该主题的真实取值一致**：
     * `canvas` 同时用于设置页主题卡片的底色预览。
     */
    readonly preview: ThemePreview;
}

export const THEMES: readonly ThemeDefinition[] = [
    {
        value: 'auto',
        labelKey: 'theme.label.auto',
        groupKey: 'theme.group.basic',
        dark: false,
        flat: false,
        preview: {
            canvas: '#faf7f2',
            sidebar: '#ffe3ee',
            text: '#2c1f18',
            subtext: '#8a7d76',
            brand: '#ff6b3d',
            accent: '#f58fb6',
        },
    },
    {
        value: 'light',
        labelKey: 'theme.label.light',
        groupKey: 'theme.group.basic',
        dark: false,
        flat: false,
        preview: {
            canvas: '#faf7f2',
            sidebar: '#ffe3ee',
            text: '#2c1f18',
            subtext: '#8a7d76',
            brand: '#ff6b3d',
            accent: '#f58fb6',
        },
    },
    {
        value: 'dark',
        labelKey: 'theme.label.dark',
        groupKey: 'theme.group.basic',
        dark: true,
        flat: false,
        preview: {
            canvas: '#211f1d',
            sidebar: '#292725',
            text: '#f5f1ed',
            subtext: '#9e9890',
            brand: '#ff8a57',
            accent: '#f58fb6',
        },
    },
    {
        value: 'latte',
        labelKey: 'theme.label.latte',
        groupKey: 'theme.group.catppuccin',
        dark: false,
        flat: true,
        preview: {
            canvas: '#eff1f5',
            sidebar: '#e6e9ef',
            text: '#4c4f69',
            subtext: '#6c6f85',
            brand: '#8839ef',
            accent: '#1e66f5',
        },
    },
    {
        value: 'frappe',
        labelKey: 'theme.label.frappe',
        groupKey: 'theme.group.catppuccin',
        dark: true,
        flat: true,
        preview: {
            canvas: '#303446',
            sidebar: '#292c3c',
            text: '#c6d0f5',
            subtext: '#949cbb',
            brand: '#ca9ee6',
            accent: '#8caaee',
        },
    },
    {
        value: 'macchiato',
        labelKey: 'theme.label.macchiato',
        groupKey: 'theme.group.catppuccin',
        dark: true,
        flat: true,
        preview: {
            canvas: '#24273a',
            sidebar: '#1e2030',
            text: '#cad3f5',
            subtext: '#939ab7',
            brand: '#c6a0f6',
            accent: '#8aadf4',
        },
    },
    {
        value: 'mocha',
        labelKey: 'theme.label.mocha',
        groupKey: 'theme.group.catppuccin',
        dark: true,
        flat: true,
        preview: {
            canvas: '#1e1e2e',
            sidebar: '#181825',
            text: '#cdd6f4',
            subtext: '#9399b2',
            brand: '#cba6f7',
            accent: '#89b4fa',
        },
    },
    // Everforest（sainnhe/everforest 官方调色板）：亮 / 暗 × hard / soft 四种（Light 在前）
    {
        value: 'everforest-light-hard',
        labelKey: 'theme.label.everforestLightHard',
        groupKey: 'theme.group.everforest',
        dark: false,
        flat: true,
        preview: {
            canvas: '#fffbef',
            sidebar: '#f8f5e4',
            text: '#5c6a72',
            subtext: '#939f91',
            brand: '#35a77c',
            accent: '#df69ba',
        },
    },
    {
        value: 'everforest-light-soft',
        labelKey: 'theme.label.everforestLightSoft',
        groupKey: 'theme.group.everforest',
        dark: false,
        flat: true,
        preview: {
            canvas: '#f8f5e4',
            sidebar: '#f2efdf',
            text: '#5c6a72',
            subtext: '#939f91',
            brand: '#35a77c',
            accent: '#df69ba',
        },
    },
    {
        value: 'everforest-dark-hard',
        labelKey: 'theme.label.everforestDarkHard',
        groupKey: 'theme.group.everforest',
        dark: true,
        flat: true,
        preview: {
            canvas: '#272e33',
            sidebar: '#2e383c',
            text: '#d3c6aa',
            subtext: '#859289',
            brand: '#83c092',
            accent: '#d699b6',
        },
    },
    {
        value: 'everforest-dark-soft',
        labelKey: 'theme.label.everforestDarkSoft',
        groupKey: 'theme.group.everforest',
        dark: true,
        flat: true,
        preview: {
            canvas: '#333c43',
            sidebar: '#3a464c',
            text: '#d3c6aa',
            subtext: '#859289',
            brand: '#83c092',
            accent: '#d699b6',
        },
    },
    // Nord（nordtheme.com）
    {
        value: 'nord',
        labelKey: 'theme.label.nord',
        groupKey: 'theme.group.nord',
        dark: true,
        flat: true,
        preview: {
            canvas: '#2e3440',
            sidebar: '#3b4252',
            text: '#d8dee9',
            subtext: '#98a1b3',
            brand: '#88c0d0',
            accent: '#b48ead',
        },
    },
];

const BY_VALUE = new Map<string, ThemeDefinition>(THEMES.map((theme) => [theme.value, theme]));

/** 全部合法主题值（校验用）。 */
export const THEME_VALUES: ReadonlySet<string> = new Set(THEMES.map((theme) => theme.value));

export const DEFAULT_THEME: ThemeMode = 'auto';

/** 取主题定义；不认识的值返回 undefined（调用方决定兜底策略）。 */
export function findTheme(value: string | null | undefined): ThemeDefinition | undefined {
    return value ? BY_VALUE.get(value) : undefined;
}

export function isThemeValue(value: unknown): value is ThemeMode {
    return typeof value === 'string' && THEME_VALUES.has(value);
}

/** 未知值一律落到默认主题，不让非法偏好把界面卡在无主题状态。 */
export function normalizeThemeValue(value: unknown): ThemeMode {
    return isThemeValue(value) ? value : DEFAULT_THEME;
}

export interface ThemeGroup {
    readonly labelKey: string;
    readonly items: readonly ThemeDefinition[];
}

/** 设置页分组视图（顺序即展示顺序）。 */
export const THEME_GROUPS: readonly ThemeGroup[] = THEMES.reduce<ThemeGroup[]>((groups, theme) => {
    const last = groups.at(-1);
    if (last && last.labelKey === theme.groupKey) {
        groups[groups.length - 1] = { labelKey: last.labelKey, items: [...last.items, theme] };
        return groups;
    }
    groups.push({ labelKey: theme.groupKey, items: [theme] });
    return groups;
}, []);
