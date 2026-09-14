// 与 tokens --surface-canvas 对齐，供首屏 / WebView 底色同步（避免暗色主题闪白）。
//
// 首屏兜底（React / CSS 到达前）走 `index.html` 的内联引导脚本：
// 它读 `preferencesStore` 镜像到 localStorage 的画布色（CANVAS_MIRROR_KEY），
// 本文件只负责运行时读写。

const CANVAS_FALLBACK_LIGHT = '#faf7f2';

export function readSurfaceCanvasColor(): string {
    if (typeof document === 'undefined') return CANVAS_FALLBACK_LIGHT;
    const v = getComputedStyle(document.documentElement)
        .getPropertyValue('--surface-canvas')
        .trim();
    return v || CANVAS_FALLBACK_LIGHT;
}

/** 把当前主题画布色写到 html/body/#root，避免暗色主题下系统栏/过度滚动区闪白。 */
export function syncRootChromeBackground(): void {
    if (typeof document === 'undefined') return;
    const bg = readSurfaceCanvasColor();
    const html = document.documentElement;
    html.style.backgroundColor = bg;
    document.body.style.backgroundColor = bg;
    const root = document.getElementById('root');
    if (root) root.style.backgroundColor = bg;
}