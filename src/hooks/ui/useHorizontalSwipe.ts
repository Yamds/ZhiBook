// 横向滑动识别。
//
// 规则：
//   - 只认单指；第二根手指落下（双指缩放）立即放弃本次手势
//   - 先锁轴：横向位移大于纵向才判为横向滑动，纵向意图完全让给页面滚动
//   - 起点落在可横向滚动容器内（例如设置页的页签条）时忽略，避免和容器抢手势
//   - 元素带 data-no-swipe 时忽略
//   - 横向位移超过阈值才触发，避免和点击 / 长按打架

import { useEffect, useRef, type RefObject } from 'react';
import type { SwipeDirection } from '../../app/swipeNavigation';

const AXIS_LOCK_PX = 12;
const MIN_SWIPE_PX = 64;

function startsInsideHorizontalScroller(node: EventTarget | null): boolean {
    let el = node instanceof Element ? node : null;
    while (el && el !== document.body) {
        if (el.hasAttribute('data-no-swipe')) return true;
        const style = getComputedStyle(el);
        if (
            style.overflowX === 'auto' ||
            style.overflowX === 'scroll'
        ) {
            if (el.scrollWidth > el.clientWidth + 4) return true;
            // overflow-x 滚动但当前不溢出：仍视为可横滑容器，标记它
            if (el.hasAttribute('data-swipe-scroll')) return true;
        }
        el = el.parentElement;
    }
    return false;
}

export function useHorizontalSwipe(
    targetRef: RefObject<HTMLElement | null>,
    onSwipe: (direction: SwipeDirection) => void,
    enabled = true,
): void {
    const onSwipeRef = useRef(onSwipe);
    onSwipeRef.current = onSwipe;

    useEffect(() => {
        const el = targetRef.current;
        if (!el || !enabled) return;

        let startX = 0;
        let startY = 0;
        let tracking = false;
        let locked: 'h' | 'v' | null = null;

        const reset = () => {
            tracking = false;
            locked = null;
        };

        const onTouchStart = (event: TouchEvent) => {
            if (event.touches.length !== 1) {
                reset();
                return;
            }
            const touch = event.touches[0];
            if (!touch || startsInsideHorizontalScroller(event.target)) {
                reset();
                return;
            }
            startX = touch.clientX;
            startY = touch.clientY;
            tracking = true;
            locked = null;
        };

        const onTouchMove = (event: TouchEvent) => {
            if (!tracking || locked) return;
            // 第二根手指落下 → 这是缩放，不是滑动。
            if (event.touches.length !== 1) {
                reset();
                return;
            }
            const touch = event.touches[0];
            if (!touch) return;
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;
            if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
            locked = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
        };

        const onTouchEnd = (event: TouchEvent) => {
            const horizontal = locked === 'h';
            const touch = event.changedTouches[0];
            reset();
            if (!horizontal || !touch) return;
            const dx = touch.clientX - startX;
            if (Math.abs(dx) < MIN_SWIPE_PX) return;
            onSwipeRef.current(dx < 0 ? 'left' : 'right');
        };

        el.addEventListener('touchstart', onTouchStart, { passive: true });
        el.addEventListener('touchmove', onTouchMove, { passive: true });
        el.addEventListener('touchend', onTouchEnd, { passive: true });
        el.addEventListener('touchcancel', reset, { passive: true });
        return () => {
            el.removeEventListener('touchstart', onTouchStart);
            el.removeEventListener('touchmove', onTouchMove);
            el.removeEventListener('touchend', onTouchEnd);
            el.removeEventListener('touchcancel', reset);
        };
    }, [targetRef, enabled]);
}
