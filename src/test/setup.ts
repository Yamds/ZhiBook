import '@testing-library/jest-dom/vitest';

// i18n 必须在使用任何 `useTranslation()` 的组件之前就绪。
// 应用侧靠 `main.tsx` → preferencesStore → core/i18n 的引用链保证；
// 测试会直接渲染单个组件，所以这里显式引一次（模块加载即完成初始化）。
import '../core/i18n';

// jsdom 没有实现 Element.scrollTo（PeriodSelector 用它做吸附定位）。
// 不补这个 shim，任何渲染周期选择器的测试都会在挂载时抛
// `track.scrollTo is not a function`。这里只做空实现：测试不校验滚动位置，
// 滚动几何由 `periodSelector.logic.test.ts` 的纯函数单测覆盖。
if (typeof Element !== 'undefined' && typeof Element.prototype.scrollTo !== 'function') {
    Element.prototype.scrollTo = () => {};
}

// jsdom 同样没有 matchMedia（`useThemeTokens` / `useMotion` 会读它）。
// 统一返回「未命中」：不影响断言，只是让组件能正常挂载。
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
    window.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
}
