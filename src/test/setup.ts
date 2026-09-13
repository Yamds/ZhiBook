import '@testing-library/jest-dom/vitest';

// jsdom 没有实现 Element.scrollTo（PeriodSelector 用它做吸附定位）。
// 不补这个 shim，任何渲染周期选择器的测试都会在挂载时抛
// `track.scrollTo is not a function`。这里只做空实现：测试不校验滚动位置，
// 滚动几何由 `periodSelector.logic.test.ts` 的纯函数单测覆盖。
if (typeof Element !== 'undefined' && typeof Element.prototype.scrollTo !== 'function') {
    Element.prototype.scrollTo = () => {};
}
