// 圆形揭示（View Transition）通用入口。
//
// 把「切换前 / 切换后」两层**快照**叠起来：新层用一个带柔边的圆从指定圆心撑满全屏，
// 旧层原样垫在下面等着被盖住。动画只剩一次 mask-size 变化，与业务 DOM 的复杂度无关 ——
// 比逐帧改 clip-path / 缩放全屏实时层便宜得多。
//
// 使用方：主题切换（themeTransition.ts）与启动页揭示（StartupSplash）。
// 几何与 CSS 变量必须在 startViewTransition 之前写入（快照那一帧才解析得到）。
// mask 的 CSS 在 circleReveal.css。

import './circleReveal.css';

interface LocalViewTransition {
    readonly ready: Promise<void>;
    readonly finished: Promise<void>;
}

type ViewTransitionDocument = Document & {
    startViewTransition?: (update: () => void) => LocalViewTransition;
};

const viewTransitionDocument = (): ViewTransitionDocument => document as ViewTransitionDocument;

/** 当前 WebView 是否支持 View Transition（不支持时调用方走降级动画）。 */
export function supportsCircleReveal(): boolean {
    return (
        typeof document !== 'undefined' &&
        typeof viewTransitionDocument().startViewTransition === 'function'
    );
}

// 同一时刻只允许一个圆形揭示：叠两个会互相抢伪元素。
let active = false;

export interface CircleRevealOptions {
    /** 扩散圆心（视口坐标，px）。 */
    cx: number;
    cy: number;
    /** 动画时长（ms）。 */
    durMs: number;
    /** 圆边羽化宽度（px），默认 26。 */
    featherPx?: number;
    /** 动画缓动（CSS timing-function），默认与主题切换一致。 */
    easing?: string;
}

/**
 * 播放一次圆形揭示。`update` 里必须**同步**完成所有 DOM 变更
 * （React 状态更新请包一层 `flushSync`），否则新快照会拍到中间态。
 *
 * 不支持 View Transition 或已有揭示在进行时，退化为「只执行 update」。
 */
export async function playCircleReveal(update: () => void, opts: CircleRevealOptions): Promise<void> {
    if (!supportsCircleReveal() || active) {
        update();
        return;
    }
    active = true;

    const rootEl = document.documentElement;
    // 终端半径按最远的视口角算（再多给 40px，保证羽化边完全跑出屏幕）。
    const endR =
        Math.ceil(
            Math.hypot(Math.max(opts.cx, innerWidth - opts.cx), Math.max(opts.cy, innerHeight - opts.cy)),
        ) + 40;

    rootEl.style.setProperty('--circle-reveal-dur', `${Math.max(0, Math.round(opts.durMs))}ms`);
    rootEl.style.setProperty('--circle-reveal-r', `${endR}px`);
    // mask-position 用「圆心相对屏幕中心的偏移 + 50%」把 mask 盒中心钉在圆心上：
    // 50% 解析为 (元素宽 − mask 宽)/2，所以中心恒等于 (cx, cy)，与 mask 尺寸无关。
    rootEl.style.setProperty('--circle-reveal-dx', `${Math.round(opts.cx - innerWidth / 2)}px`);
    rootEl.style.setProperty('--circle-reveal-dy', `${Math.round(opts.cy - innerHeight / 2)}px`);
    rootEl.style.setProperty('--circle-reveal-feather', `${opts.featherPx ?? 26}px`);
    if (opts.easing) rootEl.style.setProperty('--circle-reveal-ease', opts.easing);
    rootEl.dataset.circleReveal = 'on';

    let updated = false;
    const run = () => {
        updated = true;
        update();
    };

    try {
        const vt = viewTransitionDocument().startViewTransition!(run);
        // finished 在跳过 / 出错时也会 reject，统一吞掉保证清理必然执行。
        await vt.finished.catch(() => undefined);
    } catch {
        // API 抛错也不能把 DOM 变更丢下（finally 里会补执行 update）
    } finally {
        if (!updated) update();
        delete rootEl.dataset.circleReveal;
        for (const name of [
            '--circle-reveal-dur',
            '--circle-reveal-r',
            '--circle-reveal-dx',
            '--circle-reveal-dy',
            '--circle-reveal-feather',
            '--circle-reveal-ease',
        ]) {
            rootEl.style.removeProperty(name);
        }
        active = false;
    }
}
