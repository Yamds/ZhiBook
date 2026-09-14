// 首页接线测试：日历格子 → 添加页（点击）/ 明细页（长按）的跨页意图。
//
// 数据走浏览器预览的只读替身（`ledger.mock.ts`），只验证导航接线：
// 日期必须是**被点的那一天**（FR-HOME-5 / FR-HOME-6）。

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { navigationStore } from '../../app/navigationStore';
import { HomePage } from './HomePage';

function renderHome() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <HomePage />
        </QueryClientProvider>,
    );
}

/** 取一个当月格子（相邻月的格子 disabled 且没有 data-day-key 之外的语义）。 */
async function firstSelectableCell(): Promise<HTMLButtonElement> {
    const cells = await screen.findAllByRole('button', { name: /点一下记账/ });
    const cell = cells.find((item) => !(item as HTMLButtonElement).disabled);
    if (!cell) throw new Error('no selectable calendar cell');
    return cell as HTMLButtonElement;
}

describe('HomePage 日历跳转', () => {
    beforeEach(() => {
        navigationStore._reset();
    });
    afterEach(() => vi.useRealTimers());

    it('点击某天 → 进添加页并带上该天日期', async () => {
        renderHome();
        const cell = await firstSelectableCell();
        const dayKey = cell.dataset.dayKey;

        fireEvent.click(cell);

        const state = navigationStore.getSnapshot();
        expect(state.screen).toBe('add');
        expect(state.intent?.date).toBe(dayKey);
    });

    it('长按某天 → 进明细页并带上该天日期', async () => {
        renderHome();
        const cell = await firstSelectableCell();
        const dayKey = cell.dataset.dayKey;

        // 只在长按计时这一段用假时钟：在假时钟下 findBy* 的轮询会卡住。
        vi.useFakeTimers();
        fireEvent.pointerDown(cell, { clientX: 12, clientY: 12 });
        act(() => { vi.advanceTimersByTime(500); });
        vi.useRealTimers();

        const state = navigationStore.getSnapshot();
        expect(state.screen).toBe('details');
        expect(state.intent?.date).toBe(dayKey);
    });
});
