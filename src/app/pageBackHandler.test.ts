// 页面级返回键拦截测试。
//
// 壳的返回键优先级是「页面拦截 > 回首页 > 退出确认」；这里钉住拦截器的
// 注册 / 清理 / 消费语义，以及**页面切换时旧页面不能顶掉新页面**这条。

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
    getPageBackHandler,
    runPageBackHandler,
    setPageBackHandler,
    usePageBackHandler,
} from './pageBackHandler';

beforeEach(() => {
    setPageBackHandler(null);
});

describe('pageBackHandler', () => {
    it('没有注册时返回 false（交回壳处理）', () => {
        expect(runPageBackHandler()).toBe(false);
    });

    it('注册后按返回值判断是否消费', () => {
        setPageBackHandler(() => true);
        expect(runPageBackHandler()).toBe(true);
        setPageBackHandler(() => false);
        expect(runPageBackHandler()).toBe(false);
    });

    it('拦截器抛错时不把返回键卡死', () => {
        setPageBackHandler(() => {
            throw new Error('boom');
        });
        expect(runPageBackHandler()).toBe(false);
    });

    it('hook 卸载后清理注册', () => {
        const { unmount } = renderHook(({ active }) => usePageBackHandler(() => true, active), {
            initialProps: { active: true },
        });
        expect(getPageBackHandler()).not.toBeNull();
        unmount();
        expect(getPageBackHandler()).toBeNull();
    });

    it('hook 回调变化时始终调用最新的闭包', () => {
        let consumed = 0;
        const { rerender } = renderHook(
            ({ value }) => usePageBackHandler(() => {
                consumed = value;
                return true;
            }),
            { initialProps: { value: 1 } },
        );
        expect(runPageBackHandler()).toBe(true);
        expect(consumed).toBe(1);
        rerender({ value: 2 });
        expect(runPageBackHandler()).toBe(true);
        expect(consumed).toBe(2);
    });

    it('旧页面卸载不会顶掉新页面注册的拦截器', () => {
        const { unmount } = renderHook(({ active }) => usePageBackHandler(() => true, active), {
            initialProps: { active: true },
        });
        // 模拟「新页面先注册、旧页面后清理」的顺序
        const newcomer = () => false;
        setPageBackHandler(newcomer);
        unmount();
        expect(getPageBackHandler()).toBe(newcomer);
    });
});
