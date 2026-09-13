// Toast 式 InfoBar 的行为测试：标题 / 补充说明、自动消失、关闭按钮的出现时机。
//
// 注意：节点初始是 `visibility: hidden`，等 GsapPresence 跑完进场动画（jsdom 里动画
// 不会推进）才可见，所以「关闭按钮」用 DOM 查询而不是 `ByRole`（后者对不可见节点
// 算不出可访问名称）。

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InfoBar } from './InfoBar';

const CLOSE_SELECTOR = 'button[aria-label="关闭"]';

describe('InfoBar', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('渲染标题与补充说明', () => {
        render(<InfoBar title="已记一笔" content="含 2 张图片" tone="success" />);
        expect(screen.getByText('已记一笔')).toBeTruthy();
        expect(screen.getByText('含 2 张图片')).toBeTruthy();
    });

    it('会自动消失的提示不给关闭按钮（安卓 Toast 式）', () => {
        const { container } = render(<InfoBar title="已记一笔" autoDismissMs={2000} />);
        expect(container.querySelector(CLOSE_SELECTOR)).toBeNull();
    });

    it('常驻提示（danger / 不自动关）才给关闭按钮，点了会回调', () => {
        const onDismiss = vi.fn();
        const { container } = render(
            <InfoBar title="保存失败" tone="danger" onDismiss={onDismiss} />,
        );
        const close = container.querySelector<HTMLButtonElement>(CLOSE_SELECTOR);
        expect(close).not.toBeNull();
        fireEvent.click(close as HTMLButtonElement);
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('到时间后调用 onAutoDismiss', () => {
        const onAutoDismiss = vi.fn();
        render(<InfoBar title="已记一笔" autoDismissMs={1500} onAutoDismiss={onAutoDismiss} />);
        act(() => vi.advanceTimersByTime(1499));
        expect(onAutoDismiss).not.toHaveBeenCalled();
        act(() => vi.advanceTimersByTime(1));
        expect(onAutoDismiss).toHaveBeenCalledTimes(1);
    });

    it('autoDismissMs 为 0 时不自动消失', () => {
        const onAutoDismiss = vi.fn();
        render(<InfoBar title="常驻" autoDismissMs={0} onAutoDismiss={onAutoDismiss} />);
        act(() => vi.advanceTimersByTime(60_000));
        expect(onAutoDismiss).not.toHaveBeenCalled();
    });
});
