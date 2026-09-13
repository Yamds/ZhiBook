// 值的防抖（搜索输入用）。
//
// 只延迟「值的传播」，不改变调用方的状态：输入框保持受控（每次按键都更新），
// 真正触发查询的是防抖后的值——避免每个字都打一次 IPC。

import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs = 250): T {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timer = window.setTimeout(() => setDebounced(value), Math.max(0, delayMs));
        return () => window.clearTimeout(timer);
    }, [value, delayMs]);

    return debounced;
}

export default useDebouncedValue;
