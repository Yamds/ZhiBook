// 图表动效跟随 useMotion（BRD 3.6）：关闭动效后不能再挂 CSS 过渡，但内容要完整。

import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { preferencesStore } from '../../hooks/preferences/preferencesStore';
import { DisparityBar } from './DisparityBar';
import { DonutChart } from './DonutChart';

const SLICES = [{ key: 'a', label: '餐饮', value: 100, color: '#ff6b3d' }];

afterEach(() => {
    preferencesStore.reset();
});

describe('图表动效开关', () => {
    it('动效开启：进度条与扇区带过渡', () => {
        act(() => preferencesStore.setMotionEnabled(true));
        const bar = render(<DisparityBar label="总资产" valueCents={100} maxCents={200} tone="asset" />);
        expect(bar.container.innerHTML).toContain('transition-[width]');
        const donut = render(<DonutChart slices={SLICES} />);
        expect(donut.container.innerHTML).toContain('transition-opacity');
    });

    it('动效关闭：不挂过渡类，内容仍然完整', () => {
        act(() => preferencesStore.setMotionEnabled(false));
        const bar = render(<DisparityBar label="总资产" valueCents={100} maxCents={200} tone="asset" />);
        expect(bar.container.innerHTML).not.toContain('transition-[width]');
        expect(bar.container.textContent).toContain('总资产');
        const donut = render(<DonutChart slices={SLICES} />);
        expect(donut.container.innerHTML).not.toContain('transition-opacity');
        expect(donut.container.querySelector('path')).toBeTruthy();
    });
});
