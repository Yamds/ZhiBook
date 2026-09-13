// 页面级返回键拦截。
//
// Android 返回键优先级（BRD 3.8）：**页面弹层 / 编辑模式** > 非首页回首页 > 首页退出确认。
// 壳（AppNext）只负责后两档；页面通过 `usePageBackHandler` 注册第一档：
// 返回 true = 这次返回键已被消费（例如关掉底部弹层、退出分类编辑模式）。
//
// 同一时刻只有一个页面在台前，但仍然做「身份校验后再清理」：
// 页面切换时新页面的注册不能被旧页面的 cleanup 覆盖。

import { useEffect, useRef } from 'react';

export type PageBackHandler = () => boolean;

let current: PageBackHandler | null = null;

export function setPageBackHandler(handler: PageBackHandler | null): void {
    current = handler;
}

export function getPageBackHandler(): PageBackHandler | null {
    return current;
}

/** 运行当前页面注册的拦截器；没有注册或未消费时返回 false。 */
export function runPageBackHandler(): boolean {
    if (!current) return false;
    try {
        return current();
    } catch {
        // 拦截器自身出错不能把返回键卡死，交回壳处理
        return false;
    }
}

/**
 * 注册页面级返回键拦截。
 *
 * @param handler 返回 true 表示已消费（壳不再继续处理）
 * @param active  传 false 时不注册（例如页面自己已经处理过弹层状态）
 */
export function usePageBackHandler(handler: PageBackHandler, active = true): void {
    const handlerRef = useRef(handler);
    handlerRef.current = handler;

    useEffect(() => {
        if (!active) return;
        const stable: PageBackHandler = () => handlerRef.current();
        setPageBackHandler(stable);
        return () => {
            if (getPageBackHandler() === stable) setPageBackHandler(null);
        };
    }, [active]);
}
