// 分段控件（支出/收入、结余/支出/收入、年/月/日 之类的小切换）。
//
// 与 Tabs 的区别：Tabs 是「页面级页签」（带指示条、内容区），
// SegmentedControl 是「控件级选择」（一个滑块在固定轨道里滑）。
// 视觉走设计系统 token，动效走 useMotion()。

import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { AppIcon } from './AppIcon';
import { useMotion } from '../../hooks/preferences/useMotion';
import { cn } from '../utils/cn';
import type { IconName } from '../../core/design/icons';

export interface SegmentedItem<T extends string> {
    readonly value: T;
    readonly label: string;
    readonly icon?: IconName;
}

export interface SegmentedControlProps<T extends string> {
    items: ReadonlyArray<SegmentedItem<T>>;
    value: T;
    onChange: (value: T) => void;
    size?: 'sm' | 'md';
    className?: string;
    ariaLabel?: string;
}

export function SegmentedControl<T extends string>({
    items,
    value,
    onChange,
    size = 'md',
    className,
    ariaLabel,
}: SegmentedControlProps<T>) {
    const trackRef = useRef<HTMLDivElement | null>(null);
    const thumbRef = useRef<HTMLSpanElement | null>(null);
    const m = useMotion();

    const activeIndex = Math.max(0, items.findIndex((item) => item.value === value));

    useLayoutEffect(() => {
        const track = trackRef.current;
        const thumb = thumbRef.current;
        if (!track || !thumb) return;
        // 轨道有内边距，滑块要与内容区对齐：宽度按内容宽算，位置再加回内边距。
        const padding = size === 'sm' ? 2 : 3;
        const inner = Math.max(0, track.clientWidth - padding * 2);
        const width = inner / Math.max(1, items.length);
        const x = padding + width * activeIndex;
        if (!m.enabled) {
            gsap.set(thumb, { x, width });
            return;
        }
        gsap.to(thumb, {
            x,
            width,
            duration: m.duration('fast'),
            ease: m.ease.hover,
        });
    }, [activeIndex, items.length, m.enabled, m.duration, m.ease.hover, size]);

    const heightClass = size === 'sm' ? 'h-7 text-[12px]' : 'h-8 text-[12.5px]';
    const thumbInset = size === 'sm' ? 2 : 3;

    return (
        <div
            ref={trackRef}
            role="tablist"
            aria-label={ariaLabel}
            data-no-swipe
            className={cn('relative inline-flex select-none items-center rounded-md bg-inset p-[3px]', className)}
        >
            <span
                ref={thumbRef}
                aria-hidden
                className="pointer-events-none absolute rounded-sm bg-surface shadow-sm ring-1 ring-border-subtle"
                style={{ top: thumbInset, bottom: thumbInset, left: 0, width: 0 }}
            />
            {items.map((item) => {
                const selected = item.value === value;
                return (
                    <button
                        key={item.value}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => {
                            if (!selected) onChange(item.value);
                        }}
                        className={cn(
                            'relative z-10 inline-flex flex-1 items-center justify-center gap-1 whitespace-nowrap px-3 font-medium transition-colors',
                            heightClass,
                            selected ? 'text-text' : 'text-text-tertiary active:text-text-secondary',
                        )}
                    >
                        {item.icon ? <AppIcon name={item.icon} size={size === 'sm' ? 12 : 14} className={selected ? 'text-brand' : undefined} /> : null}
                        <span>{item.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

export default SegmentedControl;
