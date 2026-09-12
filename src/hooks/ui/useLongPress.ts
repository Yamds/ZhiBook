// 长按手势。
//
// 用途：分类宫格进入编辑模式、日历长按进明细、列表项长按出菜单。
// 规则与 BRD 3.8 对齐：
//   - 默认 500ms 触发；
//   - 触发前手指移动超过 8px 视为滑动 / 滚动，取消本次长按；
//   - 长按触发后紧跟着的那次 click 会被吞掉，避免"长按顺带选中"。

import { useCallback, useEffect, useRef } from 'react';

export interface UseLongPressOptions {
    onLongPress: () => void;
    onClick?: () => void;
    /** 触发阈值，默认 500ms。 */
    delayMs?: number;
    /** 位移容差，默认 8px。 */
    moveTolerancePx?: number;
}

export interface LongPressBindings {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerLeave: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
    onClick: (event: React.MouseEvent<HTMLElement>) => void;
    onContextMenu: (event: React.MouseEvent<HTMLElement>) => void;
}

export function useLongPress({
    onLongPress,
    onClick,
    delayMs = 500,
    moveTolerancePx = 8,
}: UseLongPressOptions): LongPressBindings {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const originRef = useRef<{ x: number; y: number } | null>(null);
    const triggeredRef = useRef(false);
    const suppressClickRef = useRef(false);

    const clearTimer = useCallback(() => {
        if (timerRef.current !== null) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    useEffect(() => clearTimer, [clearTimer]);

    const onPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
        // 只认主键 / 触摸；右键与多指不参与。
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        suppressClickRef.current = false;
        triggeredRef.current = false;
        originRef.current = { x: event.clientX, y: event.clientY };
        clearTimer();
        timerRef.current = setTimeout(() => {
            timerRef.current = null;
            triggeredRef.current = true;
            suppressClickRef.current = true;
            onLongPress();
        }, delayMs);
    }, [clearTimer, delayMs, onLongPress]);

    const onPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
        const origin = originRef.current;
        if (!origin || timerRef.current === null) return;
        const dx = Math.abs(event.clientX - origin.x);
        const dy = Math.abs(event.clientY - origin.y);
        if (dx > moveTolerancePx || dy > moveTolerancePx) {
            clearTimer();
        }
    }, [clearTimer, moveTolerancePx]);

    const onPointerUp = useCallback(() => {
        clearTimer();
        originRef.current = null;
    }, [clearTimer]);

    const onPointerCancel = useCallback(() => {
        clearTimer();
        originRef.current = null;
        triggeredRef.current = false;
        suppressClickRef.current = false;
    }, [clearTimer]);

    const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
        if (suppressClickRef.current) {
            suppressClickRef.current = false;
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        onClick?.();
    }, [onClick]);

    const onContextMenu = useCallback((event: React.MouseEvent<HTMLElement>) => {
        // 手机上长按会被浏览器当成右键菜单，这里统一压掉。
        event.preventDefault();
    }, []);

    return {
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerLeave: onPointerUp,
        onPointerCancel,
        onClick: handleClick,
        onContextMenu,
    };
}
