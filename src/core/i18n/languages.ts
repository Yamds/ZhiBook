// 语言注册表（单一事实来源）。
//
// 为什么单独一个模块：语言值散落在 Rust 偏好、前端 preferencesStore、(将来) 原生桥三处。
// 加一门语言只需要在这里加一行 + 在 locales/ 下加一个 JSON，其余地方都从这里取。
//
// `auto` 不是一门真实语言：它表示「跟随系统」。系统语言不在支持列表时回落到
// `FALLBACK_LOCALE`（zh-CN），保证界面永远有文案可用。

/** 偏好里存储的语言值。`auto` = 跟随系统。 */
export const LANGUAGE_AUTO = 'auto';

/** 支持的语言（顺序即设置页展示顺序）。 */
export const LANGUAGES = [
    { value: 'auto', labelKey: 'settings.appearance.languageFollowSystem' },
    { value: 'zh-CN', labelKey: 'settings.appearance.languageZhCn' },
] as const;

export type AppLanguage = (typeof LANGUAGES)[number]['value'];

/** 真实可用的 locale 列表（不含 auto）。新增语言时在这里 + locales/ 同步加。 */
export const SUPPORTED_LOCALES = ['zh-CN'] as const;

/** 回落 locale：系统语言不受支持时用它。 */
export const FALLBACK_LOCALE = 'zh-CN';

/** 默认偏好值。跟随系统，符合「装完即用」的预期。 */
export const DEFAULT_LANGUAGE: AppLanguage = LANGUAGE_AUTO;

const LANGUAGE_VALUES = new Set<string>(LANGUAGES.map((item) => item.value));

/** 校验未知值，非法一律回落默认（不让非法偏好把界面卡在无文案状态）。 */
export function normalizeLanguage(value: unknown): AppLanguage {
    if (typeof value === 'string' && LANGUAGE_VALUES.has(value)) {
        return value as AppLanguage;
    }
    return DEFAULT_LANGUAGE;
}

/**
 * 偏好值 → 实际生效的 locale。
 *
 * `auto` 走设备语言：先取精确匹配（zh-CN），再取同语种（zh 开头 → zh-CN），
 * 都不中就用回落值。注意 RTL / 大小写：locale 比较统一按小写。
 */
export function resolveLocale(preference: AppLanguage): string {
    if (preference !== LANGUAGE_AUTO) return preference;

    const deviceLocales = readDeviceLocales();
    for (const device of deviceLocales) {
        const exact = SUPPORTED_LOCALES.find(
            (locale) => locale.toLowerCase() === device.toLowerCase(),
        );
        if (exact) return exact;
    }
    for (const device of deviceLocales) {
        const language = device.split('-')[0]?.toLowerCase() ?? '';
        if (!language) continue;
        const sameLanguage = SUPPORTED_LOCALES.find(
            (locale) => locale.split('-')[0]?.toLowerCase() === language,
        );
        if (sameLanguage) return sameLanguage;
    }
    return FALLBACK_LOCALE;
}

/** 设备语言列表。优先 `navigator.languages`，退化到 `navigator.language`。 */
function readDeviceLocales(): string[] {
    if (typeof navigator === 'undefined') return [];
    const list = navigator.languages;
    if (Array.isArray(list) && list.length > 0) return list;
    return navigator.language ? [navigator.language] : [];
}
