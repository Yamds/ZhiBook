// 添加入参（记账）的纯逻辑测试：分页、拖拽落点、排序。

import { describe, expect, it } from 'vitest';
import type { Category, EntryKind } from '../../core/ipc/types';
import {
    GRID_PAGE_SIZE,
    autoPageDirection,
    buildGridEntries,
    categoryIdsOf,
    describeError,
    dayDiff,
    dropIndexAt,
    moveItem,
    occurredAtMs,
    shortDateLabel,
    pageIndexFromScroll,
    paginate,
} from './addPage.logic';

function category(id: string, kind: EntryKind, sortOrder: number): Category {
    return {
        id,
        kind,
        name: id,
        iconName: 'mdi:shape-outline',
        color: 'theme',
        sortOrder,
        hidden: false,
        createdAtMs: 0,
        updatedAtMs: 0,
    };
}

describe('buildGridEntries', () => {
    it('只取当前组，并在末尾追加「+」卡位', () => {
        const list = [
            category('e1', 'expense', 0),
            category('i1', 'income', 0),
            category('e2', 'expense', 1),
        ];
        const entries = buildGridEntries(list, 'expense');
        expect(entries.map((entry) => (entry.type === 'add' ? '+' : entry.category.id))).toEqual([
            'e1',
            'e2',
            '+',
        ]);
    });

    it('可以不追加「+」（选择模式下不显示新建入口）', () => {
        const entries = buildGridEntries([category('e1', 'expense', 0)], 'expense', false);
        expect(entries).toHaveLength(1);
        expect(entries[0]?.type).toBe('category');
    });

    it('37 个支出分类 + 「+」= 38 项 → 4 页（最后一页 2 项）', () => {
        const list = Array.from({ length: 37 }, (_, index) =>
            category(`e${index}`, 'expense', index),
        );
        const pages = paginate(buildGridEntries(list, 'expense'));
        expect(pages).toHaveLength(4);
        expect(pages[0]).toHaveLength(GRID_PAGE_SIZE);
        expect(pages[3]).toHaveLength(2);
    });
});

describe('paginate', () => {
    it('刚好整除时不产生空页', () => {
        expect(paginate([1, 2, 3, 4], 2)).toEqual([
            [1, 2],
            [3, 4],
        ]);
    });

    it('空数组返回空页列表', () => {
        expect(paginate([], 12)).toEqual([]);
    });
});

describe('moveItem', () => {
    it('把元素移到目标位置，其余相对顺序不变', () => {
        expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
        expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
    });

    it('原地不动或越界时安全返回', () => {
        expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
        expect(moveItem(['a', 'b'], 0, 99)).toEqual(['b', 'a']);
        expect(moveItem([], 0, 3)).toEqual([]);
    });
});

describe('dropIndexAt', () => {
    const rect = { left: 0, top: 0, width: 400, height: 300 }; // 4 列 × 3 行 → 单元格 100×100

    it('按行列换算落点下标', () => {
        expect(dropIndexAt({ x: 10, y: 10 }, rect)).toBe(0);
        expect(dropIndexAt({ x: 350, y: 10 }, rect)).toBe(3);
        expect(dropIndexAt({ x: 10, y: 250 }, rect)).toBe(8);
        expect(dropIndexAt({ x: 399, y: 299 }, rect)).toBe(11);
    });

    it('拖到宫格外也能夹取到合理落点', () => {
        expect(dropIndexAt({ x: -80, y: -80 }, rect)).toBe(0);
        expect(dropIndexAt({ x: 900, y: 900 }, rect)).toBe(11);
    });

    it('有偏移的容器（非零 left/top）也正确', () => {
        const offset = { left: 16, top: 120, width: 400, height: 300 };
        expect(dropIndexAt({ x: 20, y: 130 }, offset)).toBe(0);
        expect(dropIndexAt({ x: 20, y: 130 + 210 }, offset)).toBe(8);
    });
});

describe('autoPageDirection', () => {
    const rect = { left: 0, top: 0, width: 400, height: 300 };

    it('靠近左右边缘时给出翻页方向', () => {
        expect(autoPageDirection({ x: 10 }, rect, 4)).toBe(-1);
        expect(autoPageDirection({ x: 395 }, rect, 4)).toBe(1);
        expect(autoPageDirection({ x: 200 }, rect, 4)).toBe(0);
    });

    it('只有一页时不翻页', () => {
        expect(autoPageDirection({ x: 0 }, rect, 1)).toBe(0);
    });
});

describe('pageIndexFromScroll', () => {
    it('四舍五入到最近一页并夹取范围', () => {
        expect(pageIndexFromScroll(0, 360, 4)).toBe(0);
        expect(pageIndexFromScroll(200, 360, 4)).toBe(1);
        expect(pageIndexFromScroll(-50, 360, 4)).toBe(0);
        expect(pageIndexFromScroll(5000, 360, 4)).toBe(3);
        expect(pageIndexFromScroll(100, 0, 4)).toBe(0);
    });
});

describe('categoryIdsOf', () => {
    it('忽略「+」卡位', () => {
        const entries = buildGridEntries(
            [category('e1', 'expense', 0), category('e2', 'expense', 1)],
            'expense',
        );
        expect(categoryIdsOf(entries)).toEqual(['e1', 'e2']);
    });
});

describe('occurredAtMs', () => {
    it('用选中日期 + 当前时钟组成时间戳', () => {
        const now = new Date(2025, 8, 13, 14, 32, 5, 0); // 2025-09-13 14:32:05
        const ms = occurredAtMs({ year: 2025, month: 9, day: 8 }, now);
        const date = new Date(ms);
        expect(date.getFullYear()).toBe(2025);
        expect(date.getMonth() + 1).toBe(9);
        expect(date.getDate()).toBe(8);
        expect(date.getHours()).toBe(14);
        expect(date.getMinutes()).toBe(32);
    });
});

describe('dayDiff / shortDateLabel', () => {
    const today = { year: 2025, month: 9, day: 13 };

    it('天数差按日历日算', () => {
        expect(dayDiff(today, today)).toBe(0);
        expect(dayDiff(today, { year: 2025, month: 9, day: 14 })).toBe(1);
        expect(dayDiff(today, { year: 2025, month: 9, day: 12 })).toBe(-1);
        expect(dayDiff(today, { year: 2025, month: 10, day: 1 })).toBe(18);
    });

    it('键盘日期键文案', () => {
        expect(shortDateLabel(today, today)).toBe('今天');
        expect(shortDateLabel({ year: 2025, month: 9, day: 14 }, today)).toBe('明天');
        expect(shortDateLabel({ year: 2025, month: 9, day: 12 }, today)).toBe('昨天');
        expect(shortDateLabel({ year: 2025, month: 8, day: 8 }, today)).toBe('08-08');
        expect(shortDateLabel({ year: 2024, month: 12, day: 31 }, today)).toBe('2024-12-31');
    });
});

describe('describeError', () => {
    it('Error / 字符串 / 其它都能给出文案', () => {
        expect(describeError(new Error('磁盘写入失败'))).toBe('磁盘写入失败');
        expect(describeError('校验失败：金额必须大于 0')).toBe('校验失败：金额必须大于 0');
        expect(describeError(undefined)).toBe('未知错误，请重试');
        expect(describeError('   ')).toBe('未知错误，请重试');
    });
});
