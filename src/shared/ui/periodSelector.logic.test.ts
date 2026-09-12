import { describe, expect, it } from 'vitest';
import {
    centeredScrollLeft,
    nearestIndexFromViewport,
    nearestValue,
} from './periodSelector.logic';

describe('nearestValue', () => {
    it('取候选里最接近的值', () => {
        expect(nearestValue([1, 2, 3, 4], 3)).toBe(3);
        expect(nearestValue([5, 10, 15], 12)).toBe(10);
    });

    it('超出范围时夹到端点', () => {
        expect(nearestValue([5, 10, 15], 1)).toBe(5);
        expect(nearestValue([5, 10, 15], 99)).toBe(15);
    });

    it('空候选原样返回', () => {
        expect(nearestValue([], 7)).toBe(7);
    });
});

describe('centeredScrollLeft', () => {
    it('把 item 放到视口正中', () => {
        // item 在 200，宽 100，视口 300 → 200 - (300-100)/2 = 100
        expect(centeredScrollLeft(200, 100, 300)).toBe(100);
    });

    it('不允许负值', () => {
        expect(centeredScrollLeft(10, 100, 300)).toBe(0);
    });
});

describe('nearestIndexFromViewport', () => {
    it('取离视口中心最近的 item（含两端空槽）', () => {
        // 5 个 100 宽的槽：中心 50 / 150 / 250 / 350 / 450
        const centers = [50, 150, 250, 350, 450];
        expect(nearestIndexFromViewport(centers, 0, 300)).toBe(1);
        expect(nearestIndexFromViewport(centers, 100, 300)).toBe(2);
        expect(nearestIndexFromViewport(centers, 200, 300)).toBe(3);
        expect(nearestIndexFromViewport(centers, 300, 300)).toBe(4);
    });

    it('空列表返回 -1', () => {
        expect(nearestIndexFromViewport([], 0, 300)).toBe(-1);
    });
});
