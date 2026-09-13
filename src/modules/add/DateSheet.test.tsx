// 日期选择弹层（FR-ADD-15）：**允许选择未来日期**（BRD 3.3：默认今天，不做未来限制）。
//
// 真机反馈过「选不了大于今天的日期」，定位结果是：限制来自年份选择器上限与日历里
// 相邻月格子不可点，`DateSheet` 本身没有上限。这里把它钉住，防止以后被误加限制。

import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DateSheet } from './DateSheet';

function renderSheet(value = { year: 2025, month: 9, day: 13 }) {
    const onSelect = vi.fn();
    render(
        <DateSheet open onOpenChange={() => {}} value={value} onSelect={onSelect} />,
    );
    return onSelect;
}

/** 弹层走 Radix Portal，内容挂在 document.body 上。 */
function dayButton(text: string): HTMLButtonElement {
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
        (item) => item.textContent?.trim() === text,
    );
    if (!button) throw new Error(`missing day button: ${text}`);
    return button;
}

describe('DateSheet（日期选择）', () => {
    it('点下个月后，能选中未来日期', () => {
        const onSelect = renderSheet();
        fireEvent.click(document.querySelector<HTMLButtonElement>('button[aria-label="下个月"]')!);
        fireEvent.click(dayButton('20'));
        expect(onSelect).toHaveBeenCalledWith({ year: 2025, month: 10, day: 20 });
    });

    it('同月内的未来日期也能直接选中', () => {
        const onSelect = renderSheet();
        fireEvent.click(dayButton('28'));
        expect(onSelect).toHaveBeenCalledWith({ year: 2025, month: 9, day: 28 });
    });

    it('跨年后仍可继续翻月（12 月 → 次年 1 月）', () => {
        const onSelect = renderSheet({ year: 2025, month: 12, day: 31 });
        fireEvent.click(document.querySelector<HTMLButtonElement>('button[aria-label="下个月"]')!);
        expect(document.body.textContent).toContain('2026 年 1 月');
        fireEvent.click(dayButton('5'));
        expect(onSelect).toHaveBeenCalledWith({ year: 2026, month: 1, day: 5 });
    });
});
