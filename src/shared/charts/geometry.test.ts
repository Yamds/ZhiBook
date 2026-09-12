import { describe, expect, it } from 'vitest';
import {
    buildAreaPath,
    buildLinePoints,
    buildPolylinePath,
    computeDonutArcs,
    donutArcPath,
    niceCeil,
    polarPoint,
} from './geometry';

describe('极坐标与弧路径', () => {
    it('0° 在 12 点，90° 在右侧', () => {
        const top = polarPoint(50, 50, 10, 0);
        expect(top.x).toBeCloseTo(50);
        expect(top.y).toBeCloseTo(40);
        const right = polarPoint(50, 50, 10, 90);
        expect(right.x).toBeCloseTo(60);
        expect(right.y).toBeCloseTo(50);
    });

    it('弧路径包含外弧（sweep=1）与内弧（sweep=0）', () => {
        const path = donutArcPath(50, 50, 40, 26, 0, 90);
        expect(path.startsWith('M ')).toBe(true);
        expect(path).toContain('A 40 40 0 0 1');
        expect(path).toContain('A 26 26 0 0 0');
        expect(path.endsWith('Z')).toBe(true);
    });
});

describe('环形图分片', () => {
    it('百分比之和为 100%，角度连续', () => {
        const arcs = computeDonutArcs(
            [
                { key: 'a', value: 50 },
                { key: 'b', value: 30 },
                { key: 'c', value: 20 },
            ],
            { size: 200, thickness: 30 },
        );
        expect(arcs).toHaveLength(3);
        expect(arcs.reduce((sum, arc) => sum + arc.percent, 0)).toBeCloseTo(1);
        expect(arcs[0]?.startAngle).toBeCloseTo(0);
        expect(arcs[2]?.endAngle).toBeCloseTo(359.99, 1);
    });

    it('忽略非正数与空数据', () => {
        expect(computeDonutArcs([], { size: 100, thickness: 10 })).toEqual([]);
        expect(computeDonutArcs([{ key: 'a', value: 0 }], { size: 100, thickness: 10 })).toEqual([]);
        const arcs = computeDonutArcs(
            [{ key: 'a', value: 0 }, { key: 'b', value: 10 }],
            { size: 100, thickness: 10 },
        );
        expect(arcs).toHaveLength(1);
        expect(arcs[0]?.percent).toBeCloseTo(1);
    });

    it('单条数据收口到 359.99°（SVG 画不出整圆）', () => {
        const arcs = computeDonutArcs([{ key: 'only', value: 5 }], { size: 100, thickness: 10 });
        const arc = arcs[0];
        expect(arc).toBeDefined();
        expect((arc?.endAngle ?? 0) - (arc?.startAngle ?? 0)).toBeLessThan(360);
        expect((arc?.endAngle ?? 0) - (arc?.startAngle ?? 0)).toBeGreaterThan(358);
    });

    it('间隙只在多段时生效', () => {
        const arcs = computeDonutArcs(
            [{ key: 'a', value: 1 }, { key: 'b', value: 1 }],
            { size: 100, thickness: 10, gapDeg: 4 },
        );
        expect(arcs[0]?.startAngle).toBeCloseTo(2);
        expect(arcs[1]?.startAngle).toBeCloseTo(182);
    });
});

describe('坐标轴取整', () => {
    it('取整到 1 / 2 / 5 × 10^n', () => {
        expect(niceCeil(1)).toBe(1);
        expect(niceCeil(1.5)).toBe(2);
        expect(niceCeil(3)).toBe(5);
        expect(niceCeil(12)).toBe(20);
        expect(niceCeil(750)).toBe(1000);
        expect(niceCeil(0)).toBe(0);
        expect(niceCeil(-5)).toBe(0);
    });
});

describe('折线取点', () => {
    it('min 落在底部，max 落在顶部', () => {
        const points = buildLinePoints([0, 50, 100], { width: 300, height: 120 }, 0, 100);
        expect(points[0]?.y).toBeCloseTo(108);
        expect(points[1]?.y).toBeCloseTo(60);
        expect(points[2]?.y).toBeCloseTo(12);
        expect(points[0]?.x).toBeCloseTo(0);
        expect(points[2]?.x).toBeCloseTo(300);
    });

    it('单点居中', () => {
        const points = buildLinePoints([42], { width: 300, height: 120 }, 0, 100);
        expect(points[0]?.x).toBe(150);
    });

    it('min === max 时取中线，不除零', () => {
        const points = buildLinePoints([7, 7], { width: 100, height: 100 }, 0, 0);
        expect(points.every((point) => Number.isFinite(point.y))).toBe(true);
    });

    it('空数据返回空数组', () => {
        expect(buildLinePoints([], { width: 100, height: 100 }, 0, 1)).toEqual([]);
    });
});

describe('路径拼接', () => {
    it('折线与面积路径', () => {
        const points = buildLinePoints([1, 2, 3], { width: 200, height: 100 }, 0, 3);
        const line = buildPolylinePath(points);
        expect(line.startsWith('M ')).toBe(true);
        expect(line.match(/L /g)).toHaveLength(2);
        const area = buildAreaPath(points, 100);
        expect(area.endsWith('Z')).toBe(true);
    });

    it('空点集返回空串', () => {
        expect(buildPolylinePath([])).toBe('');
        expect(buildAreaPath([], 10)).toBe('');
    });
});
