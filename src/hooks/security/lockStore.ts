// 应用锁状态（模块级单例）：是否设置了密码 + 当前是否锁定。
//
// 放在模块级而不是 React Context：启动闸门（AppBootGate）与设置页都要读写，
// 且「回前台重新锁定」发生在文档可见性回调里（非 React 上下文）。

import { createStore } from '../utils/createStore';

export interface LockState {
    /** 是否设置了密码。 */
    configured: boolean;
    /** 是否处于锁定态。 */
    locked: boolean;
}

const store = createStore<LockState>({ configured: false, locked: false });

export const lockStore = {
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,

    /**
     * 写入「是否设置密码」。
     *
     * `locked` 默认跟随 `configured`：启动时若已设置密码就锁定；
     * 用户刚设置完密码时调用方传 `false`，避免立刻把自己锁在外面。
     */
    setConfigured(configured: boolean, locked = configured): void {
        const current = store.getSnapshot();
        if (current.configured === configured && current.locked === locked) return;
        store.setState({ configured, locked });
    },

    lock(): void {
        const current = store.getSnapshot();
        if (!current.configured || current.locked) return;
        store.setState({ ...current, locked: true });
    },

    unlock(): void {
        const current = store.getSnapshot();
        if (!current.locked) return;
        store.setState({ ...current, locked: false });
    },

    _reset: store._reset,
};
