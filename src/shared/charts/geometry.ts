// 图表几何（纯函数，配单测）。
//
// 只做 SVG 坐标计算，不碰 React / DOM：弧形路径、折线取点、坐标轴取整都在这里，
// 组件层只负责把结果画出来。

export interface DonutSliceInput {
    readonly key: string;
    readonly value: number;
}

export interface DonutArc {
    readonly key: string;
    readonly startAngle: number;
    readonly endAngle: number;
    /** 0..1 */
    readonly percent: number;
    readonly path: string;
}

export interface DonutOptions {
    readonly size: number;
    readonly thickness: number;
    /** 相邻扇区之间的角度间隙（度）。 */
    readonly gapDeg?: number;
}

export interface PointGeometry {
    readonly x: number;
    readonly y: number;
}

/** 角度制：0° 在 12 点方向，顺时针为正。 */
export function polarPoint(cx: number, cy: number, radius: number, angleDeg: number): PointGeometry {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + radius * Math.sin(rad), y: cy - radius * Math.cos(rad) };
}

/** 环形扇区路径（外弧 → 内弧，闭合）。 */
export function donutArcPath(
    cx: number,
    cy: number,
    outerRadius: number,
    innerRadius: number,
    startAngle: number,
    endAngle: number,
): string {
    const sweep = endAngle - startAngle;
    const largeArc = sweep > 180 ? 1 : 0;
    const outerStart = polarPoint(cx, cy, outerRadius, startAngle);
    const outerEnd = polarPoint(cx, cy, outerRadius, endAngle);
    const innerEnd = polarPoint(cx, cy, innerRadius, endAngle);
    const innerStart = polarPoint(cx, cy, innerRadius, startAngle);
    return [
        `M ${outerStart.x.toFixed(3)} ${outerStart.y.toFixed(3)}`,
        `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x.toFixed(3)} ${outerEnd.y.toFixed(3)}`,
        `L ${innerEnd.x.toFixed(3)} ${innerEnd.y.toFixed(3)}`,
        `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x.toFixed(3)} ${innerStart.y.toFixed(3)}`,
        'Z',
    ].join(' ');
}

/**
 * 把「分类 → 金额」切成环形扇区。
 *
 * - 非正数 / 总和为 0 → 返回空数组（空态由组件处理）
 * - 单个扇区占满 100% 时收口到 359.99°，避免 SVG 画不出完整圆
 * - gapDeg 是每段之间留出的角度，段数 > 1 时才生效
 */
export function computeDonutArcs(items: readonly DonutSliceInput[], options: DonutOptions): DonutArc[] {
    const positive = items.filter((item) => item.value > 0);
    const total = positive.reduce((sum, item) => sum + item.value, 0);
    if (total <= 0 || positive.length === 0) return [];

    const { size, thickness, gapDeg = 0 } = options;
    const cx = size / 2;
    const cy = size / 2;
    const outerRadius = size / 2;
    const innerRadius = Math.max(0, outerRadius - thickness);
    const gap = positive.length > 1 ? Math.max(0, gapDeg) : 0;

    let cursor = 0;
    return positive.map((item) => {
        const percent = item.value / total;
        const sweep = Math.min(percent * 360, 359.99);
        const startAngle = cursor + gap / 2;
        const endAngle = cursor + sweep - gap / 2;
        cursor += percent * 360;
        return {
            key: item.key,
            startAngle,
            endAngle,
            percent,
            path: donutArcPath(cx, cy, outerRadius, innerRadius, startAngle, Math.max(startAngle + 0.5, endAngle)),
        };
    });
}

/** 坐标轴上限取整到 1 / 2 / 5 × 10^n。 */
export function niceCeil(value: number): number {
    if (!Number.isFinite(value) || value <= 0) return 0;
    const exponent = Math.floor(Math.log10(value));
    const base = 10 ** exponent;
    const normalized = value / base;
    const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return step * base;
}

export interface LineChartOptions {
    readonly width: number;
    readonly height: number;
    readonly paddingTop?: number;
    readonly paddingBottom?: number;
    readonly paddingX?: number;
}

/**
 * 折线取点：把一组数值映射到画布坐标。
 *
 * - min/max 由调用方给定（通常含 0 基线）
 * - 单点数据居中放置
 * - min === max 时取绘图区中线，避免除零
 */
export function buildLinePoints(
    values: readonly number[],
    options: LineChartOptions,
    min: number,
    max: number,
): PointGeometry[] {
    const { width, height, paddingTop = 12, paddingBottom = 12, paddingX = 0 } = options;
    if (values.length === 0) return [];
    const plotWidth = Math.max(1, width - paddingX * 2);
    const plotHeight = Math.max(1, height - paddingTop - paddingBottom);
    const span = max - min;
    return values.map((value, index) => {
        const x = values.length > 1
            ? paddingX + (index * plotWidth) / (values.length - 1)
            : width / 2;
        const ratio = span === 0 ? 0.5 : (value - min) / span;
        const y = paddingTop + (1 - ratio) * plotHeight;
        return { x, y };
    });
}

/** 单个数值 → y 坐标（与 buildLinePoints 同一套映射）。 */
export function valueToY(value: number, min: number, max: number, options: LineChartOptions): number {
    const { height, paddingTop = 12, paddingBottom = 12 } = options;
    const plotHeight = Math.max(1, height - paddingTop - paddingBottom);
    const span = max - min;
    const ratio = span === 0 ? 0.5 : (value - min) / span;
    return paddingTop + (1 - ratio) * plotHeight;
}

/** 折线路径（可选平滑留白由调用方决定，这里只做折线）。 */
export function buildPolylinePath(points: readonly PointGeometry[]): string {
    if (points.length === 0) return '';
    return points
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
        .join(' ');
}

/** 面积路径：折线 + 收到基线上形成闭合区域。 */
export function buildAreaPath(points: readonly PointGeometry[], baselineY: number): string {
    if (points.length === 0) return '';
    const first = points[0] as PointGeometry;
    const last = points[points.length - 1] as PointGeometry;
    return `${buildPolylinePath(points)} L ${last.x.toFixed(2)} ${baselineY.toFixed(2)} L ${first.x.toFixed(2)} ${baselineY.toFixed(2)} Z`;
}
