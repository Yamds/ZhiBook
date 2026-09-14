// i18n 运行时（唯一入口）。
//
// 设计要点：
//   1. **同步初始化**：resources 直接 import JSON，`init` 时给 `initImmediate: false`，
//      首屏不会因为异步加载文案而闪空。文案总量小（几十 KB），不值得做懒加载。
//   2. **不挂 Suspense**：react-i18next 默认在未就绪时挂起；这里同步就绪，
//      组件直接 `useTranslation()` 即可，不需要 `<Suspense>` 包裹整个应用树。
//   3. **单一实例**：i18next 自带单例；本模块只负责「初始化 + 语言切换 + 落 DOM」。
//
// 语言值的存储位置与解析规则见 `./languages`。

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import zhCN from './locales/zh-CN.json';
import {
    DEFAULT_LANGUAGE,
    FALLBACK_LOCALE,
    type AppLanguage,
    resolveLocale,
} from './languages';

/** 语言资源表。新增语言时：locales/ 加 JSON → 这里加一行 → languages.ts 加一行。 */
export const resources = {
    'zh-CN': { translation: zhCN },
} as const;

let currentPreference: AppLanguage = DEFAULT_LANGUAGE;

/** 已初始化标记：`ensureI18n()` 幂等，测试环境重复调用安全。 */
let initialized = false;

function ensureI18n(): typeof i18n {
    if (initialized) return i18n;
    void i18n.use(initReactI18next).init({
        resources,
        lng: resolveLocale(currentPreference),
        fallbackLng: FALLBACK_LOCALE,
        supportedLngs: Object.keys(resources),
        // `load: 'currentOnly'`：请求 zh-CN 时不要去加载派生出来的 zh。
        // 注意：**不能**开 `nonExplicitSupportedLngs` —— 它会把 zh-CN 先截成 zh
        // 再拿去和 supportedLngs 比对，而列表里是 zh-CN，结果会被当成“不支持”，
        // toResolveHierarchy 返回空数组，所有文案退化成 key。
        // 「设备方言 → 受支持 locale」的收敛已经在 `resolveLocale()` 里做了。
        load: 'currentOnly',
        defaultNS: 'translation',
        // 同步初始化：resources 已经在内存里，没有异步加载阶段
        initAsync: false,
        interpolation: {
            // React 自己会转义，i18next 再转一次会把中文标点变成实体
            escapeValue: false,
        },
        returnNull: false,
    });
    initialized = true;
    return i18n;
}

/**
 * 把偏好语言落实到 i18next 与 `<html lang>`。
 *
 * `AppBootGate` 启动时调一次；设置页改语言时再调。幂等。
 */
export function applyLanguage(preference: AppLanguage) {
    const engine = ensureI18n();
    currentPreference = preference;
    const locale = resolveLocale(preference);
    if (engine.resolvedLanguage !== locale) {
        void engine.changeLanguage(locale);
    }
    if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('lang', locale);
    }
}

/** 当前生效的 locale（如 `zh-CN`），供 Intl 格式化用。 */
export function currentLocale(): string {
    return i18n.resolvedLanguage || resolveLocale(currentPreference);
}

/**
 * 非 React 上下文用的翻译函数（services / 纯逻辑 / 错误处理）。
 *
 * 组件内请用 `useTranslation()`：它订阅语言变化，切换语言会重新渲染。
 * 这个函数只读「当下」的语言，不会触发重渲染。
 */
export function t(key: string, options?: Record<string, unknown>): string {
    return String(ensureI18n().t(key, options as never));
}

export { ensureI18n };
export default i18n;

// 模块加载即完成初始化：任何 `useTranslation()` 都能拿到就绪的实例，
// 不需要在入口处手动调一次（也不需要在测试 setup 里额外接线）。
ensureI18n();
