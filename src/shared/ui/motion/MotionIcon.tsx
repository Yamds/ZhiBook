// 动态图标：Iconify 图标 + 弹入 / 循环动效。
//
// 图标本体由 AppIcon 渲染。MDI 是填充图标（没有 stroke），所以这里不做
// 「描边绘制」——进场统一是缩放 + 淡入，选中态再叠一层循环动效。
// 档位（elegant / standard / rich）与时长仍然全部走 useMotion()。

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useMotion } from '../../../hooks/preferences/useMotion';
import { cn } from '../../utils/cn';
import type { IconName } from '../../../core/design/icons';
import { AppIcon } from '../AppIcon';
import { bindVisibilityPause } from './visibilityPause';

export type MotionIconPreset =
    | 'none'
    | 'pulse'
    | 'breathe'
    | 'wiggle'
    | 'spin'
    | 'spin-slow'
    | 'nudge'
    | 'bob';

export interface MotionIconProps {
    icon: IconName;
    motion?: MotionIconPreset;
    /// 选中时播一次轻弹入（底部导航切换）。
    playEnter?: boolean;
    /// 变化时重播进场（传路由 id）。
    enterKey?: string;
    /// 悬停时短暂 pop，适合工具栏图标按钮。
    hoverAccent?: boolean;
    className?: string;
    size?: number;
    /// 有语义的图标传标题；不传则 aria-hidden。
    title?: string;
}

export function MotionIcon({
    icon,
    motion: preset = 'none',
    playEnter = true,
    enterKey,
    hoverAccent = false,
    className,
    size = 18,
    title,
}: MotionIconProps) {
    const wrapRef = useRef<HTMLSpanElement>(null);
    const lastEnterKeyRef = useRef<string | null>(null);
    const [enterSettled, setEnterSettled] = useState(preset === 'none');
    const m = useMotion();
    const active = preset !== 'none' && m.enabled;

    useEffect(() => {
        if (preset === 'none') {
            setEnterSettled(true);
            lastEnterKeyRef.current = null;
            return;
        }
        // 不播进场时直接允许循环动效（如 spin），否则 enterSettled 会一直是 false
        if (!playEnter) {
            setEnterSettled(true);
        }
    }, [preset, playEnter]);

    // 选中瞬间：轻弹入
    useEffect(() => {
        const wrap = wrapRef.current;
        if (!wrap || !m.enabled || preset === 'none' || !playEnter || !enterKey) {
            if (wrap && preset === 'none') {
                gsap.set(wrap, { scale: 1, rotation: 0, opacity: 1, y: 0 });
            }
            return;
        }
        if (lastEnterKeyRef.current === enterKey) return;
        lastEnterKeyRef.current = enterKey;
        setEnterSettled(false);

        const popEase = m.preset.timing.ease.pop;
        const enterTl = gsap.timeline({ onComplete: () => setEnterSettled(true) });
        enterTl.fromTo(
            wrap,
            { scale: 0.82, y: 3, opacity: 0.5 },
            {
                scale: 1,
                y: 0,
                opacity: 1,
                duration: m.duration('base'),
                ease: popEase,
            },
        );
        enterTl.call(() => setEnterSettled(true), [], '+=0.02');

        return () => {
            enterTl.kill();
        };
    }, [preset, playEnter, enterKey, m.enabled, m.duration, m.preset.timing.ease.pop]);

    // 选中态持续动效（进场结束后再开，避免和弹入打架）
    useEffect(() => {
        const el = wrapRef.current;
        const waitEnter = playEnter && enterKey != null && enterKey !== '';
        if (!el || !active || (waitEnter && !enterSettled)) {
            if (el && !active) {
                gsap.killTweensOf(el);
                gsap.set(el, { rotation: 0, scale: 1, y: 0, opacity: 1 });
            }
            return;
        }

        const speed = Math.max(0.5, m.speed);
        const f = m.preset.feel;
        const easeHover = m.preset.timing.ease.hover;
        let tl: gsap.core.Timeline | gsap.core.Tween | null = null;

        switch (preset) {
            case 'pulse':
                tl = gsap.timeline({ repeat: -1, yoyo: true }).to(el, {
                    scale: f.overshoot ? 1.1 : 1.05,
                    duration: (f.breathDuration * 0.55) / speed,
                    ease: 'sine.inOut',
                });
                break;
            case 'breathe':
                tl = gsap.timeline({ repeat: -1, yoyo: true }).to(el, {
                    opacity: f.overshoot ? 0.72 : 0.82,
                    duration: (f.breathDuration * 1.05) / speed,
                    ease: 'sine.inOut',
                });
                break;
            case 'wiggle':
                if (m.level === 'elegant') {
                    tl = gsap.timeline({ repeat: -1, yoyo: true }).to(el, {
                        scale: 1.04,
                        duration: f.breathDuration / speed,
                        ease: 'sine.inOut',
                    });
                } else {
                    tl = gsap.timeline({ repeat: -1, repeatDelay: 1.4 / speed }).to(el, {
                        rotation: 6,
                        duration: 0.09 / speed,
                        yoyo: true,
                        repeat: 3,
                        ease: 'power1.inOut',
                    });
                }
                break;
            case 'spin':
                tl = gsap.to(el, {
                    rotation: 360,
                    duration: 2.4 / speed,
                    ease: 'none',
                    repeat: -1,
                });
                break;
            case 'spin-slow':
                tl = gsap.to(el, {
                    rotation: 360,
                    duration: 4.5 / speed,
                    ease: 'none',
                    repeat: -1,
                });
                break;
            case 'nudge':
                tl = gsap.timeline({ repeat: -1, repeatDelay: 2.2 / speed }).to(el, {
                    y: -2,
                    duration: 0.22 / speed,
                    yoyo: true,
                    repeat: 1,
                    ease: easeHover,
                });
                break;
            case 'bob':
                tl = gsap.timeline({ repeat: -1, yoyo: true }).to(el, {
                    y: -2,
                    duration: 0.65 / speed,
                    ease: 'sine.inOut',
                });
                break;
            default:
                break;
        }

        const unbindVis = bindVisibilityPause(tl);
        return () => {
            unbindVis();
            tl?.kill();
            // 同一 DOM 在 spin → 静止图标间复用时必须清零 rotation，否则会「歪着」停住
            if (el) {
                gsap.set(el, { rotation: 0 });
            }
        };
    }, [
        active,
        enterSettled,
        playEnter,
        enterKey,
        preset,
        m.enabled,
        m.speed,
        m.level,
        m.preset.feel.overshoot,
        m.preset.feel.breathDuration,
        m.preset.timing.ease.hover,
    ]);

    useEffect(() => {
        const wrap = wrapRef.current;
        if (!wrap || !hoverAccent || !m.enabled) return;
        const onEnter = () => {
            m.pop(wrap, { peak: 1 + (m.preset.feel.popPeak - 1) * 0.45 });
        };
        wrap.addEventListener('mouseenter', onEnter);
        return () => wrap.removeEventListener('mouseenter', onEnter);
    }, [hoverAccent, m.enabled, m.level, m.speed, m.pop, m.preset.feel.popPeak]);

    return (
        <span
            ref={wrapRef}
            className={cn(
                'inline-flex shrink-0 items-center justify-center transition-[opacity] duration-200',
                !active && m.enabled && preset === 'none' && 'opacity-80',
                className,
            )}
            style={{ transformOrigin: '50% 50%' }}
        >
            <AppIcon name={icon} size={size} title={title} />
        </span>
    );
}

export default MotionIcon;
