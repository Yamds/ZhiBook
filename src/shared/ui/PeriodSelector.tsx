// 年 / 月 / 日 横滑选择器（账单、明细、日历共用）。
//
// 结构：一条横向吸附滚动轨道，所有候选值渲染成等宽格子，选中项居中；
// 两端各留 (visible-1)/2 个空槽，所以边界年 / 月 / 日自然显示为空白。
// 中间项正常字重，两侧降低对比度 + 容器 mask 渐隐 —— 就是需求里的「左右渐隐」。
//
// 手势：轨道自身是横向滚动容器（overflow-x: auto），壳的横滑识别
// （useHorizontalSwipe）会主动跳过它，所以在这里滑动永远不会误切页签。
// 轨道额外标 data-swipe-scroll，即使候选太少不溢出也照样跳过。

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../utils/cn';
import {
    centeredScrollLeft,
    nearestIndexFromViewport,
    nearestValue,
} from './periodSelector.logic';

export interface PeriodSelectorProps {
    /** 候选值（年：年份升序；月：1-12；日：1..当月天数）。 */
    values: ReadonlyArray<number>;
    value: number;
    onChange: (value: number) => void;
    /** 可见槽位数：年 3，月 / 日 5。默认 5。 */
    visible?: 3 | 5;
    /** 数值 → 展示文案，默认原样。 */
    format?: (value: number) => string;
    /** 选中项后缀单位（年 / 月 / 日）。 */
    unit?: string;
    ariaLabel: string;
    className?: string;
    /** 需要打标记的取值（如「今天」）：在数字下方画一个小圆点。 */
    isMarked?: (value: number) => boolean;
}

/** 滚动停止判定：触摸端 momentum 结束后 140ms 内没有新的 scroll 事件。 */
const SETTLE_DELAY_MS = 140;

const FADE_MASK =
    'linear-gradient(to right, rgba(0,0,0,0.12) 0%, #000 30%, #000 70%, rgba(0,0,0,0.12) 100%)';

export function PeriodSelector({
    values,
    value,
    onChange,
    visible = 5,
    format,
    unit,
    ariaLabel,
    className,
    isMarked,
}: PeriodSelectorProps) {
    const trackRef = useRef<HTMLDivElement | null>(null);
    const programmaticRef = useRef(false);
    const settleTimerRef = useRef<number | null>(null);
    const [dragging, setDragging] = useState(false);

    const clamped = nearestValue(values, value);
    const half = (visible - 1) / 2;
    const valueIndex = Math.max(0, values.indexOf(clamped));
    const itemBasis = `${100 / visible}%`;

    const scrollToItem = useCallback((index: number, behavior: ScrollBehavior) => {
        const track = trackRef.current;
        const item = track?.children[index] as HTMLElement | undefined;
        if (!track || !item) return;
        const target = centeredScrollLeft(item.offsetLeft, item.offsetWidth, track.clientWidth);
        programmaticRef.current = true;
        track.scrollTo({ left: target, behavior });
        window.setTimeout(() => {
            programmaticRef.current = false;
        }, behavior === 'smooth' ? 360 : 40);
    }, []);

    // 首帧与换值后：把选中项滚到中间。
    useEffect(() => {
        scrollToItem(valueIndex + half, 'auto');
    }, [half, scrollToItem, valueIndex]);

    const commitFromScroll = useCallback(() => {
        const track = trackRef.current;
        if (!track) return;
        const centers = Array.from(track.children).map(
            (child) => (child as HTMLElement).offsetLeft + (child as HTMLElement).offsetWidth / 2,
        );
        const index = nearestIndexFromViewport(centers, track.scrollLeft, track.clientWidth) - half;
        const next = values[index];
        if (next === undefined || next === clamped) return;
        onChange(next);
    }, [clamped, half, onChange, values]);

    const handleScroll = useCallback(() => {
        if (!dragging) setDragging(true);
        if (programmaticRef.current) return;
        if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = window.setTimeout(() => {
            settleTimerRef.current = null;
            setDragging(false);
            commitFromScroll();
        }, SETTLE_DELAY_MS);
    }, [commitFromScroll, dragging]);

    useEffect(() => () => {
        if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    }, []);

    return (
        <div
            ref={trackRef}
            role="group"
            aria-label={ariaLabel}
            data-no-swipe
            data-swipe-scroll
            onScroll={handleScroll}
            className={cn(
                'scrollbar-hide relative flex h-10 select-none snap-x snap-mandatory overflow-x-auto overscroll-x-contain',
                className,
            )}
            style={{ maskImage: FADE_MASK, WebkitMaskImage: FADE_MASK }}
        >
            {Array.from({ length: half }, (_, index) => (
                <div key={`spacer-start-${index}`} className="h-full shrink-0 snap-center" style={{ width: itemBasis }} aria-hidden />
            ))}
            {values.map((item, index) => {
                const selected = index === valueIndex;
                return (
                    <button
                        key={item}
                        type="button"
                        onClick={() => {
                            if (item === clamped) scrollToItem(index + half, 'smooth');
                            else onChange(item);
                        }}
                        aria-current={selected ? 'true' : undefined}
                        className={cn(
                            'relative flex h-full shrink-0 snap-center items-baseline justify-center transition-colors duration-150',
                            selected
                                ? 'text-[15px] font-semibold text-text'
                                : 'text-[13px] text-text-tertiary active:text-text-secondary',
                        )}
                        style={{ width: itemBasis }}
                    >
                        <span className="tabular-nums">{format ? format(item) : item}</span>
                        {unit ? (
                            <span className={cn('ml-0.5 text-[11px] font-normal', selected ? 'text-text-secondary' : 'text-text-disabled')}>
                                {unit}
                            </span>
                        ) : null}
                        {isMarked?.(item) ? (
                            <span
                                aria-hidden
                                className={cn(
                                    'absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full',
                                    selected ? 'bg-brand' : 'bg-text-tertiary',
                                )}
                            />
                        ) : null}
                    </button>
                );
            })}
            {Array.from({ length: half }, (_, index) => (
                <div key={`spacer-end-${index}`} className="h-full shrink-0 snap-center" style={{ width: itemBasis }} aria-hidden />
            ))}
        </div>
    );
}

export default PeriodSelector;
