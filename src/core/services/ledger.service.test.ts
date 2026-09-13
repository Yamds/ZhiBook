// 记账服务层测试：命令名与参数名必须与 Rust `#[tauri::command]` 完全对齐。
//
// 这里把 transport 换成假的 invoke，只断言「发了哪条命令、带了哪些参数」，
// 从而在纯前端单测里钉住 IPC 契约（Rust 侧的聚合语义由 cargo test 覆盖）。

import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('../ipc/transport', () => ({
    isTauri: true,
    invoke: vi.fn(() => Promise.resolve({})),
}));

import { invoke } from '../ipc/transport';
import { DEFAULT_TREND_MONTHS, ledgerService } from './ledger.service';

const invokeMock = invoke as unknown as Mock;

/** 取出最后一次调用的 [command, args]。 */
function lastCall(): [string, Record<string, unknown>] {
    const call = invokeMock.mock.calls.at(-1);
    if (!call) throw new Error('没有发生 IPC 调用');
    return [call[0] as string, (call[1] ?? {}) as Record<string, unknown>];
}

beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({});
});

describe('ledgerService 命令契约', () => {
    it('账本：命令名与参数', async () => {
        await ledgerService.listBooks();
        expect(lastCall()).toEqual(['list_books', {}]);

        await ledgerService.getCurrentBook();
        expect(lastCall()).toEqual(['get_current_book', {}]);

        await ledgerService.createBook({ name: '旅行账' });
        expect(lastCall()).toEqual(['create_book', { input: { name: '旅行账' } }]);

        await ledgerService.updateBook({ id: 'book_1', name: '日常账' });
        expect(lastCall()).toEqual(['update_book', { input: { id: 'book_1', name: '日常账' } }]);

        await ledgerService.deleteBook('book_1');
        expect(lastCall()).toEqual(['delete_book', { id: 'book_1' }]);

        await ledgerService.setCurrentBook('book_1');
        expect(lastCall()).toEqual(['set_current_book', { id: 'book_1' }]);
    });

    it('账户：余额查询带 untilDay；排序用 ids 数组', async () => {
        await ledgerService.listAccounts('book_1', '2025-09-08');
        expect(lastCall()).toEqual([
            'list_accounts',
            { bookId: 'book_1', untilDay: '2025-09-08' },
        ]);

        await ledgerService.createAccount({
            bookId: 'book_1',
            kind: 'asset',
            name: '现金',
            iconName: 'mdi:cash',
            color: 'theme',
            initialBalanceCents: 0,
        });
        expect(lastCall()[0]).toBe('create_account');

        await ledgerService.updateAccount({
            id: 'acc_1',
            kind: 'liability',
            name: '信用卡',
            iconName: 'mdi:credit-card',
            color: 'theme',
            initialBalanceCents: 100,
        });
        expect(lastCall()[0]).toBe('update_account');

        await ledgerService.deleteAccount('acc_1');
        expect(lastCall()).toEqual(['delete_account', { id: 'acc_1' }]);

        await ledgerService.reorderAccounts('book_1', ['acc_2', 'acc_1']);
        expect(lastCall()).toEqual([
            'reorder_accounts',
            { bookId: 'book_1', input: { ids: ['acc_2', 'acc_1'] } },
        ]);
    });

    it('分类：默认只取可见分类；隐藏走 hide_category；排序带 kind', async () => {
        await ledgerService.listCategories();
        expect(lastCall()).toEqual(['list_categories', { includeHidden: false }]);

        await ledgerService.listCategories(true);
        expect(lastCall()).toEqual(['list_categories', { includeHidden: true }]);

        await ledgerService.hideCategory('cat_1');
        expect(lastCall()).toEqual(['hide_category', { id: 'cat_1' }]);

        await ledgerService.reorderCategories('expense', ['cat_2', 'cat_1']);
        expect(lastCall()).toEqual([
            'reorder_categories',
            { kind: 'expense', input: { ids: ['cat_2', 'cat_1'] } },
        ]);
    });

    it('账单：按天 / 区间 / 单条与增删改', async () => {
        await ledgerService.listTransactionsByDay('book_1', '2025-09-08');
        expect(lastCall()).toEqual([
            'list_transactions_by_day',
            { bookId: 'book_1', day: '2025-09-08' },
        ]);

        await ledgerService.listTransactionsRange('book_1', '2025-09-01', '2025-09-08');
        expect(lastCall()).toEqual([
            'list_transactions_range',
            { bookId: 'book_1', fromDay: '2025-09-01', toDay: '2025-09-08', limit: 50 },
        ]);

        await ledgerService.getTransaction('tx_1');
        expect(lastCall()).toEqual(['get_transaction', { id: 'tx_1' }]);

        await ledgerService.searchTransactions('book_1', '早餐');
        expect(lastCall()).toEqual([
            'search_transactions',
            { bookId: 'book_1', keyword: '早餐', limit: 200 },
        ]);

        await ledgerService.deleteTransaction('tx_1');
        expect(lastCall()).toEqual(['delete_transaction', { id: 'tx_1' }]);
    });

    it('统计：月份 / 年度 / 占比 / 排行 / 日汇总 / 资产', async () => {
        await ledgerService.getMonthStats('book_1', '2025-09');
        expect(lastCall()).toEqual(['get_month_stats', { bookId: 'book_1', month: '2025-09' }]);

        await ledgerService.getYearSummary('book_1', 2025);
        expect(lastCall()).toEqual(['get_year_summary', { bookId: 'book_1', year: 2025 }]);

        await ledgerService.getMonthShares('book_1', '2025-09');
        expect(lastCall()).toEqual(['get_month_shares', { bookId: 'book_1', month: '2025-09' }]);

        await ledgerService.getPeriodShares('book_1', '2025-09');
        expect(lastCall()).toEqual([
            'get_period_shares',
            { bookId: 'book_1', endMonth: '2025-09', months: DEFAULT_TREND_MONTHS },
        ]);

        await ledgerService.getTransactionRanks('book_1', '2025-09', 'expense', 5);
        expect(lastCall()).toEqual([
            'get_transaction_ranks',
            { bookId: 'book_1', month: '2025-09', kind: 'expense', limit: 5 },
        ]);

        await ledgerService.getYearTransactionRanks('book_1', 2025, 'balance', 5);
        expect(lastCall()).toEqual([
            'get_year_transaction_ranks',
            { bookId: 'book_1', year: 2025, kind: 'balance', limit: 5 },
        ]);

        await ledgerService.listDaySummaries('book_1', '2025-09');
        expect(lastCall()).toEqual(['list_day_summaries', { bookId: 'book_1', month: '2025-09' }]);

        await ledgerService.getAssetsOverview('book_1', '2025-09-08');
        expect(lastCall()).toEqual([
            'get_assets_overview',
            { bookId: 'book_1', untilDay: '2025-09-08', months: DEFAULT_TREND_MONTHS },
        ]);
    });

    it('附件：列表 / 保存 / 读取 / 删除', async () => {
        await ledgerService.listAttachments('tx_1');
        expect(lastCall()).toEqual(['list_attachments', { transactionId: 'tx_1' }]);

        await ledgerService.saveAttachment({
            transactionId: 'tx_1',
            mime: 'image/jpeg',
            base64: 'AAAA',
        });
        expect(lastCall()).toEqual([
            'save_attachment',
            { input: { transactionId: 'tx_1', mime: 'image/jpeg', base64: 'AAAA' } },
        ]);

        await ledgerService.readAttachment('att_1');
        expect(lastCall()).toEqual(['read_attachment', { id: 'att_1' }]);

        await ledgerService.deleteAttachment('att_1');
        expect(lastCall()).toEqual(['delete_attachment', { id: 'att_1' }]);
    });

    it('所有命令名都是 snake_case（与 Rust 命令注册一致）', async () => {
        await Promise.all([
            ledgerService.listBooks(),
            ledgerService.listCategories(),
            ledgerService.getMonthStats('book_1', '2025-09'),
            ledgerService.getAssetsOverview('book_1', '2025-09-08'),
        ]);
        const names = invokeMock.mock.calls.map((call) => call[0] as string);
        expect(names.length).toBeGreaterThan(0);
        for (const name of names) {
            expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
        }
    });
});
