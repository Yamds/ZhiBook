// 记账数据 hooks 的统一出口。

export { ledgerInvalidation, ledgerKeys } from './queryKeys';
export {
    useBooks,
    useCreateBook,
    useCurrentBook,
    useDeleteBook,
    useSetCurrentBook,
    useUpdateBook,
} from './useLedgerBooks';
export {
    useCategories,
    useCategoryLookup,
    useCreateCategory,
    useHideCategory,
    useReorderCategories,
    useUpdateCategory,
    useVisibleCategories,
} from './useLedgerCategories';
export {
    groupTransactionsByDay,
    useCreateTransaction,
    useDeleteTransaction,
    useSearchTransactions,
    useTransaction,
    useTransactionsByDay,
    useTransactionsRange,
    useTransactionWindows,
    useUpdateTransaction,
} from './useLedgerTransactions';
export {
    useDaySummaries,
    useMonthShares,
    useMonthStats,
    usePeriodShares,
    useTransactionRanks,
    useYearSummary,
    useYearTransactionRanks,
} from './useLedgerStats';
export {
    useAccountGroups,
    useAccounts,
    useAssetsOverview,
    useCreateAccount,
    useDeleteAccount,
    useReorderAccounts,
    useUpdateAccount,
} from './useLedgerAssets';
export {
    useAttachmentData,
    useAttachments,
    useDeleteAttachment,
    useSaveAttachment,
} from './useLedgerAttachments';
