// 启动层：极简三段 —— 图案、应用名、进度条。
//
// 契约：主界面就绪（shellReady）且最短展示时间到齐后，播完退场动画调 onFinished。
// 动画关闭或系统 reduced-motion 命中时退化为瞬时切换，不做任何装饰性动画。

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useMotion } from '../hooks/preferences/useMotion';
import { APP_PRODUCT_NAME, APP_VERSION_LABEL } from '../core/domain/app-meta';
import kumiko from '../assets/kumiko-nobg.png';

/** 最短展示时间：主界面就绪过快时不让启动层一闪而过。 */
const MIN_DISPLAY_MS = 900;

/** 图案加载兜底：超时就先进场，不让一张图阻断启动。 */
const ART_LOAD_TIMEOUT_MS = 1200;

const HIDDEN: React.CSSProperties = { visibility: 'hidden', opacity: 0 };

export interface StartupSplashProps {
    shellReady: boolean;
    onFinished: () => void;
}

export const StartupSplash: React.FC<StartupSplashProps> = ({ shellReady, onFinished }) => {
    const motion = useMotion();
    const rootRef = useRef<HTMLDivElement>(null);
    const artRef = useRef<HTMLImageElement>(null);
    const copyRef = useRef<HTMLDivElement>(null);
    const barRef = useRef<HTMLDivElement>(null);
    const finishedRef = useRef(false);
    const [minElapsed, setMinElapsed] = useState(false);
    const [artReady, setArtReady] = useState(false);

    const finish = useCallback(() => {
        if (finishedRef.current) return;
        finishedRef.current = true;
        onFinished();
    }, [onFinished]);

    useEffect(() => {
        const id = window.setTimeout(() => setMinElapsed(true), MIN_DISPLAY_MS);
        return () => window.clearTimeout(id);
    }, []);

    // 图案就绪前不进场：大尺寸 PNG 解码慢时，避免先淡入一个空框再“啵”地弹出图片。
    // 加载失败或超时同样放行，不让启动流程被一张图卡住。
    useEffect(() => {
        const img = artRef.current;
        if (!img) return;
        if (img.complete && img.naturalWidth > 0) {
            setArtReady(true);
            return;
        }
        const done = () => setArtReady(true);
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
        const id = window.setTimeout(done, ART_LOAD_TIMEOUT_MS);
        return () => {
            img.removeEventListener('load', done);
            img.removeEventListener('error', done);
            window.clearTimeout(id);
        };
    }, []);

    // 进场：图案浮现 → 文案跟上 → 进度条铺开，停在 86% 等主界面。
    useLayoutEffect(() => {
        if (!artReady) return;
        const art = artRef.current;
        const copy = copyRef.current;
        const bar = barRef.current;
        const targets = [art, copy].filter(Boolean) as HTMLElement[];

        if (!motion.enabled) {
            gsap.set(targets, { autoAlpha: 1, y: 0, scale: 1 });
            gsap.set(bar, { scaleX: 1 });
            return;
        }

        const tl = gsap.timeline();
        tl.fromTo(
            art,
            { autoAlpha: 0, y: 14, scale: 0.96 },
            { autoAlpha: 1, y: 0, scale: 1, duration: motion.duration('slow'), ease: motion.ease.enter },
        )
            .fromTo(
                copy,
                { autoAlpha: 0, y: 10 },
                { autoAlpha: 1, y: 0, duration: motion.duration('base'), ease: motion.ease.enter },
                0.08,
            )
            .fromTo(
                bar,
                { scaleX: 0 },
                { scaleX: 0.86, duration: motion.duration('slow') * 2.6, ease: 'power1.out' },
                0.1,
            );
        return () => {
            tl.kill();
        };
    }, [artReady, motion]);

    // 退场：进度条补满 → 内容上浮淡出 → 整层溶图，交接给主界面。
    useEffect(() => {
        if (!shellReady || !minElapsed || finishedRef.current) return;
        const root = rootRef.current;
        const bar = barRef.current;
        if (!motion.enabled || !root) {
            finish();
            return;
        }
        const targets = [artRef.current, copyRef.current].filter(Boolean) as HTMLElement[];
        const tl = gsap.timeline({ onComplete: finish });
        if (bar) {
            tl.to(bar, { scaleX: 1, duration: motion.duration('fast'), ease: 'power2.out' }, 0);
        }
        tl.to(
            targets,
            { autoAlpha: 0, y: -10, duration: motion.duration('fast'), ease: motion.ease.exit },
            0.06,
        ).to(root, { autoAlpha: 0, duration: motion.duration('base'), ease: 'power1.inOut' }, 0.12);
        return () => {
            tl.kill();
        };
    }, [shellReady, minElapsed, motion, finish]);

    return (
        <div
            ref={rootRef}
            className="fixed inset-0 z-[200] flex flex-col items-center justify-center overflow-hidden bg-canvas"
            role="status"
            aria-busy="true"
            aria-label="正在启动"
        >
            <div className="ndf-canvas-glow pointer-events-none absolute inset-0" aria-hidden />
            <div className="relative z-10 flex w-full max-w-[320px] flex-col items-center px-8">
                <img
                    ref={artRef}
                    src={kumiko}
                    alt=""
                    width={176}
                    height={176}
                    style={HIDDEN}
                    className="h-44 w-44 select-none object-contain"
                    draggable={false}
                />
                <div ref={copyRef} style={HIDDEN} className="mt-6 flex flex-col items-center">
                    <span className="font-display text-[22px] font-semibold leading-none tracking-tight text-text">
                        {APP_PRODUCT_NAME}
                    </span>
                </div>
                <div className="mt-7 h-1 w-40 overflow-hidden rounded-pill bg-border-subtle">
                    <div
                        ref={barRef}
                        className="ndf-splash-laser-bar h-full w-full origin-left rounded-pill"
                        style={{ transform: 'scaleX(0)' }}
                    />
                </div>
                <p className="mt-4 font-mono text-[11px] tabular-nums text-text-tertiary">
                    {APP_VERSION_LABEL}
                </p>
            </div>
        </div>
    );
};

export default StartupSplash;
