// 横向滑动导航的仲裁层。
//
// 优先级：当前页面的「嵌套消费方」先处理（例如周期选择器、分类宫格的分页），
// 未被消费才交给壳做顶级页签切换。这样在同一屏内，页内滑动永远优先于页面滑动。
//
// 当前暂无注册方（P1 刚下线了设置页的「外观 ↔ 行为」页签）；
// P2 的周期选择器与 P4 的分类宫格会通过 `useNestedSwipe` 注册进来。

import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';

export type SwipeDirection = 'left' | 'right';

/** 返回 true 表示这次滑动已被消费，壳不再往下处理。 */
export type NestedSwipeHandler = (direction: SwipeDirection) => boolean;

interface SwipeContextValue {
    setNestedHandler: (handler: NestedSwipeHandler | null) => void;
}

const SwipeContext = createContext<SwipeContextValue | null>(null);

export function SwipeProvider({ value, children }: { value: SwipeContextValue; children: ReactNode }) {
    return <SwipeContext.Provider value={value}>{children}</SwipeContext.Provider>;
}

/// 页面注册自己的滑动消费逻辑。返回 false 表示"这一侧到头了"，交还外层。
export function useNestedSwipe(handler: NestedSwipeHandler): void {
    const ctx = useContext(SwipeContext);
    const handlerRef = useRef(handler);
    handlerRef.current = handler;

    useEffect(() => {
        if (!ctx) return;
        const stable: NestedSwipeHandler = (direction) => handlerRef.current(direction);
        ctx.setNestedHandler(stable);
        return () => ctx.setNestedHandler(null);
    }, [ctx]);
}

/// 在一组有序项里按方向取相邻项。返回 null 表示越界。
export function neighborOf<T>(items: ReadonlyArray<T>, current: T, direction: SwipeDirection): T | null {
    const index = items.indexOf(current);
    if (index < 0) return null;
    const next = direction === 'left' ? index + 1 : index - 1;
    return next >= 0 && next < items.length ? items[next] ?? null : null;
}
