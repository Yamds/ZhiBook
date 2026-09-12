// 双指缩放（pinch zoom）开关。
//
// 两条路径同时存在，缺一不可：
//   1. 这里改写 viewport meta —— 运行中切换开关**立即生效**；
//   2. 原生侧 MainActivity 在 WebView 创建时读持久化设置调 setSupportZoom ——
//      保证冷启动时状态正确（WebView 默认支持缩放）。
//
// 改这里必须同步看 src-tauri/gen/android/.../MainActivity.kt。

const BASE_VIEWPORT = 'width=device-width, initial-scale=1.0, viewport-fit=cover';

// 改写 viewport meta 会触发整页重排，而 applySideEffects 会在拖滑块等高频路径上被反复调用，
// 所以这里做幂等：内容没变就不碰 DOM。
let lastApplied: boolean | null = null;

export function applyPinchZoom(enabled: boolean): void {
    if (typeof document === 'undefined') return;
    if (lastApplied === enabled) return;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta) return;
    meta.content = enabled
        ? `${BASE_VIEWPORT}, maximum-scale=5, user-scalable=yes`
        : `${BASE_VIEWPORT}, maximum-scale=1, user-scalable=no`;
    lastApplied = enabled;
}
