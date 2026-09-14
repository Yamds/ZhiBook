// 首屏启动层：在 App 壳就绪前展示品牌动效；尊重 useMotion / prefers-reduced-motion。
// 四幕：诞生（立绘从极光底色里长出，星点迸发）→ 成形（轨道环、标题、进度到一半）
// → 待机（换词、进度到八成后呼吸）→ 出发（进度冲满、收束、爆发、以立绘为圆心开洞揭示主界面）。
//
// Android 端已移除全部「光波」特效（蓄力环 / 冲击波 / 揭示光边），只留点状光与轨道环；
// 立绘直接用 mascot.png，不再套图卡底板。

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import gsap from 'gsap';
import { useMotion } from '../hooks/preferences/useMotion';
import { playCircleReveal } from '../core/design/circleReveal';
import { APP_PRODUCT_NAME_KEY, APP_VERSION_LABEL } from '../core/domain/app-meta';
import { t as translate } from '../core/i18n';
import mascotSplash from '../assets/mascot.png';
import { bindVisibilityPause } from '../shared/ui/motion/visibilityPause';

/// 壳已就绪后至少再展示这么久（含进场），让「正在准备界面」那一拍能被读到。
/// 基准值按默认速度（k=2）翻倍后约 1.8s；速度滑块拉快时整段随之缩短。
const MIN_VISIBLE_BASE_MS = 900;
const MAX_WAIT_MS = 12_000;

/** 副标题三个阶段文案的 i18n key（启动层是一次性动画，直接读当下语言即可）。 */
const SUB_TEXT_KEYS = {
    wake: 'app.splashWake',
    prepare: 'app.splashPrepare',
    ready: 'app.splashReady',
} as const;

/// 进度条三段：进场到一半、待机推到八成并呼吸、出发瞬间冲满。
const BAR_ENTER = 0.45;
const BAR_IDLE = 0.8;
const BAR_IDLE_BREATH = 0.84;

/// 副标题换词：旧词上飘淡出，新词从下方浮入；同词不重播。
function swapText(el: HTMLElement, next: string, k: number): gsap.core.Timeline | null {
    if (el.textContent === next) return null;
    return gsap
        .timeline()
        .to(el, { autoAlpha: 0, y: -6, duration: 0.05 * k, ease: 'power2.in' })
        .add(() => {
            el.textContent = next;
        })
        .fromTo(el, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.08 * k, ease: 'power2.out' });
}

interface SplashParticle {
    left: number;
    top: number;
    size: number;
    accent: boolean;
    driftX: number;
    driftY: number;
    /// 基准秒，运行时再按速度滑块缩放。
    driftDur: number;
}

/// 固定种子 LCG：每次启动布局一致，又不用手写几十个坐标。
function buildParticles(count: number, seed: number): SplashParticle[] {
    let state = seed >>> 0;
    const rand = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
    const out: SplashParticle[] = [];
    while (out.length < count) {
        const left = 4 + rand() * 92;
        const top = 6 + rand() * 88;
        // 中央 logo / 标题区留空，星点别压在文字上
        if (left > 32 && left < 68 && top > 26 && top < 74) continue;
        out.push({
            left,
            top,
            size: 2 + Math.round(rand() * 4),
            accent: rand() < 0.4,
            driftX: (rand() - 0.5) * 18,
            driftY: -(6 + rand() * 14),
            driftDur: 1.3 + rand() * 1.2,
        });
    }
    return out;
}

const SPLASH_PARTICLES = buildParticles(18, 1592707838);

/**
 * 轨道环直径：跟立绘一起放大，并用 `clamp` 跟屏宽走（窄屏不撑破、宽屏不变小）。
 * 尺寸写成 CSS 长度字符串，下面直接用 calc 算负半宽居中。
 */
const ORBIT_RINGS: ReadonlyArray<{
    size: string;
    solid: boolean;
    dotAtTop: boolean;
    accentDot: boolean;
    spin: 1 | -1;
    /// 转一圈的基准秒。
    dur: number;
}> = [
    { size: 'clamp(190px, 53vw, 230px)', solid: false, dotAtTop: true, accentDot: false, spin: 1, dur: 7 },
    { size: 'clamp(234px, 65vw, 282px)', solid: true, dotAtTop: false, accentDot: true, spin: -1, dur: 10 },
];

const SPARKLES: ReadonlyArray<{
    top?: string;
    bottom?: string;
    left?: string;
    right?: string;
    size: number;
    color: string;
    char: string;
}> = [
    { top: '-10px', right: '-12px', size: 18, color: 'var(--brand-300, #f59e0b)', char: '✦' },
    { top: '-8px', left: '-10px', size: 14, color: 'var(--brand-400, #a855f7)', char: '✧' },
    { bottom: '-8px', right: '-8px', size: 14, color: 'var(--accent-400, #ec4899)', char: '✧' },
    { bottom: '-10px', left: '-12px', size: 18, color: 'var(--green-400, #10b981)', char: '✦' },
];

const BRAND_PULSE_SIZE = 'clamp(392px, 112vw, 520px)';

/// 逐字渐变拼成整条：父级 `bg-clip-text` 在子元素被 transform 时会整字不画（Chrome 实测），
/// 所以渐变落到每个字身上，再按最终布局（offsetLeft，不受动画 transform 影响）把每字的
/// background 偏移拼成连续的一条。h1 必须 `relative` 才是字的 offsetParent。
function syncTitleCharGradients(title: HTMLHeadingElement | null, chars: HTMLSpanElement[]): void {
    if (!title || chars.length === 0) return;
    const width = title.offsetWidth;
    if (width <= 0) return;
    for (const char of chars) {
        if (char.offsetParent !== title) continue;
        char.style.backgroundSize = `${width}px 100%`;
        char.style.backgroundPositionX = `${-char.offsetLeft}px`;
    }
}

export interface StartupSplashProps {
    shellReady: boolean;
    /// 是否用 View Transition 圆形揭示主界面（宿主按动效开关 / 支持情况决定）。
    /// false 时退场走整层淡出，主界面壳自己播入场动画。
    irisReveal: boolean;
    /// 退场开始揭示主界面的那一刻（比 onFinished 早），宿主用它起播主界面入场动画。
    onReveal?: () => void;
    onFinished: () => void;
}

export const StartupSplash: React.FC<StartupSplashProps> = ({ shellReady, irisReveal, onReveal, onFinished }) => {
    const rootRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const logoRef = useRef<HTMLImageElement>(null);
    const logoWrapRef = useRef<HTMLDivElement>(null);
    const logoBoxRef = useRef<HTMLDivElement>(null);
    const brandPulseRef = useRef<HTMLDivElement>(null);
    const titleRef = useRef<HTMLHeadingElement>(null);
    const titleCharRefs = useRef<(HTMLSpanElement | null)[]>([]);
    const subRef = useRef<HTMLDivElement>(null);
    const subTextRef = useRef<HTMLSpanElement>(null);
    const barRef = useRef<HTMLDivElement>(null);
    const barTrackRef = useRef<HTMLDivElement>(null);
    const glowRef = useRef<HTMLDivElement>(null);
    const auroraRef = useRef<HTMLDivElement>(null);
    const versionRef = useRef<HTMLParagraphElement>(null);
    const particleRefs = useRef<(HTMLSpanElement | null)[]>([]);
    const ringRefs = useRef<(HTMLDivElement | null)[]>([]);
    const sparkleRefs = useRef<(HTMLSpanElement | null)[]>([]);
    const motion = useMotion();
    const mountedAt = useRef(typeof performance !== 'undefined' ? performance.now() : 0);
    const [exiting, setExiting] = useState(false);
    const [enterDone, setEnterDone] = useState(false);
    const finishedRef = useRef(false);
    const revealedRef = useRef(false);

    const isRich = motion.level === 'rich';
    const flourish = motion.level !== 'elegant';

    const notifyReveal = useCallback(() => {
        if (revealedRef.current) return;
        revealedRef.current = true;
        onReveal?.();
    }, [onReveal]);

    const finish = useCallback(() => {
        if (finishedRef.current) return;
        finishedRef.current = true;
        notifyReveal();
        onFinished();
    }, [notifyReveal, onFinished]);

    useEffect(() => {
        const root = rootRef.current;
        const stage = stageRef.current;
        const logo = logoRef.current;
        const logoWrap = logoWrapRef.current;
        const logoBox = logoBoxRef.current;
        const title = titleRef.current;
        const titleChars = titleCharRefs.current.filter(Boolean) as HTMLSpanElement[];
        const sub = subRef.current;
        const subText = subTextRef.current;
        const bar = barRef.current;
        const barTrack = barTrackRef.current;
        const glow = glowRef.current;
        const aurora = auroraRef.current;
        const brandPulse = brandPulseRef.current;
        const version = versionRef.current;
        const particles = particleRefs.current.filter(Boolean) as HTMLSpanElement[];
        const rings = ringRefs.current.filter(Boolean) as HTMLDivElement[];
        if (!root || !logo || !logoWrap || !logoBox || !title || !sub || !bar) return;

        if (!motion.enabled) {
            gsap.set([stage, logoWrap, logoBox, logo, title, sub, subText, bar, barTrack, version].filter(Boolean), {
                autoAlpha: 1,
                y: 0,
                scale: 1,
                scaleX: 1,
                clearProps: 'filter',
            });
            if (titleChars.length > 0) gsap.set(titleChars, { x: 0, clearProps: 'transform' });
            if (subText) subText.textContent = translate(SUB_TEXT_KEYS.prepare);
            if (glow) gsap.set(glow, { autoAlpha: 0.35 });
            if (aurora) gsap.set(aurora, { autoAlpha: 0.7 });
            if (brandPulse) gsap.set(brandPulse, { autoAlpha: 0.3, scale: 1 });
            gsap.set(rings, { autoAlpha: 0.6, scale: 1, rotation: 0 });
            gsap.set(particles, { autoAlpha: 0.3, scale: 1, x: 0, y: 0 });
            setEnterDone(true);
            return;
        }

        setEnterDone(false);

        const k = 1 / Math.max(0.5, motion.speed);
        const s = (v: number) => v * k;
        const t = motion.preset.timing;
        const f = motion.preset.feel;
        const enterDur = motion.duration('slow');
        const baseDur = motion.duration('base');
        const fast = motion.duration('fast');
        const richBoost = isRich ? 1 : flourish ? 0.65 : 0.35;

        // 迸发原点取 logo 的纯布局中心；effect 重跑时元素上可能残留上一轮 transform，先清掉再量
        gsap.set([stage, logoWrap, logoBox, title, ...titleChars, ...particles].filter(Boolean), { clearProps: 'transform' });
        syncTitleCharGradients(title, titleChars);
        // 字体异步加载完成后字宽会变，偏移要重算一次（offsetLeft 是布局值，不受动画 transform 影响）
        if (typeof document !== 'undefined' && document.fonts) {
            void document.fonts.ready.then(() => {
                syncTitleCharGradients(
                    titleRef.current,
                    titleCharRefs.current.filter(Boolean) as HTMLSpanElement[],
                );
            });
        }
        const logoRect = logoBox.getBoundingClientRect();
        const cx = logoRect.left + logoRect.width / 2;
        const cy = logoRect.top + logoRect.height / 2;
        const burstOffsets = particles.map((p) => {
            const r = p.getBoundingClientRect();
            return { dx: cx - (r.left + r.width / 2), dy: cy - (r.top + r.height / 2) };
        });

        gsap.set(root, { autoAlpha: 1 });
        if (stage) gsap.set(stage, { scale: flourish ? 1.05 : 1, transformOrigin: '50% 45%' });
        gsap.set(logoWrap, {
            autoAlpha: 0,
            scale: flourish ? 0.3 : Math.max(f.popPeak * 0.86, 0.9),
            y: flourish ? 0 : 14,
            transformOrigin: '50% 50%',
        });
        gsap.set(
            logoBox,
            isRich
                ? { autoAlpha: 0, rotationY: -32, rotationX: 16, transformPerspective: 640, filter: 'brightness(2.2)' }
                : { autoAlpha: 0 },
        );
        gsap.set(logo, { autoAlpha: 1 });
        gsap.set(title, {
            autoAlpha: 0,
            y: 12,
            ...(flourish ? { filter: 'blur(10px)' } : {}),
        });
        if (flourish && titleChars.length > 0) {
            // 收字距改用逐字 transform：0.32em 是原来的起始字距
            const spread = parseFloat(getComputedStyle(title).fontSize) * 0.32;
            gsap.set(titleChars, {
                x: (index: number) => (index - (titleChars.length - 1) / 2) * spread,
            });
        }
        if (subText) {
            subText.textContent = translate(SUB_TEXT_KEYS.wake);
            gsap.set(subText, { autoAlpha: 1, y: 0 });
        }
        gsap.set(sub, { autoAlpha: 0, y: 8 });
        gsap.set(bar, { autoAlpha: 0, scaleX: 0, transformOrigin: 'left center', clearProps: 'filter' });
        if (barTrack) gsap.set(barTrack, { autoAlpha: 0, y: 0 });
        if (version) gsap.set(version, { autoAlpha: 0, y: 6 });
        if (glow) gsap.set(glow, { autoAlpha: 0, scale: 0.9 });
        if (aurora) gsap.set(aurora, { autoAlpha: 0 });
        if (brandPulse) gsap.set(brandPulse, { autoAlpha: 0, scale: 0.75 });
        gsap.set(rings, {
            autoAlpha: 0,
            scale: 0.55,
            rotation: (i: number) => (i % 2 === 0 ? -40 : 40),
        });
        particles.forEach((p, i) => {
            const o = burstOffsets[i];
            gsap.set(
                p,
                flourish
                    ? { autoAlpha: 0, scale: 0, x: o.dx, y: o.dy }
                    : { autoAlpha: 0, scale: 0.6, x: 0, y: 0 },
            );
        });

        const tl = gsap.timeline({
            onComplete: () => {
                gsap.set(logo, { autoAlpha: 1, visibility: 'visible' });
                setEnterDone(true);
            },
        });

        // 底色与"镜头"慢慢推近到位，贯穿整段进场
        if (aurora) {
            tl.to(
                aurora,
                { autoAlpha: 0.55 + 0.45 * richBoost, duration: s(0.7), ease: 'power2.out' },
                0,
            );
        }
        if (glow) {
            tl.to(
                glow,
                {
                    autoAlpha: 0.35 + 0.15 * richBoost,
                    scale: 1.02,
                    duration: enterDur * 1.2,
                    ease: t.ease.enter,
                },
                0,
            );
        }
        if (stage && flourish) {
            tl.to(stage, { scale: 1, duration: s(0.9), ease: 'power2.out' }, 0);
        }

        // 第一幕 诞生：立绘从极光底色里长出并翻正，星点顺势迸向四周。
        // 原来的第一幕「火种」（白色核心的闪烁光点）已移除 —— 它正好出现在立绘之前，
        // 用户反馈像“立绘出来前的一道闪光”。
        const birthAt = flourish ? s(0.18) : 0;
        if (particles.length > 0) {
            tl.to(
                particles,
                {
                    autoAlpha: 0.45 + 0.4 * richBoost,
                    scale: 1,
                    x: 0,
                    y: 0,
                    duration: flourish ? s(0.45) : baseDur,
                    ease: flourish ? 'power3.out' : t.ease.enterMicro,
                    stagger: { each: s(0.008), from: 'random' },
                },
                birthAt,
            );
        }
        tl.to(
            logoWrap,
            { autoAlpha: 1, scale: 1, y: 0, duration: enterDur, ease: t.ease.pop },
            birthAt + (flourish ? 0 : s(0.04)),
        );
        tl.to(
            logoBox,
            isRich
                ? {
                    autoAlpha: 1,
                    rotationY: 0,
                    rotationX: 0,
                    filter: 'brightness(1)',
                    clearProps: 'filter',
                    duration: s(0.4),
                    ease: 'back.out(1.6)',
                }
                : { autoAlpha: 1, duration: enterDur * 0.7, ease: 'power2.out' },
            birthAt + (flourish ? 0 : s(0.04)),
        );
        if (brandPulse && richBoost > 0.25) {
            tl.to(
                brandPulse,
                { autoAlpha: 0.55 * richBoost, scale: 1, duration: enterDur * 0.95, ease: t.ease.enter },
                birthAt + s(0.02),
            );
        }

        // 第二幕 成形：轨道环撑开归位，标题收字距，进度条走到一半
        if (rings.length > 0 && flourish) {
            tl.to(
                rings,
                {
                    autoAlpha: 1,
                    scale: 1,
                    rotation: 0,
                    duration: s(0.32),
                    ease: 'back.out(1.8)',
                    stagger: s(0.04),
                },
                birthAt + s(0.06),
            );
        }
        tl.to(
            title,
            {
                autoAlpha: 1,
                y: 0,
                ...(flourish ? { filter: 'blur(0px)', clearProps: 'filter' } : {}),
                duration: flourish ? s(0.36) : baseDur,
                ease: isRich ? 'expo.out' : t.ease.enter,
            },
            birthAt + s(0.1),
        );
        if (flourish && titleChars.length > 0) {
            // 收字距：逐字 transform 平移（原来的 letter-spacing 动画每帧都会触发文本重排）
            tl.to(
                titleChars,
                {
                    x: 0,
                    duration: s(0.36),
                    ease: isRich ? 'expo.out' : t.ease.enter,
                    clearProps: 'transform',
                },
                birthAt + s(0.1),
            );
        }
        tl.to(sub, { autoAlpha: 1, y: 0, duration: fast, ease: t.ease.enterMicro }, birthAt + s(0.15))
            .to(
                bar,
                { autoAlpha: 1, scaleX: BAR_ENTER, duration: s(0.25), ease: t.ease.damped },
                birthAt + s(0.17),
            );
        if (barTrack) {
            tl.to(barTrack, { autoAlpha: 1, duration: fast, ease: 'power2.out' }, birthAt + s(0.16));
        }
        if (version) {
            tl.to(version, { autoAlpha: 1, y: 0, duration: fast, ease: t.ease.enterMicro }, birthAt + s(0.22));
        }

        const safetyEnterTimer = window.setTimeout(() => {
            setEnterDone(true);
        }, tl.duration() * 1000 + 300);

        return () => {
            window.clearTimeout(safetyEnterTimer);
            tl.kill();
            gsap.killTweensOf(
                [
                    root,
                    stage,
                    logo,
                    logoBox,
                    logoWrap,
                    title,
                    ...titleChars,
                    sub,
                    subText,
                    bar,
                    barTrack,
                    glow,
                    aurora,
                    brandPulse,
                    version,
                    ...rings,
                    ...particles,
                ].filter(Boolean),
            );
        };
    }, [motion.enabled, motion.speed, motion.level, isRich, flourish]);

    // 第三幕 待机：换词、进度推到八成后呼吸，立绘浮动、轨道环慢转、星点漂移
    useEffect(() => {
        const logoWrap = logoWrapRef.current;
        const brandPulse = brandPulseRef.current;
        const bar = barRef.current;
        const subText = subTextRef.current;
        const particles = particleRefs.current.filter(Boolean) as HTMLSpanElement[];
        const rings = ringRefs.current.filter(Boolean) as HTMLDivElement[];
        if (!motion.enabled || exiting || !enterDone) return;

        const k = 1 / Math.max(0.5, motion.speed);
        const loops: Array<gsap.core.Tween | gsap.core.Timeline> = [];

        if (subText) {
            const swap = swapText(subText, translate(SUB_TEXT_KEYS.prepare), k);
            if (swap) loops.push(swap);
        }
        if (bar) {
            loops.push(
                gsap
                    .timeline()
                    .to(bar, { scaleX: BAR_IDLE, duration: 0.35 * k, ease: 'power2.out' })
                    .to(bar, {
                        scaleX: BAR_IDLE_BREATH,
                        duration: 1.1 * k,
                        ease: 'sine.inOut',
                        yoyo: true,
                        repeat: -1,
                    }),
            );
        }
        if (logoWrap && isRich) {
            loops.push(
                gsap.to(logoWrap, { y: -4, duration: 2.4 * k, ease: 'sine.inOut', yoyo: true, repeat: -1 }),
            );
        }
        if (brandPulse && isRich) {
            loops.push(
                gsap.to(brandPulse, {
                    scale: 1.06,
                    opacity: 0.65,
                    duration: 2.8 * k,
                    ease: 'sine.inOut',
                    yoyo: true,
                    repeat: -1,
                }),
            );
        }
        if (flourish) {
            rings.forEach((ring, i) => {
                const cfg = ORBIT_RINGS[i];
                if (!cfg) return;
                loops.push(
                    gsap.fromTo(
                        ring,
                        { rotation: 0 },
                        { rotation: 360 * cfg.spin, duration: cfg.dur * k, ease: 'none', repeat: -1 },
                    ),
                );
            });
            particles.forEach((p, i) => {
                const cfg = SPLASH_PARTICLES[i];
                if (!cfg) return;
                loops.push(
                    gsap.to(p, {
                        x: cfg.driftX,
                        y: cfg.driftY,
                        opacity: i % 2 === 0 ? 0.35 : 1,
                        duration: cfg.driftDur * k,
                        ease: 'sine.inOut',
                        yoyo: true,
                        repeat: -1,
                    }),
                );
            });
        }

        const unbinds = loops.map((loop) => bindVisibilityPause(loop));
        return () => {
            for (const u of unbinds) u();
            for (const loop of loops) loop.kill();
        };
    }, [motion.enabled, motion.speed, motion.level, exiting, enterDone, isRich, flourish]);

    useEffect(() => {
        if (!shellReady || !enterDone || exiting || finishedRef.current) return;
        const k = motion.enabled ? 1 / Math.max(0.5, motion.speed) : 0;
        const elapsed = performance.now() - mountedAt.current;
        const wait = Math.max(0, MIN_VISIBLE_BASE_MS * k - elapsed);
        const timer = window.setTimeout(() => setExiting(true), wait);
        return () => window.clearTimeout(timer);
    }, [shellReady, enterDone, exiting, motion.enabled, motion.speed]);

    // 兜底：壳就绪后无论退场动画出什么状况，都不能把用户永远关在启动层外
    useEffect(() => {
        if (!shellReady) return;
        const safety = window.setTimeout(finish, MAX_WAIT_MS);
        return () => window.clearTimeout(safety);
    }, [shellReady, finish]);

    // 第四幕 出发
    useEffect(() => {
        if (!exiting || finishedRef.current) return;
        const root = rootRef.current;
        const stage = stageRef.current;
        const logo = logoRef.current;
        const logoWrap = logoWrapRef.current;
        const logoBox = logoBoxRef.current;
        const title = titleRef.current;
        const sub = subRef.current;
        const subText = subTextRef.current;
        const bar = barRef.current;
        const barTrack = barTrackRef.current;
        const glow = glowRef.current;
        const aurora = auroraRef.current;
        const brandPulse = brandPulseRef.current;
        const version = versionRef.current;
        const particles = particleRefs.current.filter(Boolean) as HTMLSpanElement[];
        const rings = ringRefs.current.filter(Boolean) as HTMLDivElement[];
        const sparkles = sparkleRefs.current.filter(Boolean) as HTMLSpanElement[];
        if (!root) return;

        if (!motion.enabled) {
            finish();
            return;
        }

        const k = 1 / Math.max(0.5, motion.speed);
        const s = (v: number) => v * k;
        const t = motion.preset.timing;
        const exitDur = motion.duration('fast');
        gsap.killTweensOf(
            [
                stage,
                logo,
                logoBox,
                logoWrap,
                title,
                sub,
                subText,
                bar,
                barTrack,
                glow,
                aurora,
                brandPulse,
                version,
                ...rings,
                ...particles,
                ...sparkles,
            ].filter(Boolean),
        );

        const exitTl = gsap.timeline({ onComplete: finish });

        // 就绪：换词，进度条冲满并亮一下
        if (subText) {
            const swap = swapText(subText, translate(SUB_TEXT_KEYS.ready), k);
            if (swap) exitTl.add(swap, 0);
        }
        if (bar) {
            exitTl
                .to(bar, { scaleX: 1, autoAlpha: 1, duration: s(0.1), ease: 'power3.out' }, 0)
                .to(bar, { filter: 'brightness(1.6)', duration: s(0.05), ease: 'power2.out' }, s(0.06))
                .to(bar, { filter: 'brightness(1)', clearProps: 'filter', duration: s(0.12), ease: 'power2.out' }, s(0.11));
        }
        if (!flourish) {
            notifyReveal();
            exitTl.to(root, { autoAlpha: 0, duration: exitDur * 1.2, ease: 'power2.inOut' }, s(0.12));
            return;
        }

        // 揭示原点取 logo 此刻的实际中心（待机漂移之后）
        const anchor = logoBox ?? logoWrap ?? root;
        const anchorRect = anchor.getBoundingClientRect();
        const cx = anchorRect.left + anchorRect.width / 2;
        const cy = anchorRect.top + anchorRect.height / 2;

        // 收束：轨道环加速塌缩，星点被吸回立绘
        const gatherAt = s(0.06);
        if (rings.length > 0) {
            exitTl.to(
                rings,
                { scale: 0.3, autoAlpha: 0, rotation: '+=160', duration: s(0.16), ease: 'power3.in' },
                gatherAt,
            );
        }
        if (particles.length > 0) {
            // 落点**提前一次性量好**，不要写成 tween 的函数值：
            // 那样 GSAP 会在每个元素上逐个 getBoundingClientRect（读 / 写交错 → 强制同步布局 ×N），
            // 正好卡在「收回粒子」那一刻。这里把多次读连在一起（只触发一次布局），
            // 且发生在 timeline 开播前。
            const gatherOffsets = particles.map((p) => {
                const r = p.getBoundingClientRect();
                return {
                    x: Number(gsap.getProperty(p, 'x')) + (cx - (r.left + r.width / 2)),
                    y: Number(gsap.getProperty(p, 'y')) + (cy - (r.top + r.height / 2)),
                };
            });
            exitTl.to(
                particles,
                {
                    x: (index: number) => gatherOffsets[index]?.x ?? 0,
                    y: (index: number) => gatherOffsets[index]?.y ?? 0,
                    scale: 0.15,
                    autoAlpha: 0,
                    duration: s(0.18),
                    ease: 'power3.in',
                    stagger: { each: s(0.003), from: 'random' },
                },
                gatherAt,
            );
        }

        // 爆发：立绘蹲起、四角星芒、光晕闪一下
        const burstAt = s(0.16);
        if (logoBox && isRich) {
            exitTl
                .to(
                    logoBox,
                    { scale: 1.1, y: -6, rotation: 2.5, duration: s(0.08), ease: 'back.out(2)' },
                    burstAt,
                )
                .to(
                    logoBox,
                    { scale: 1, y: 0, rotation: 0, duration: s(0.08), ease: 'power2.out' },
                    burstAt + s(0.08),
                );
        }
        if (sparkles.length > 0 && isRich) {
            exitTl
                .fromTo(
                    sparkles,
                    { autoAlpha: 0, scale: 0.2, rotation: -25 },
                    {
                        autoAlpha: 1,
                        scale: 1.35,
                        rotation: 45,
                        duration: s(0.11),
                        stagger: s(0.015),
                        ease: 'back.out(3)',
                    },
                    burstAt,
                )
                .to(
                    sparkles,
                    { autoAlpha: 0, scale: 0.4, y: -14, duration: s(0.11), ease: 'power2.in' },
                    burstAt + s(0.1),
                );
        }
        if (brandPulse) {
            exitTl
                .to(brandPulse, { autoAlpha: 0.95, scale: 1.2, duration: s(0.05), ease: 'power2.out' }, burstAt)
                .to(
                    brandPulse,
                    { autoAlpha: 0, scale: 1.7, duration: s(0.24), ease: 'power2.out' },
                    burstAt + s(0.05),
                );
        }

        // 揭示：文字与底色收走，镜头继续推近，以立绘为圆心开洞，主界面从洞里长出来
        const revealAt = burstAt + s(0.08);
        if (irisReveal) {
            // 圆形揭示走 View Transition（与主题切换同一套快照 + mask 机制）：
            // 先让立绘 / 文字收走（0.16s），再开洞 —— 旧快照是一张干净的底色快照，
            // 新快照是终点态的首页，揭示期间不再逐帧裁剪 / 重绘整屏内容。
            exitTl.call(
                () => {
                    void playCircleReveal(
                        () => {
                            flushSync(finish);
                        },
                        { cx, cy, durMs: Math.round(s(0.24) * 1000), featherPx: 24 },
                    );
                },
                undefined,
                revealAt + s(0.16),
            );
        } else {
            exitTl.call(notifyReveal, undefined, revealAt);
        }
        if (stage) exitTl.to(stage, { scale: 1.1, duration: s(0.3), ease: 'power2.in' }, revealAt);
        if (logoWrap) {
            exitTl.to(logoWrap, { scale: 1.45, autoAlpha: 0, duration: s(0.14), ease: 'power2.in' }, revealAt);
        }
        exitTl.to(
            [title, sub, barTrack ?? bar, version].filter(Boolean),
            { autoAlpha: 0, y: -10, duration: s(0.12), ease: t.ease.exit, stagger: s(0.012) },
            revealAt,
        );
        if (glow) exitTl.to(glow, { autoAlpha: 0, duration: s(0.2), ease: 'power2.out' }, revealAt);
        if (aurora) exitTl.to(aurora, { autoAlpha: 0, duration: s(0.2), ease: 'power2.out' }, revealAt);

        if (!irisReveal) {
            exitTl.to(root, { autoAlpha: 0, duration: s(0.2), ease: 'power2.inOut' }, revealAt + s(0.06));
        }
    }, [exiting, motion.enabled, motion.speed, motion.preset.timing, finish, notifyReveal, isRich, flourish, irisReveal]);

    return (
        <div
            ref={rootRef}
            className="fixed inset-0 z-[200] flex flex-col items-center justify-center overflow-hidden bg-canvas"
            role="status"
            aria-live="polite"
            aria-busy={!exiting}
        >
            <div
                ref={glowRef}
                className="ndf-canvas-glow pointer-events-none absolute inset-0 opacity-0"
                aria-hidden
            />
            <div ref={auroraRef} className="ndf-splash-aurora-layer opacity-0" aria-hidden>
                {(['a', 'b', 'c'] as const).map((key) => (
                    <div
                        key={key}
                        className={
                            `ndf-splash-aurora ndf-splash-aurora--${key}` +
                            (motion.enabled ? ' is-live' : '')
                        }
                    />
                ))}
            </div>
            {SPLASH_PARTICLES.map((p, i) => (
                <span
                    key={i}
                    ref={(el) => {
                        particleRefs.current[i] = el;
                    }}
                    className={
                        'ndf-splash-particle opacity-0' +
                        (p.accent ? ' ndf-splash-particle--accent' : '')
                    }
                    style={{
                        left: `${p.left}%`,
                        top: `${p.top}%`,
                        width: p.size,
                        height: p.size,
                    }}
                    aria-hidden
                />
            ))}

            <div ref={stageRef} className="relative z-10 flex flex-col items-center gap-5 px-8">
                <div ref={logoWrapRef} className="relative flex shrink-0 items-center justify-center opacity-0">
                    <div
                        ref={brandPulseRef}
                        className="ndf-splash-brand-pulse pointer-events-none absolute left-1/2 top-1/2 rounded-full opacity-0"
                        style={{
                            width: BRAND_PULSE_SIZE,
                            height: BRAND_PULSE_SIZE,
                            marginLeft: `calc(${BRAND_PULSE_SIZE} / -2)`,
                            marginTop: `calc(${BRAND_PULSE_SIZE} / -2)`,
                        }}
                        aria-hidden
                    />

                    {ORBIT_RINGS.map((ring, i) => (
                        <div
                            key={i}
                            ref={(el) => {
                                ringRefs.current[i] = el;
                            }}
                            className={
                                'ndf-splash-orbit-ring opacity-0' +
                                (ring.solid ? ' ndf-splash-orbit-ring--solid' : '')
                            }
                            style={{
                                width: ring.size,
                                height: ring.size,
                                marginLeft: `calc(${ring.size} / -2)`,
                                marginTop: `calc(${ring.size} / -2)`,
                            }}
                            aria-hidden
                        >
                            <span
                                className={
                                    'ndf-splash-orbit-dot' +
                                    (ring.accentDot ? ' ndf-splash-orbit-dot--accent' : '')
                                }
                                style={ring.dotAtTop ? { top: -3 } : { bottom: -3 }}
                            />
                        </div>
                    ))}

                    {SPARKLES.map((sp, idx) => (
                        <span
                            key={idx}
                            ref={(el) => {
                                sparkleRefs.current[idx] = el;
                            }}
                            className="pointer-events-none absolute z-20 select-none font-bold opacity-0"
                            style={{
                                top: sp.top,
                                bottom: sp.bottom,
                                left: sp.left,
                                right: sp.right,
                                fontSize: `${sp.size}px`,
                                color: sp.color,
                                filter: 'drop-shadow(0 0 6px currentColor)',
                            }}
                            aria-hidden
                        >
                            {sp.char}
                        </span>
                    ))}

                    {/* 立绘直接作为图形出现：透明底、不加图卡底板，靠投影与身后的光晕立住层次 */}
                    <div ref={logoBoxRef} className="relative z-10 opacity-0">
                        <img
                            ref={logoRef}
                            src={mascotSplash}
                            alt=""
                            width={966}
                            height={1254}
                            className="block h-[clamp(158px,44vw,198px)] w-auto drop-shadow-[0_10px_22px_rgba(0,0,0,0.28)]"
                            draggable={false}
                        />
                    </div>
                </div>
                <div className="flex flex-col items-center gap-1.5 text-center">
                    <h1
                        ref={titleRef}
                        className="relative text-xl font-semibold tracking-tight drop-shadow-sm"
                    >
                        {Array.from(translate(APP_PRODUCT_NAME_KEY)).map((char, index) => (
                            <span
                                key={`${char}-${index}`}
                                ref={(element) => {
                                    titleCharRefs.current[index] = element;
                                }}
                                className="inline-block bg-gradient-to-r from-text via-brand-200 to-text bg-clip-text text-transparent will-change-transform"
                            >
                                {char}
                            </span>
                        ))}
                    </h1>
                    <div ref={subRef} className="flex items-center gap-2 text-sm text-text-secondary">
                        <span className="ndf-splash-pulse-dot" aria-hidden />
                        <span ref={subTextRef}>{translate(SUB_TEXT_KEYS.wake)}</span>
                    </div>
                </div>
                <div
                    ref={barTrackRef}
                    className="relative h-1.5 w-56 overflow-hidden rounded-full bg-muted"
                    aria-hidden
                >
                    <div ref={barRef} className="ndf-splash-laser-bar h-full w-full origin-left rounded-full" />
                </div>
                <p ref={versionRef} className="text-xs text-text-tertiary tabular-nums">
                    {APP_VERSION_LABEL}
                </p>
            </div>
        </div>
    );
};

export default StartupSplash;
