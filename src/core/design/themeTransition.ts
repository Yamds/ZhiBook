// 主题切换过渡 — View Transition 圆形揭示。
//
// 换主题时把新旧两层快照叠起来：新层以触发点（最近一次 pointerdown，或调用方显式传入）
// 为圆心，用一个带柔边的圆从小撑到盖住全屏；旧层在下面原样等着，新层盖到哪就换到哪。
//
// 机制在 core/design/circleReveal.ts（与启动页揭示共用，只有一次 mask-size 动画）。
// Android 端已移除全部「光波」特效：蓄力画布、波前光环、回声环、发热冷却滤镜都没了。
//
// 模板的「保存后切换」流程由保存按钮显式调用 captureThemeTransitionOrigin 记录圆心；
// 全局 pointerdown 跟踪只作为兜底。

import { playCircleReveal, supportsCircleReveal } from './circleReveal';

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

export async function playThemeTransition(
    changeTheme: () => void,
    opts: ThemeTransitionOptions,
): Promise<void> {
    // 优雅档 / 禁用动画 / 不支持 View Transition 时直接切。
    if (!opts.enabled || opts.level === 'elegant' || !supportsCircleReveal()) {
        changeTheme();
        return;
    }

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

    // opts.easing 不传递：主题切换的缓动一直写死在 circleReveal.css 的默认值里
    // （cubic-bezier(0.3, 0.75, 0.35, 1)），保持既有手感不变。
    await playCircleReveal(() => changeTheme(), {
        cx,
        cy,
        durMs,
    });
}
