// 抽屉侧栏：手机端承载「全部功能」。
//
// 抽屉内部直接复用 Sidebar，因此视觉、FLIP 指示器、MotionIcon 与桌面完全同源；
// 抽屉只负责进出场动画、遮罩、触摸手势与可访问性。

import React, { useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { cn } from '../../utils/cn';
import { Sidebar } from './Sidebar';
import { useMotion } from '../../../hooks/preferences/useMotion';
import type { AppRoute } from '../../../app/navigation';

const PANEL_WIDTH = 256;
/** 手指横向拖动超过该比例就判定为关闭。 */
const CLOSE_DRAG_RATIO = 0.35;

export const AppDrawer: React.FC<{
    open: boolean;
    onClose: () => void;
    active: AppRoute;
    onChange: (route: AppRoute) => void;
}> = ({ open, onClose, active, onChange }) => {
    const motion = useMotion();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const overlayRef = useRef<HTMLDivElement | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const dragStateRef = useRef<{ startX: number; startY: number; dragging: boolean } | null>(null);
    const [dragging, setDragging] = useState(false);

    // 进出场。
    useEffect(() => {
        const container = containerRef.current;
        const panel = panelRef.current;
        const overlay = overlayRef.current;
        if (!container || !panel || !overlay) return;

        gsap.killTweensOf([panel, overlay]);

        if (open) {
            gsap.set(container, { pointerEvents: 'auto' });
            gsap.set([panel, overlay], { visibility: 'visible' });
            if (!motion.enabled) {
                gsap.set(panel, { x: 0 });
                gsap.set(overlay, { autoAlpha: 1 });
                return;
            }
            gsap.to(panel, { x: 0, duration: motion.duration('slow'), ease: motion.ease.enter });
            gsap.to(overlay, { autoAlpha: 1, duration: motion.duration('slow'), ease: motion.ease.enter });
            return;
        }

        gsap.set(container, { pointerEvents: 'none' });
        if (!motion.enabled) {
            gsap.set(panel, { x: -PANEL_WIDTH, autoAlpha: 1, visibility: 'hidden' });
            gsap.set(overlay, { autoAlpha: 0, visibility: 'hidden' });
            return;
        }
        gsap.to(panel, {
            x: -PANEL_WIDTH,
            duration: motion.duration('fast'),
            ease: motion.ease.exit,
            onComplete: () => gsap.set(panel, { visibility: 'hidden' }),
        });
        gsap.to(overlay, {
            autoAlpha: 0,
            duration: motion.duration('fast'),
            ease: motion.ease.exit,
            onComplete: () => gsap.set(overlay, { visibility: 'hidden' }),
        });
    }, [open, motion.enabled, motion.level, motion.speed]);

    // Esc 关闭（浏览器预览 / 外接键盘）。
    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open, onClose]);

    // 打开时把焦点移进抽屉，避免焦点留在被遮住的内容上。
    useEffect(() => {
        if (open) panelRef.current?.focus({ preventScroll: true });
    }, [open]);

    const settleDrag = useCallback(
        (offsetX: number) => {
            const panel = panelRef.current;
            if (!panel) return;
            const shouldClose = offsetX < -PANEL_WIDTH * CLOSE_DRAG_RATIO;
            if (shouldClose) {
                onClose();
                return;
            }
            const duration = motion.enabled ? motion.duration('fast') : 0;
            gsap.to(panel, { x: 0, duration, ease: motion.ease.damped });
        },
        [motion.duration, motion.ease.damped, motion.enabled, onClose],
    );

    const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
        const touch = event.touches[0];
        if (!touch) return;
        dragStateRef.current = { startX: touch.clientX, startY: touch.clientY, dragging: false };
    };

    const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
        const state = dragStateRef.current;
        const panel = panelRef.current;
        const touch = event.touches[0];
        if (!state || !panel || !touch) return;
        const dx = touch.clientX - state.startX;
        const dy = touch.clientY - state.startY;
        if (!state.dragging) {
            // 纵向意图优先，避免和列表滚动打架。
            if (Math.abs(dy) > Math.abs(dx)) {
                dragStateRef.current = null;
                return;
            }
            if (Math.abs(dx) < 6) return;
            state.dragging = true;
            setDragging(true);
            gsap.killTweensOf(panel);
        }
        gsap.set(panel, { x: Math.min(0, dx) });
    };

    const handleTouchEnd = () => {
        const state = dragStateRef.current;
        dragStateRef.current = null;
        setDragging(false);
        if (!state?.dragging) return;
        const panel = panelRef.current;
        if (!panel) return;
        settleDrag(Number(gsap.getProperty(panel, 'x')) || 0);
    };

    return (
        <div
            ref={containerRef}
            className="fixed inset-0 z-40"
            style={{ pointerEvents: 'none' }}
            aria-hidden={!open}
        >
            <div
                ref={overlayRef}
                onPointerDown={(event) => {
                    event.preventDefault();
                    onClose();
                }}
                className="absolute inset-0 bg-black/45"
                style={{ visibility: 'hidden', opacity: 0 }}
            />
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label="全部功能"
                tabIndex={-1}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
                className={cn(
                    'absolute inset-y-0 left-0 flex outline-none',
                    'shadow-[0_12px_40px_-6px_rgba(0,0,0,0.45)]',
                    dragging ? '' : 'transition-shadow',
                )}
                style={{ width: PANEL_WIDTH, transform: `translateX(${-PANEL_WIDTH}px)`, visibility: 'hidden' }}
            >
                <Sidebar
                    active={active}
                    onChange={(route) => {
                        onChange(route);
                        onClose();
                    }}
                    collapsed={false}
                    onToggleCollapse={onClose}
                    onClose={onClose}
                    widthClassName="w-64"
                />
            </div>
        </div>
    );
};

export default AppDrawer;
