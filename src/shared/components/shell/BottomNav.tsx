// 底部导航栏：5 个槽位（账单 / 明细 / 日历 / 添加 / 资产）。
//
// 槽位内容由导航注册表决定：在设置页时，「日历」槽位临时换成「设置」页签
//（图标 / 文案 / 高亮全走同一套渲染），因为设置只是日历位置上的另一个状态。
//
// 点击语义由壳层处理（见 AppNext.handleTabSelect）：
//   普通点击   → 切页签
//   已激活日历 → 进设置
//   已激活设置 → 回日历
//   已激活其它 → 回到该页顶部
//
// 视觉与设计系统同源：brand 激活指示条 + MotionIcon 语义 + 触摸按压反馈。

import React, { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { cn } from '../../utils/cn';
import { MotionIcon, NAV_ROUTE_MOTION } from '../../ui/motion';
import { useMotion } from '../../../hooks/preferences/useMotion';
import { bottomNavTabs, type AppRoute, type AppScreen } from '../../../app/navigation';

export const BottomNav: React.FC<{
    /** 当前页面（含设置页）：决定哪个槽位高亮、日历槽位是否换成设置。 */
    active: AppScreen;
    onSelect: (id: AppRoute | 'settings') => void;
}> = ({ active, onSelect }) => {
    const motion = useMotion();
    const tabs = bottomNavTabs(active);
    const navRef = useRef<HTMLElement | null>(null);
    const indicatorRef = useRef<HTMLSpanElement | null>(null);

    useLayoutEffect(() => {
        const nav = navRef.current;
        const indicator = indicatorRef.current;
        if (!nav || !indicator) return;
        const activeButton = nav.querySelector<HTMLElement>('button[aria-current="page"]');
        if (!activeButton) {
            gsap.set(indicator, { autoAlpha: 0 });
            return;
        }
        const navRect = nav.getBoundingClientRect();
        const buttonRect = activeButton.getBoundingClientRect();
        const x = buttonRect.left - navRect.left + 10;
        const width = Math.max(buttonRect.width - 20, 24);
        if (!motion.enabled || !motion.preset.feel.cardLift) {
            gsap.set(indicator, { autoAlpha: 1, x, width });
            return;
        }
        gsap.to(indicator, {
            autoAlpha: 1,
            x,
            width,
            duration: motion.duration('base'),
            ease: motion.ease.hover,
        });
    }, [active, motion]);

    return (
        <nav
            ref={navRef}
            className="relative z-30 flex shrink-0 items-stretch justify-around border-t border-border-subtle bg-sidebar pb-[var(--safe-bottom)]"
        >
            <span
                ref={indicatorRef}
                aria-hidden
                style={{ visibility: 'hidden', opacity: 0 }}
                className="pointer-events-none absolute left-0 top-0 h-[2px] rounded-b-pill bg-brand"
            />
            {tabs.map((item) => {
                const isActive = active === item.id;
                return (
                    <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelect(item.id)}
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                            'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2',
                            'transition-colors duration-150 ease-out active:bg-text/8',
                            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand',
                            isActive ? 'text-text' : 'text-text-tertiary',
                        )}
                    >
                        <MotionIcon
                            icon={item.icon}
                            motion={isActive ? NAV_ROUTE_MOTION[item.id] ?? 'none' : 'none'}
                            playEnter={isActive}
                            enterKey={isActive ? item.id : undefined}
                            size={20}
                            className={cn('shrink-0', isActive && 'text-brand')}
                        />
                        <span className={cn('truncate text-[10.5px] font-medium leading-none', isActive && 'text-brand')}>
                            {item.label}
                        </span>
                    </button>
                );
            })}
        </nav>
    );
};

export default BottomNav;
