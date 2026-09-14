// 量一个 `data-tour` 目标在视口里的矩形，供引导遮罩开洞与气泡定位。
//
// 为什么要逐帧量：页面有过渡动画、列表滚动、软键盘顶起等会改布局；
// 只在挂载时量一次会让洞和气泡错位。逐帧读 `getBoundingClientRect` 成本很低
// （单元素），但只有值真的变了才 setState，避免每帧重渲染。

import { useEffect, useState } from 'react';

export interface TargetRect {
    readonly top: number;
    readonly left: number;
    readonly width: number;
    readonly height: number;
    readonly bottom: number;
    readonly right: number;
}

const EPSILON = 0.5;

function sameRect(a: TargetRect, b: TargetRect): boolean {
    return (
        Math.abs(a.top - b.top) < EPSILON &&
        Math.abs(a.left - b.left) < EPSILON &&
        Math.abs(a.width - b.width) < EPSILON &&
        Math.abs(a.height - b.height) < EPSILON
    );
}

/**
 * 持续跟踪选择器命中的元素位置；元素不存在时返回 null。
 * 首次找到且不在视口内时先 `scrollIntoView`（居中），下一帧再量。
 */
export function useTargetRect(selector: string | null): TargetRect | null {
    const [rect, setRect] = useState<TargetRect | null>(null);

    useEffect(() => {
        if (!selector) {
            setRect(null);
            return;
        }

        let frame = 0;
        let last: TargetRect | null = null;
        let recentered = false;

        const measure = () => {
            const element = document.querySelector(selector);
            if (!element) {
                if (last !== null) {
                    last = null;
                    setRect(null);
                }
                frame = requestAnimationFrame(measure);
                return;
            }

            const box = element.getBoundingClientRect();
            if (!recentered) {
                recentered = true;
                const outside = box.top < 0 || box.bottom > window.innerHeight;
                if (outside) {
                    element.scrollIntoView({ block: 'center', behavior: 'auto' });
                    frame = requestAnimationFrame(measure);
                    return;
                }
            }

            const next: TargetRect = {
                top: box.top,
                left: box.left,
                width: box.width,
                height: box.height,
                bottom: box.bottom,
                right: box.right,
            };
            if (!last || !sameRect(next, last)) {
                last = next;
                setRect(next);
            }
            frame = requestAnimationFrame(measure);
        };

        frame = requestAnimationFrame(measure);
        return () => cancelAnimationFrame(frame);
    }, [selector]);

    return rect;
}
