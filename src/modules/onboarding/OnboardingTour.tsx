// 新手引导遮罩层：全屏加暗 + 目标开洞 + 气泡说明。
//
// 交互：
//   - 目标区域不被遮罩覆盖，可以直接点真实按钮；目标之外全部拦住；
//   - `tapTarget` 步骤点中目标即推进，其余步骤点气泡上的「下一步」；
//   - 引导期间没有「跳过 / 关闭」，返回键由壳消费（见 AppNext）——不允许中途退出；
//   - 目标找不到时短暂等待后自动跳过，避免任何情况下把用户卡死。
//
// 完成状态写回后端 `uiPreferences.onboardingCompleted`；设置 / 关于里的重新唤起
// 直接调 `startOnboarding()`，与首启自动开始走同一套渲染。

import type { CSSProperties } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { navigateTo } from '../../app/navigationStore';
import { useBackendSettings } from '../../hooks/preferences/useBackendSettings';
import { cn } from '../../shared/utils/cn';
import {
    advanceOnboarding,
    finishOnboarding,
    startOnboarding,
    useOnboarding,
} from './onboardingStore';
import { TOUR_STEPS } from './tourSteps';
import { useTargetRect } from './useTargetRect';

const OVERLAY_Z = 'z-[150]';
const TOOLTIP_Z = 'z-[152]';
/** 目标周围留出的洞边距（容错手指 / 让高亮有呼吸感）。 */
const HOLE_PADDING = 6;
/** 气泡与目标的间距。 */
const TOOLTIP_GAP = 16;
const TOOLTIP_WIDTH = 320;
const EDGE_MARGIN = 12;
/** 目标始终找不到时的自动跳过等待。 */
const MISSING_TARGET_TIMEOUT_MS = 1200;
/** 气泡放到目标下方而不是上方的阈值（顶部空间不足时）。 */
const BELOW_THRESHOLD = 190;

export interface OnboardingTourProps {
    /** 启动层退场、壳真正可见后才允许自动开始首启引导。 */
    bootSettled: boolean;
}

export function OnboardingTour({ bootSettled }: OnboardingTourProps) {
    const { settings, patchBackend } = useBackendSettings();
    const { active, index } = useOnboarding();
    const startedRef = useRef(false);

    const step = active ? TOUR_STEPS[index] ?? null : null;
    const target = active && step?.target ? step.target : null;
    const rect = useTargetRect(target);

    const complete = useCallback(() => {
        finishOnboarding();
        patchBackend((current) => ({
            ...current,
            uiPreferences: { ...current.uiPreferences, onboardingCompleted: true },
        }));
    }, [patchBackend]);

    const advance = useCallback(() => {
        if (index + 1 >= TOUR_STEPS.length) {
            complete();
            return;
        }
        advanceOnboarding();
    }, [complete, index]);

    // 首启自动开始；已完成 / 老用户（后端默认 true）不打扰。
    useEffect(() => {
        if (!bootSettled || startedRef.current || !settings) return;
        if (settings.uiPreferences?.onboardingCompleted === false) {
            startedRef.current = true;
            startOnboarding();
        }
    }, [bootSettled, settings]);

    // 进入某一步：确保在该步所在页面（点目标已导航时幂等）。
    useEffect(() => {
        if (!active || !step) return;
        navigateTo(step.screen);
    }, [active, step]);

    // 目标缺失保护：找不到就自动跳过。
    useEffect(() => {
        if (!active || !step?.target || rect) return;
        const timer = window.setTimeout(advance, MISSING_TARGET_TIMEOUT_MS);
        return () => window.clearTimeout(timer);
    }, [active, step, rect, advance]);

    // 点目标本身推进。
    useEffect(() => {
        if (!active || !step?.target || !step.tapTarget) return;
        const selector = step.target;
        const handler = (event: MouseEvent) => {
            const node = event.target;
            if (!(node instanceof Element)) return;
            if (node.closest(selector)) advance();
        };
        document.addEventListener('click', handler, true);
        return () => document.removeEventListener('click', handler, true);
    }, [active, step, advance]);

    if (!active || !step) return null;

    // 等目标出现：先铺满全遮罩，避免这 1.2s 内用户误触其它按钮。
    if (step.target && !rect) {
        return (
            <div
                className={cn('pointer-events-auto fixed inset-0 bg-black/60', OVERLAY_Z)}
                role="dialog"
                aria-modal="true"
                aria-label="新手引导"
            />
        );
    }

    const spotlight = rect
        ? {
              top: rect.top - HOLE_PADDING,
              left: rect.left - HOLE_PADDING,
              right: rect.right + HOLE_PADDING,
              bottom: rect.bottom + HOLE_PADDING,
              width: rect.width + HOLE_PADDING * 2,
              height: rect.height + HOLE_PADDING * 2,
          }
        : null;

    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 360;
    const centerX = spotlight
        ? Math.min(
              Math.max(
                  spotlight.left + spotlight.width / 2,
                  EDGE_MARGIN + TOOLTIP_WIDTH / 2,
              ),
              viewportWidth - EDGE_MARGIN - TOOLTIP_WIDTH / 2,
          )
        : viewportWidth / 2;
    const placeBelow = spotlight ? spotlight.top < BELOW_THRESHOLD : false;
    const tooltipStyle: CSSProperties = spotlight
        ? {
              left: centerX,
              top: placeBelow ? spotlight.bottom + TOOLTIP_GAP : spotlight.top - TOOLTIP_GAP,
              transform: `translate(-50%, ${placeBelow ? '0' : '-100%'})`,
          }
        : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };

    const isLast = index + 1 >= TOUR_STEPS.length;

    return (
        <div className="pointer-events-none fixed inset-0 z-[150]" role="dialog" aria-modal="true" aria-label="新手引导">
            {spotlight ? (
                <>
                    <div
                        className={cn('pointer-events-auto fixed bg-black/60', OVERLAY_Z)}
                        style={{ top: 0, left: 0, right: 0, height: Math.max(0, spotlight.top) }}
                        aria-hidden
                    />
                    <div
                        className={cn('pointer-events-auto fixed bg-black/60', OVERLAY_Z)}
                        style={{ top: spotlight.bottom, left: 0, right: 0, bottom: 0 }}
                        aria-hidden
                    />
                    <div
                        className={cn('pointer-events-auto fixed bg-black/60', OVERLAY_Z)}
                        style={{
                            top: spotlight.top,
                            left: 0,
                            width: Math.max(0, spotlight.left),
                            height: spotlight.height,
                        }}
                        aria-hidden
                    />
                    <div
                        className={cn('pointer-events-auto fixed bg-black/60', OVERLAY_Z)}
                        style={{
                            top: spotlight.top,
                            left: spotlight.right,
                            right: 0,
                            height: spotlight.height,
                        }}
                        aria-hidden
                    />
                    <div
                        className="pointer-events-none fixed rounded-lg ring-2 ring-brand"
                        style={{
                            top: spotlight.top,
                            left: spotlight.left,
                            width: spotlight.width,
                            height: spotlight.height,
                        }}
                        aria-hidden
                    />
                </>
            ) : (
                <div
                    className={cn('pointer-events-auto fixed inset-0 bg-black/60', OVERLAY_Z)}
                    aria-hidden
                />
            )}

            <div className={cn('pointer-events-auto fixed', TOOLTIP_Z)} style={tooltipStyle}>
                <div className="relative w-[min(20rem,calc(100vw-1.5rem))] rounded-lg bg-elevated p-4 shadow-popover">
                    {spotlight ? (
                        <span
                            className={cn(
                                'absolute left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 bg-elevated',
                                placeBelow ? '-top-1.5' : '-bottom-1.5',
                            )}
                            aria-hidden
                        />
                    ) : null}
                    <div className="flex items-center justify-between gap-2">
                        <h2 className="font-display text-[15px] font-semibold leading-tight text-text">
                            {step.title}
                        </h2>
                        <span className="shrink-0 text-[11px] tabular-nums text-text-tertiary">
                            {index + 1}/{TOUR_STEPS.length}
                        </span>
                    </div>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-text-secondary">
                        {step.body}
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                        {step.tapTarget ? (
                            <span className="text-[11px] leading-snug text-text-tertiary">
                                点一下高亮的地方，或点「下一步」
                            </span>
                        ) : (
                            <span aria-hidden />
                        )}
                        <button
                            type="button"
                            autoFocus
                            onClick={advance}
                            className="h-9 shrink-0 rounded-md bg-brand px-4 text-[13px] font-semibold text-white active:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                            {isLast ? '完成' : '下一步'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default OnboardingTour;
