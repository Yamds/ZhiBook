// 底部导航 + 露头替身按钮的行为测试。
//
// 露头按钮是**纯装饰以外的可点入口**，所以三件事必须钉住：
//   1. 露的是当前页的对家（日历页露设置、设置页露日历），其它页两个都不露；
//   2. 缩回的那个块不能点、不进无障碍树（aria-hidden + tabIndex=-1）；
//   3. 栏内槽位的老语义没被破坏：设置页时第 3 槽位仍然是「设置」。

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AppScreen } from '../../../app/navigation';
import { BottomNav } from './BottomNav';

function renderNav(active: AppScreen) {
    const onSelect = vi.fn();
    const view = render(<BottomNav active={active} onSelect={onSelect} />);
    return { onSelect, ...view };
}

/** 露头块：栏内页签没有 aria-label，所以按 aria-label 查一定命中露头块。 */
function peek(container: HTMLElement, label: string): HTMLButtonElement {
    const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    if (!button) throw new Error(`露头块缺失：${label}`);
    return button;
}

function isPeeking(element: HTMLButtonElement): boolean {
    return element.getAttribute('aria-hidden') !== 'true' && !element.disabled && element.tabIndex === 0;
}

describe('BottomNav 露头替身', () => {
    it('日历页：栏内第 3 槽位仍是「日历」，上方露的是设置图标', () => {
        const { container } = renderNav('home');
        const nav = container.querySelector('nav');
        expect(nav).not.toBeNull();
        expect(within(nav as HTMLElement).getByText('日历')).toBeInTheDocument();
        expect(within(nav as HTMLElement).queryByText('设置')).toBeNull();

        expect(isPeeking(peek(container, '设置'))).toBe(true);
        expect(isPeeking(peek(container, '日历'))).toBe(false);
    });

    it('设置页：第 3 槽位换成「设置」，上方露的是日历图标', () => {
        const { container } = renderNav('settings');
        const nav = container.querySelector('nav');
        expect(within(nav as HTMLElement).getByText('设置')).toBeInTheDocument();
        expect(within(nav as HTMLElement).queryByText('日历')).toBeNull();

        expect(isPeeking(peek(container, '日历'))).toBe(true);
        expect(isPeeking(peek(container, '设置'))).toBe(false);
    });

    it('点露头块走的是同一套槽位语义', () => {
        const onHome = renderNav('home');
        fireEvent.click(peek(onHome.container, '设置'));
        expect(onHome.onSelect).toHaveBeenCalledWith('settings');

        const onSettings = renderNav('settings');
        fireEvent.click(peek(onSettings.container, '日历'));
        expect(onSettings.onSelect).toHaveBeenCalledWith('home');
    });

    it('其它页面：两个头都缩回栏后，点不到也读不到', () => {
        for (const screen of ['bills', 'details', 'add', 'assets'] as const) {
            const { container, unmount } = renderNav(screen);
            for (const label of ['设置', '日历']) {
                const button = container.querySelector<HTMLButtonElement>(
                    `button[aria-label="${label}"]`,
                );
                // 元素仍在 DOM 里（只统计），但不可点、不进无障碍树。
                expect(button).not.toBeNull();
                expect(button?.getAttribute('aria-hidden')).toBe('true');
                expect(button?.tabIndex).toBe(-1);
                expect(button?.className).toContain('pointer-events-none');
            }
            unmount();
        }
    });

    it('栏内页签点击仍按 id 上报', () => {
        const { container, onSelect } = renderNav('bills');
        const nav = container.querySelector('nav') as HTMLElement;
        fireEvent.click(within(nav).getByText('明细'));
        expect(onSelect).toHaveBeenCalledWith('details');
        fireEvent.click(within(nav).getByText('日历'));
        expect(onSelect).toHaveBeenCalledWith('home');
    });
});

describe('BottomNav 无障碍', () => {
    it('当前页签带 aria-current=page，且只有一个', () => {
        const { container } = renderNav('settings');
        const nav = container.querySelector('nav') as HTMLElement;
        const current = nav.querySelectorAll('button[aria-current="page"]');
        expect(current).toHaveLength(1);
        expect(current[0]?.textContent).toContain('设置');
    });

    it('露头块在露头时可以被无障碍树找到', () => {
        render(<BottomNav active="home" onSelect={() => undefined} />);
        expect(screen.getByRole('button', { name: '设置' })).toBeInTheDocument();
    });
});
