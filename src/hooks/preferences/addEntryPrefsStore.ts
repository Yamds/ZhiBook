// 记账入口的「上次选择」记忆（纯前端，落 localStorage）。
//
// 需求（BRD）：
//   - FR-ADD-1：支出 / 收入两组**各自**记住上次选中的分类；
//   - FR-ADD-17：保存成功后保留分类与日期，便于连记同类多笔；
//   - FR-AST-9：账户选择「记住最近一次选择」以减少重复操作。
//
// 只存 id，不存实体：账本/分类被删除后这里可能指向不存在的 id，
// 页面侧一律「查不到就当未选中」，不需要在这里清理。

import { useSyncExternalStore } from 'react';
import type { EntryKind } from '../../core/ipc/types';

export interface AddEntryPrefs {
    /** 上次选中的分类 id（按收支分组各记一个）。 */
    readonly lastCategoryByKind: Readonly<Record<EntryKind, string | null>>;
    /** 上次选中的账户 id；null = 未指定账户。 */
    readonly lastAccountId: string | null;
}

const STORAGE_KEY = 'yamds-bill:add-entry:v1';

export const DEFAULT_ADD_ENTRY_PREFS: AddEntryPrefs = {
    lastCategoryByKind: { expense: null, income: null },
    lastAccountId: null,
};

let state: AddEntryPrefs = loadFromStorage();
const listeners = new Set<() => void>();

function loadFromStorage(): AddEntryPrefs {
    if (typeof window === 'undefined') return DEFAULT_ADD_ENTRY_PREFS;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_ADD_ENTRY_PREFS;
        const parsed = JSON.parse(raw) as Partial<AddEntryPrefs>;
        const byKind = (parsed.lastCategoryByKind ?? {}) as Partial<Record<EntryKind, unknown>>;
        return {
            lastCategoryByKind: {
                expense: typeof byKind.expense === 'string' ? byKind.expense : null,
                income: typeof byKind.income === 'string' ? byKind.income : null,
            },
            lastAccountId: typeof parsed.lastAccountId === 'string' ? parsed.lastAccountId : null,
        };
    } catch {
        // 解析失败 / 隐私模式：记忆丢失不影响记账
        return DEFAULT_ADD_ENTRY_PREFS;
    }
}

function persist(): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // 存储不可用就算了，不阻塞记账
    }
}

function emit(next: AddEntryPrefs): void {
    state = next;
    persist();
    for (const listener of listeners) listener();
}

export const addEntryPrefsStore = {
    getSnapshot(): AddEntryPrefs {
        return state;
    },

    subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },

    rememberCategory(kind: EntryKind, categoryId: string): void {
        if (state.lastCategoryByKind[kind] === categoryId) return;
        emit({
            ...state,
            lastCategoryByKind: { ...state.lastCategoryByKind, [kind]: categoryId },
        });
    },

    rememberAccount(accountId: string | null): void {
        if (state.lastAccountId === accountId) return;
        emit({ ...state, lastAccountId: accountId });
    },

    /** 测试 / dev 重置。 */
    _reset(): void {
        emit(DEFAULT_ADD_ENTRY_PREFS);
    },
};

export function useAddEntryPrefs(): AddEntryPrefs {
    return useSyncExternalStore(
        addEntryPrefsStore.subscribe,
        addEntryPrefsStore.getSnapshot,
        addEntryPrefsStore.getSnapshot,
    );
}
