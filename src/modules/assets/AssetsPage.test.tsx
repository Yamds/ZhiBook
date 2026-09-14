// 资产页冒烟测试：净资产卡片、账户空态、总览展开、账本当前标记、账户编辑器可达。
//
// 数据走浏览器预览的只读替身（`ledger.mock.ts`：账本列表 = 默认账本，账户 / 资产全 0），
// 因此这里只验证「页面结构与交互开关」，数值口径由 `assetsPage.logic.test.ts` 覆盖。

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetsPage } from './AssetsPage';

function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <AssetsPage />
        </QueryClientProvider>,
    );
}

describe('AssetsPage', () => {
    beforeEach(() => {
        window.HTMLElement.prototype.scrollTo = vi.fn();
    });

    it('显示净资产卡片、账户空态与账本当前标记', async () => {
        renderPage();

        expect(await screen.findByText('净资产')).toBeTruthy();
        // 净资产 / 总资产 / 负债 都是 ¥ 0.00
        expect(screen.getAllByText('¥ 0.00').length).toBeGreaterThanOrEqual(3);
        expect(await screen.findByText('还没有账户哦')).toBeTruthy();
        expect(await screen.findByText('账本')).toBeTruthy();
        expect(screen.getByText('当前')).toBeTruthy();
    });

    it('点标题展开走势与口径切换，再点收起', async () => {
        renderPage();
        const toggle = (await screen.findByText('查看走势')).closest('button') as HTMLButtonElement;

        fireEvent.click(toggle);
        expect(screen.getByLabelText('走势口径')).toBeTruthy();
        expect(screen.getByText('总资产')).toBeTruthy();
        expect(screen.getByText('负债')).toBeTruthy();

        fireEvent.click(toggle);
        expect(screen.queryByLabelText('走势口径')).toBeNull();
    });

    it('点「新增账户」打开账户编辑器', async () => {
        renderPage();
        fireEvent.click(await screen.findByText('新增账户'));
        expect(await screen.findByLabelText('账户名称')).toBeTruthy();
        expect(screen.getByLabelText('账户类型')).toBeTruthy();
        expect(screen.getByLabelText('初始余额')).toBeTruthy();
    });
});
