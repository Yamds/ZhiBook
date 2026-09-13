// 离线双集合注册回归：两个子集（mdi / simple-icons）任一没注册，这里都会渲染出空 svg。

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppIcon } from './AppIcon';

describe('AppIcon 离线图标集', () => {
    it('mdi 图标渲染出 svg 内容', () => {
        const { container } = render(<AppIcon name="mdi:noodles" size={20} />);
        const svg = container.querySelector('svg');
        expect(svg).toBeTruthy();
        expect(svg?.querySelector('path, g, circle')).toBeTruthy();
    });

    it('simple-icons 支付品牌图标渲染出 svg 内容', () => {
        const { container } = render(<AppIcon name="simple-icons:alipay" size={20} />);
        const svg = container.querySelector('svg');
        expect(svg).toBeTruthy();
        expect(svg?.querySelector('path, g, circle')).toBeTruthy();
    });
});
