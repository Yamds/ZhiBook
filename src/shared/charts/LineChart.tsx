// 折线图（按日趋势 / 资产走势）。
//
// 纯净 SVG 自绘 + HTML 气泡：
//   - 画布宽度由容器实测（ResizeObserver），坐标就是像素，不做非等比缩放
//   - 支持负值：min 取 min(0, 最小值)，max 取 max(0, 最大值)，零线用虚线标出
//   - 点选：按下 / 拖动 / 悬停都会选最近的点，回调交给页面显示数值

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { buildAreaPath, buildLinePoints, buildPolylinePath, niceCeil, valueToY } from './geometry';
import { cn } from '../utils/cn';

export interface LineChartPoint {
    /** 唯一 key（如 day key）。 */
    readonly key: string;
    /** 横轴短标签（如 '05'）。 */
    readonly label: string;
    readonly value: number;
}

export interface LineChartProps {
    points: ReadonlyArray<LineChartPoint>;
    height?: number;
    formatValue?: (value: number) => string;
    activeIndex?: number | null;
    onActiveIndexChange?: (index: number | null) => void;
    emptyText?: string;
    className?: string;
}

const PADDING_TOP = 22;
const PADDING_BOTTOM = 20;
const PADDING_X = 2;

export function LineChart({
    points,
    height = 150,
    formatValue = (value) => String(value),
    activeIndex = null,
    onActiveIndexChange,
    emptyText = '暂无数据',
    className,
}: LineChartProps) {
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const [width, setWidth] = useState(320);

    useLayoutEffect(() => {
        const element = wrapRef.current;
        if (!element) return;
        const update = () => setWidth(Math.max(120, Math.round(element.clientWidth)));
        update();
        if (typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(update);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const options = useMemo(
        () => ({ width, height, paddingTop: PADDING_TOP, paddingBottom: PADDING_BOTTOM, paddingX: PADDING_X }),
        [width, height],
    );

    const values = useMemo(() => points.map((point) => point.value), [points]);
    const maxValue = values.length > 0 ? Math.max(0, ...values) : 0;
    const minValue = values.length > 0 ? Math.min(0, ...values) : 0;
    const axisMax = niceCeil(maxValue) || 1;
    const axisMin = -(niceCeil(Math.abs(minValue)) || 0);

    const geometry = useMemo(
        () => buildLinePoints(values, options, axisMin, axisMax),
        [axisMin, axisMax, options, values],
    );
    const zeroY = valueToY(0, axisMin, axisMax, options);

    const handlePointer = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
        if (!onActiveIndexChange || geometry.length === 0) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (rect.width === 0) return;
        const x = ((event.clientX - rect.left) / rect.width) * width;
        let bestIndex = 0;
        let bestDistance = Number.POSITIVE_INFINITY;
        geometry.forEach((point, index) => {
            const distance = Math.abs(point.x - x);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = index;
            }
        });
        onActiveIndexChange(bestIndex);
    }, [geometry, onActiveIndexChange, width]);

    const activePoint = activeIndex != null ? geometry[activeIndex] : undefined;
    const activeValue = activeIndex != null ? points[activeIndex]?.value : undefined;

    // 横轴只标少量刻度（最多 5 个），避免挤成一排。
    const labelIndices = useMemo(() => {
        const count = points.length;
        if (count <= 6) return points.map((_, index) => index);
        const step = Math.ceil(count / 5);
        const indices: number[] = [];
        for (let index = 0; index < count; index += step) indices.push(index);
        if (indices[indices.length - 1] !== count - 1) indices.push(count - 1);
        return indices;
    }, [points]);

    if (points.length === 0) {
        return (
            <div className={cn('flex h-[150px] items-center justify-center text-[12px] text-text-tertiary', className)}>
                {emptyText}
            </div>
        );
    }

    return (
        <div ref={wrapRef} className={cn('relative w-full', className)} style={{ height }}>
            <svg
                width={width}
                height={height}
                viewBox={`0 0 ${width} ${height}`}
                role="img"
                aria-label="趋势折线图"
                className="touch-none"
                onPointerDown={handlePointer}
                onPointerMove={handlePointer}
            >
                {/* 零轴 / 基线 */}
                <line
                    x1={0}
                    x2={width}
                    y1={zeroY}
                    y2={zeroY}
                    className="stroke-border-strong/70"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                />
                <line
                    x1={0}
                    x2={width}
                    y1={height - PADDING_BOTTOM + 0.5}
                    y2={height - PADDING_BOTTOM + 0.5}
                    className="stroke-border-subtle"
                    strokeWidth={1}
                />

                {/* 面积 */}
                <path d={buildAreaPath(geometry, zeroY)} className="fill-brand/12" />
                {/* 折线 */}
                <path
                    d={buildPolylinePath(geometry)}
                    fill="none"
                    className="stroke-brand"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                {/* 数据点 */}
                {geometry.map((point, index) => (
                    <circle
                        key={points[index]?.key ?? index}
                        cx={point.x}
                        cy={point.y}
                        r={index === activeIndex ? 3.5 : 1.8}
                        className={index === activeIndex ? 'fill-brand' : 'fill-brand/55'}
                    />
                ))}
                {/* 横轴刻度 */}
                {labelIndices.map((index) => {
                    const point = geometry[index];
                    const label = points[index]?.label;
                    if (!point || label === undefined) return null;
                    return (
                        <text
                            key={`label-${points[index]?.key ?? index}`}
                            x={Math.min(Math.max(point.x, 10), width - 10)}
                            y={height - 6}
                            textAnchor="middle"
                            className="fill-text-tertiary text-[9px]"
                        >
                            {label}
                        </text>
                    );
                })}
            </svg>

            {/* 选点气泡 */}
            {activePoint && activeValue !== undefined ? (
                <div
                    className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full pb-1.5"
                    style={{ left: activePoint.x, top: activePoint.y }}
                >
                    <div className="whitespace-nowrap rounded-sm bg-brand px-2 py-0.5 text-[11px] font-semibold text-white shadow-popover">
                        {formatValue(activeValue)}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

export default LineChart;
