// 环形图（占比 / 结余构成）。
//
// 纯 SVG 自绘：不引入图表库，颜色与动效都走设计系统。
// 交互：点扇区可选（回调 key），选中项高亮、其余降透明。

import type { ReactNode } from 'react';
import { computeDonutArcs } from './geometry';
import { cn } from '../utils/cn';

export interface DonutChartSlice {
    readonly key: string;
    readonly label: string;
    readonly value: number;
    /** 任意 CSS 颜色（分类色 / 主题色）。 */
    readonly color: string;
}

export interface DonutChartProps {
    slices: ReadonlyArray<DonutChartSlice>;
    size?: number;
    thickness?: number;
    activeKey?: string | null;
    onSelect?: (key: string) => void;
    centerLabel?: ReactNode;
    centerValue?: ReactNode;
    emptyText?: string;
    className?: string;
}

export function DonutChart({
    slices,
    size = 180,
    thickness = 26,
    activeKey,
    onSelect,
    centerLabel,
    centerValue,
    emptyText = '暂无数据',
    className,
}: DonutChartProps) {
    const arcs = computeDonutArcs(
        slices.map((slice) => ({ key: slice.key, value: slice.value })),
        { size, thickness, gapDeg: 2 },
    );
    const colorOf = (key: string) => slices.find((slice) => slice.key === key)?.color ?? 'var(--brand-500)';
    const labelOf = (key: string) => slices.find((slice) => slice.key === key)?.label ?? '';

    if (arcs.length === 0) {
        return (
            <div
                className={cn('flex items-center justify-center rounded-full bg-inset/60 text-[12px] text-text-tertiary', className)}
                style={{ width: size, height: size }}
            >
                {emptyText}
            </div>
        );
    }

    return (
        <div
            className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
            style={{ width: size, height: size }}
        >
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="占比环形图">
                {arcs.map((arc) => {
                    const dimmed = activeKey != null && activeKey !== arc.key;
                    return (
                        <path
                            key={arc.key}
                            d={arc.path}
                            fill={colorOf(arc.key)}
                            className={cn(
                                'transition-opacity duration-200 ease-out',
                                dimmed ? 'opacity-30' : 'opacity-100',
                                onSelect && 'cursor-pointer',
                            )}
                            onClick={onSelect ? () => onSelect(arc.key) : undefined}
                        >
                            <title>{`${labelOf(arc.key)} ${(arc.percent * 100).toFixed(1)}%`}</title>
                        </path>
                    );
                })}
            </svg>
            {(centerLabel || centerValue) ? (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5">
                    {centerLabel ? <span className="text-[11px] text-text-tertiary">{centerLabel}</span> : null}
                    {centerValue ? <span className="font-display text-[16px] font-semibold leading-none text-text">{centerValue}</span> : null}
                </div>
            ) : null}
        </div>
    );
}

export default DonutChart;
