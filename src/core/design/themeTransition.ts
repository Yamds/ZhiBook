// 主题切换过渡 — View Transition 圆形揭示。
//
// 换主题时把新旧两层快照叠起来：新层以触发点（最近一次 pointerdown，或调用方显式传入）
// 为圆心，用一个带柔边的圆从小撑到盖住全屏；旧层在下面原样等着，新层盖到哪就换到哪。
//
// Android 端已移除全部「光波」特效：蓄力画布（火花汇聚 / 细环收拢 / 核心闪光）、
// 波前光环、回声环、发热冷却滤镜、点击点涟漪环都不再播放，
// 只保留「从按钮处开始圆形扩散换主题」这一件事，开销降到单层 mask-size 动画。
//
// 与源项目的差异：模板的「保存后切换」流程由保存按钮显式调用
// captureThemeTransitionOrigin 记录圆心；全局 pointerdown 跟踪只作为兜底。

import './themeTransition.css';

/** 主题过渡的动画配置。 */
export interface ThemeTransitionOptions {
    enabled: boolean;
    /** 仅用来判断优雅档：优雅档不做圆形揭示，直接换主题。 */
    level: 'elegant' | 'standard' | 'rich';
    duration: number;
    easing: string;
    /** 扩散圆心的视口坐标（px）。缺省取最近一次指针位置或屏幕中心。 */
    originX?: number;
    originY?: number;
}

// 使用局部扩展类型，避免不同 TypeScript DOM lib 对 Document 重载声明冲突。
interface LocalViewTransition {
    readonly ready: Promise<void>;
    readonly finished: Promise<void>;
}

type ViewTransitionDocument = Document & {
    startViewTransition?: (update: () => void) => LocalViewTransition;
};

const viewTransitionDocument = (): ViewTransitionDocument => document as ViewTransitionDocument;

const SUPPORTS_VIEW_TRANSITION =
    typeof document !== 'undefined' &&
    typeof viewTransitionDocument().startViewTransition === 'function';

// 上一次过渡没跑完时直接瞬时切换：叠两个 View Transition 会互相抢伪元素。
let active = false;

// 最近一次指针按下位置，用来把扩散圆心对准触发点击。键盘触发的保存
// 没有近期 pointerdown，会自然回落到屏幕中心。
let lastPointerX = Number.NaN;
let lastPointerY = Number.NaN;
let lastPointerAt = 0;
let pointerTrackingBound = false;

/** 保存触发控件的指针位置，供保存按钮触发的全屏主题扩散使用。 */
export function captureThemeTransitionOrigin(x: number, y: number): void {
    lastPointerX = x;
    lastPointerY = y;
    lastPointerAt = Date.now();
}

function ensurePointerTracking(): void {
    if (typeof window === 'undefined' || pointerTrackingBound) return;
    pointerTrackingBound = true;
    window.addEventListener(
        'pointerdown',
        (e) => {
            captureThemeTransitionOrigin(e.clientX, e.clientY);
        },
        { capture: true, passive: true },
    );
}

// 圆外多给一点半径，保证羽化边完全跑出屏幕后才收过渡。
const REVEAL_OVERSHOOT_PX = 40;

export async function playThemeTransition(
    changeTheme: () => void,
    opts: ThemeTransitionOptions,
): Promise<void> {
    // 优雅档 / 禁用动画 / 过渡进行中走瞬时切换；不支持 View Transition 时也直接切。
    if (!opts.enabled || opts.level === 'elegant' || !SUPPORTS_VIEW_TRANSITION || active) {
        changeTheme();
        return;
    }
    active = true;

    const rootEl = document.documentElement;

    // 圆心：优先调用方显式传入，其次 2s 内的指针按下位置（即触发点击），
    // 都没有则取屏幕中心。
    ensurePointerTracking();
    const recentClick = Date.now() - lastPointerAt < 2000;
    const cx = Number.isFinite(opts.originX)
        ? (opts.originX as number)
        : recentClick ? lastPointerX : innerWidth / 2;
    const cy = Number.isFinite(opts.originY)
        ? (opts.originY as number)
        : recentClick ? lastPointerY : innerHeight / 2;

    // duration 沿用 motion 体系的秒单位（GSAP 约定），CSS 动画要 ms。
    const durMs = Math.max(0, Math.round(opts.duration * 1000));

    // 圆的终态半径要盖住最远的视口角；窗口尺寸在这里才量，蓄力阶段已经不存在。
    const endR = Math.ceil(
        Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy)),
    ) + REVEAL_OVERSHOOT_PX;

    // 档位与几何必须在 startViewTransition 之前写入 DOM：
    // ::view-transition-* 伪元素在过渡开始那一刻按当前样式解析，
    // 事后补属性会有一帧竞态（表现为闪一下 UA 默认交叉淡入）。
    rootEl.style.setProperty('--theme-reveal-dur', `${durMs}ms`);
    // 半径 = mask 盒边长的一半：CSS 里 mask-size 从 0 长到 2R。
    rootEl.style.setProperty('--theme-reveal-r', `${endR}px`);
    // mask-position 用「圆心相对屏幕中心的偏移 + 50%」把 mask 盒中心钉在触发点上：
    // 50% 解析为 (元素宽 − mask 宽)/2，所以 mask 盒左边 = cx − maskSize/2，与 mask 尺寸无关。
    rootEl.style.setProperty('--theme-reveal-dx', `${Math.round(cx - innerWidth / 2)}px`);
    rootEl.style.setProperty('--theme-reveal-dy', `${Math.round(cy - innerHeight / 2)}px`);
    rootEl.dataset.themeReveal = 'on';

    try {
        const vt = viewTransitionDocument().startViewTransition!(() => {
            changeTheme();
        });
        // finished 在跳过 / 出错时也会 reject，统一吞掉保证清理必然执行。
        await vt.finished.catch(() => undefined);
    } finally {
        delete rootEl.dataset.themeReveal;
        for (const name of [
            '--theme-reveal-dur',
            '--theme-reveal-r',
            '--theme-reveal-dx',
            '--theme-reveal-dy',
        ]) {
            rootEl.style.removeProperty(name);
        }
        active = false;
    }
}
