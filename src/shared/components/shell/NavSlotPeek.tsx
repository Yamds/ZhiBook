// 日历 / 设置槽位上方的「露头」替身按钮。
//
// 位置：钉在底部导航**顶边**正中（＝第 3 槽位「日历 / 设置」的中心），
// 层级压在导航栏**下面**——栏体不透明，所以缩回时整块被栏体盖住、看不见，
// 露头时只有上半截从栏后探出来（就像从洞里探头）。
//
// 内容由 `navPeekTarget` 决定，永远是**当前页的对家**：
//   日历页 → 设置图标露头（提醒「这个位置还藏着设置」）；
//   设置页 → 日历图标露头（点它原路回去）；
//   其它页 → 两个都缩回栏后。
//
// 点击区域＝露在栏外的那半截；栏内一半被导航栏盖住，点下去命中的是槽位本身，
// 行为一致（日历槽位重按进设置、设置槽位重按回日历），所以小按钮也不难点。
//
// 动效全部走 useMotion()：关闭动效时直接落到终态（GSAP set），不做过渡。

import React, { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { cn } from '../../utils/cn';
import { MotionIcon, type MotionIconPreset } from '../../ui/motion';
import { useMotion } from '../../../hooks/preferences/useMotion';
import type { IconName } from '../../../core/design/icons';
import { HOME_TAB, SETTINGS_TAB, type AppRoute, type TabDef } from '../../../app/navigation';

/**
 * 露头时露在栏外的比例。
 *
 * 0.7 = 三成压在栏后：20px 的图标会被栏顶边切掉底部约 3px，
 * 既看得出「是个图标」，又一眼知道它是从栏后升上来的。
 */
const PEEK_VISIBLE = 0.7;
/** 缩回时多压一点（百分比），避免边框 / 抗锯齿在栏顶漏出一条发丝线。 */
const HIDDEN_OVERSCAN = 12;
/** 图标本身的语义动效：与底部导航页签用的是同一套（见 NAV_ROUTE_MOTION）。 */
const PEEK_ICON_MOTION: Record<'settings' | 'home', MotionIconPreset> = {
    settings: 'spin-slow',
    home: 'breathe',
};

interface PeekChipProps {
    /** 露头（true）还是缩回栏后（false）。 */
    visible: boolean;
    icon: IconName;
    label: string;
    iconMotion: MotionIconPreset;
    onClick: () => void;
}

/** 单个露头块：外层负责「贴栏顶 + 水平居中」，内层按钮由 GSAP 上下推。 */
const PeekChip: React.FC<PeekChipProps> = ({ visible, icon, label, iconMotion, onClick }) => {
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const primedRef = useRef(false);
    const motion = useMotion();

    useLayoutEffect(() => {
        const element = buttonRef.current;
        if (!element) return;
        const yPercent = visible ? (1 - PEEK_VISIBLE) * 100 : 100 + HIDDEN_OVERSCAN;
        // 首帧只落位不补间：初值必须在本帧绘出之前就写好，否则会闪一下全露状态。
        if (!primedRef.current) {
            primedRef.current = true;
            gsap.set(element, { yPercent });
            return;
        }
        motion.tween(
            element,
            { yPercent, overwrite: 'auto' },
            {
                kind: visible ? 'base' : 'fast',
                // 露头用带回弹的 release，缩回用干脆的 exit。
                ease: visible ? 'release' : 'exit',
            },
        );
        // motion 的 helper 是稳定引用（内部读 ref），依赖只放 visible 即可。
    }, [visible]);

    return (
        <div className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2">
            <button
                ref={buttonRef}
                type="button"
                aria-label={label}
                aria-hidden={!visible}
                tabIndex={visible ? 0 : -1}
                onClick={onClick}
                className={cn(
                    'flex h-9 w-11 items-center justify-center rounded-t-lg',
                    'border border-b-0 border-border-subtle bg-sidebar text-brand',
                    'shadow-[0_-2px_8px_color-mix(in_srgb,var(--text-primary)_10%,transparent)]',
                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand',
                    visible ? 'pointer-events-auto active:bg-muted' : 'pointer-events-none',
                )}
            >
                <MotionIcon
                    icon={icon}
                    motion={visible ? iconMotion : 'none'}
                    playEnter={visible}
                    enterKey={visible ? label : undefined}
                    size={20}
                />
            </button>
        </div>
    );
};

export interface NavSlotPeekProps {
    /** 露头目标（`navPeekTarget(screen)`）；null = 两个都缩回栏后。 */
    target: TabDef | null;
    /** 复用底部导航的点击语义入口（壳层按 id 分派）。 */
    onSelect: (id: AppRoute | 'settings') => void;
}

export const NavSlotPeek: React.FC<NavSlotPeekProps> = ({ target, onSelect }) => (
    // 零高度锚点：底边卡在导航栏顶边，横向铺满 → 子级 left-1/2 即槽位正中。
    <div className="pointer-events-none absolute inset-x-0 bottom-full z-0 h-0">
        <PeekChip
            visible={target?.id === SETTINGS_TAB.id}
            icon={SETTINGS_TAB.icon}
            label={SETTINGS_TAB.label}
            iconMotion={PEEK_ICON_MOTION.settings}
            onClick={() => onSelect(SETTINGS_TAB.id)}
        />
        <PeekChip
            visible={target?.id === HOME_TAB.id}
            icon={HOME_TAB.icon}
            label={HOME_TAB.label}
            iconMotion={PEEK_ICON_MOTION.home}
            onClick={() => onSelect(HOME_TAB.id)}
        />
    </div>
);

export default NavSlotPeek;
