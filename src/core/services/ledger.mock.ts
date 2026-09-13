// 浏览器预览用的记账数据替身。
//
// 目标只有一个：在非 Tauri 环境（`pnpm run dev` 的浏览器预览）下让页面不崩。
// 读操作返回**空数据**（页面走空态分支），写操作直接抛错——记账数据的真实验证
// 一律在 Android 设备/模拟器上做（见 README「安卓」一节）。
//
// 命令名字符串只出现在 `src/core/services/**`，这里同样留在 services 目录内。

import type { AssetsOverview, Book, MonthStats, ShareBreakdown } from '../ipc/types';

export const MOCK_CURRENT_BOOK_ID = 'book_default';

const mockBook: Book = {
    id: MOCK_CURRENT_BOOK_ID,
    name: '默认账本',
    createdAtMs: 0,
    sortOrder: 0,
};

function emptyMonthStats(month: string): MonthStats {
    const empty = {
        totalCents: 0,
        count: 0,
        maxDayCents: 0,
        maxDay: null,
        dailyAverageCents: 0,
        daily: [],
    };
    return {
        month,
        days: 0,
        expense: { ...empty },
        income: { ...empty },
        balance: { ...empty },
    };
}

const EMPTY_SHARE_SET = { totalCents: 0, count: 0, items: [], all: [] };
const EMPTY_BREAKDOWN: ShareBreakdown = {
    expense: { ...EMPTY_SHARE_SET },
    income: { ...EMPTY_SHARE_SET },
    balance: { ...EMPTY_SHARE_SET },
};

function writeBlocked(): never {
    throw new Error('浏览器预览不写入记账数据，请在 Android 设备上验证');
}

/** 浏览器预览用的只读替身。 */
export function ledgerMockCall<T>(command: string, args: Record<string, unknown>): T {
    switch (command) {
        case 'list_books':
            return [mockBook] as unknown as T;
        case 'get_current_book':
            return MOCK_CURRENT_BOOK_ID as unknown as T;
        case 'list_categories':
        case 'list_accounts':
        case 'list_transactions_by_day':
        case 'list_transactions_range':
        case 'search_transactions':
        case 'list_attachments':
        case 'list_day_summaries':
        case 'get_transaction_ranks':
            return [] as unknown as T;
        case 'get_transaction':
            return null as unknown as T;
        case 'get_month_stats':
            return emptyMonthStats(String(args.month ?? '')) as unknown as T;
        case 'get_year_summary':
            return {
                year: Number(args.year ?? 0),
                expenseCents: 0,
                incomeCents: 0,
                balanceCents: 0,
                months: [],
            } as unknown as T;
        case 'get_month_shares':
        case 'get_period_shares':
            return EMPTY_BREAKDOWN as unknown as T;
        case 'get_assets_overview':
            return {
                totalAssetCents: 0,
                liabilityCents: 0,
                netCents: 0,
                trend: [],
            } satisfies AssetsOverview as unknown as T;
        default:
            return writeBlocked();
    }
}
