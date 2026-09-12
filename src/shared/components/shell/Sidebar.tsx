// 侧栏导航：全部功能的唯一入口（手机端由抽屉承载）。
// 保留源项目的 FLIP active indicator、折叠态和 MotionIcon 交互。

import React, { useLayoutEffect, useRef } from 'react';
import { ChevronsLeft, ChevronsRight, X } from 'lucide-react';
import gsap from 'gsap';
import { cn } from '../../utils/cn';
import { MotionIcon, NAV_ROUTE_MOTION } from '../../ui/motion';
import { useMotion } from '../../../hooks/preferences/useMotion';
import logoSidebar from '../../../assets/logo-32.png?inline';
import logoSidebarCollapsed from '../../../assets/logo-48.png?inline';
import {
    DRAWER_MAIN_ROUTES,
    DRAWER_PINNED_ROUTES,
    type AppRoute,
    type AppRouteDef,
} from '../../../app/navigation';

export type { AppRoute };

const LOGO_IMG_CLASS = 'select-none object-contain [image-rendering:-webkit-optimize-contrast]';

export const Sidebar: React.FC<{
    active: AppRoute;
    onChange: (route: AppRoute) => void;
    collapsed: boolean;
    onToggleCollapse: () => void;
    /** 抽屉模式下传入：折叠按钮换成关闭按钮。 */
    onClose?: () => void;
    /** 抽屉模式下覆盖宽度。 */
    widthClassName?: string;
}> = ({ active, onChange, collapsed, onToggleCollapse, onClose, widthClassName }) => {
    const motion = useMotion();
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
        const top = buttonRect.top - navRect.top + 6;
        const height = buttonRect.height - 12;
        if (!motion.enabled || !motion.preset.feel.cardLift) {
            gsap.set(indicator, { autoAlpha: 1, y: top, height });
            return;
        }
        gsap.to(indicator, {
            autoAlpha: 1,
            y: top,
            height,
            duration: motion.duration('base'),
            ease: motion.ease.hover,
        });
    }, [active, collapsed, motion]);

    return (
        <aside className={cn('relative z-20 flex shrink-0 flex-col bg-sidebar transition-[width] duration-200 ease-out pt-[var(--safe-top)] pb-[var(--safe-bottom)]', widthClassName ?? (collapsed ? 'w-14' : 'w-56'))}>
            <div className={cn('flex h-12 shrink-0 items-center overflow-hidden', collapsed ? 'justify-center px-0' : 'gap-2 px-3')}>
                {collapsed ? (
                    <button type="button" onClick={onToggleCollapse} aria-label="展开侧栏" title="展开侧栏" className="group relative inline-flex h-9 w-9 items-center justify-center rounded-sm cursor-pointer transition-colors active:bg-text/5 hover:bg-text/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand">
                        <img src={logoSidebarCollapsed} alt="制账 logo" width={28} height={28} className={cn('h-7 w-7 transition-opacity group-hover:opacity-0', LOGO_IMG_CLASS)} draggable={false} />
                        <MotionIcon icon={ChevronsRight} motion="none" hoverAccent size={16} strokeWidth={1.75} className="absolute text-text-secondary opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                ) : (
                    <>
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                            <img src={logoSidebar} alt="制账 logo" width={24} height={24} className={cn('h-6 w-6 shrink-0', LOGO_IMG_CLASS)} draggable={false} />
                            <span className="truncate whitespace-nowrap font-display text-[13.5px] font-semibold leading-none tracking-tight text-text select-none">制账</span>
                        </div>
                        {onClose ? (
                            <button type="button" onClick={onClose} aria-label="关闭侧栏" title="关闭侧栏" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xs cursor-pointer text-text-disabled transition-colors active:bg-text/5 hover:bg-text/5 hover:text-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand">
                                <MotionIcon icon={X} motion="none" hoverAccent size={15} strokeWidth={1.9} />
                            </button>
                        ) : (
                            <button type="button" onClick={onToggleCollapse} aria-label="折叠侧栏" title="折叠侧栏" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-xs cursor-pointer text-text-disabled transition-colors active:bg-text/5 hover:bg-text/5 hover:text-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand">
                                <MotionIcon icon={ChevronsLeft} motion="none" hoverAccent size={13} strokeWidth={1.75} />
                            </button>
                        )}
                    </>
                )}
            </div>
            <div className="my-2 h-px bg-border-subtle" />
            <nav ref={navRef} className="relative flex min-h-0 flex-1 flex-col px-2 pb-3">
                <span ref={indicatorRef} aria-hidden style={{ visibility: 'hidden', opacity: 0 }} className="pointer-events-none absolute left-2 top-0 w-[2px] rounded-r-pill bg-brand" />
                <ul className="space-y-0.5">
                    {DRAWER_MAIN_ROUTES.map((item) => <NavRow key={item.id} item={item} isActive={active === item.id} collapsed={collapsed} onSelect={onChange} />)}
                </ul>
                <ul className="mt-auto space-y-0.5 border-t border-border-subtle pt-2">
                    {DRAWER_PINNED_ROUTES.map((item) => <NavRow key={item.id} item={item} isActive={active === item.id} collapsed={collapsed} onSelect={onChange} />)}
                </ul>
            </nav>
        </aside>
    );
};

function NavRow({ item, isActive, collapsed, onSelect }: { item: AppRouteDef; isActive: boolean; collapsed: boolean; onSelect: (id: AppRoute) => void }) {
    const Icon = item.icon;
    const iconSize = collapsed ? 20 : 15;
    const motionPreset = NAV_ROUTE_MOTION[item.id as keyof typeof NAV_ROUTE_MOTION] ?? 'none';
    return <li><button type="button" onClick={() => onSelect(item.id)} aria-current={isActive ? 'page' : undefined} title={collapsed ? item.label : undefined} className={cn('group relative flex w-full items-center gap-2.5 rounded-sm px-2.5 text-[13.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand', collapsed ? 'h-10 justify-center px-0' : 'h-9', isActive ? 'text-text' : 'text-text-tertiary active:bg-text/8 hover:bg-text/5 hover:text-text-secondary')}><MotionIcon icon={Icon} motion={isActive ? motionPreset : 'none'} playEnter={isActive} enterKey={isActive ? item.id : undefined} size={iconSize} strokeWidth={1.75} className={cn('shrink-0', isActive && 'text-brand')} />{!collapsed && <span className="truncate">{item.label}</span>}</button></li>;
}

export default Sidebar;
