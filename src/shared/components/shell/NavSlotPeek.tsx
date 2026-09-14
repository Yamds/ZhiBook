// 日历 / 设置槽位上方的「露头」替身图标。
//
// 位置：钉在底部导航**顶边**正中（＝第 3 槽位「日历 / 设置」的中心），
// 层级压在导航栏**下面**——栏体不透明，所以缩回时整块被栏体盖住、看不见，
// 露头时只有图标的上半截从栏后探出来（就像从洞里探头）。
//
// 内容由 `navPeekTarget` 决定，永远是**当前页的对家**：
//   日历页 → 设置图标露头（提醒「这个位置还藏着设置」）；
//   设置页 → 日历图标露头（点它原路回去）；
//   其它页 → 两个都缩回栏后。
//
// 视觉：**只有图标本身**——没有底板、没有边框、没有阴影，露出的部分被栏顶边整齐切掉。
// 露出比例固定为图标的 1/2（`PEEK_ICON_VISIBLE`），其余藏在栏后。
//
// 几何：按钮盒比图标大（触点更宽容、且探出的空档能挡掉误触页面），
// 只有图标是可见的；`yPercent` 由「图标可见高度」反推，不写死经验值。
//
// 两个图标在切换时会上下交叠：**正在上浮的那个压在上面**（`zIndex`），
// 于是两个方向的动画观感一致 —— 都是「目标页的图标升上来」，而不是
// 「旧的降下去露出新的」。
//
// 动效全部走 useMotion()：关闭动效时直接落到终态（GSAP set），不做过渡。

import React, { useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import gsap from 'gsap';
import { cn } from '../../utils/cn';
import { MotionIcon, type MotionIconPreset } from '../../ui/motion';
import { useMotion } from '../../../hooks/preferences/useMotion';
import type { IconName } from '../../../core/design/icons';
import { HOME_TAB, SETTINGS_TAB, type AppRoute, type TabDef } from '../../../app/navigation';

/** 图标尺寸（与底部导航页签一致）。 */
const ICON_SIZE = 20;
/** 露头时**图标**露在栏外的比例：1/2，其余藏在栏后。 */
const PEEK_ICON_VISIBLE = 1 / 2;
/** 按钮盒高度：比图标高，多出来的空档既方便点，也不会让手指漏到页面上。 */
const CHIP_HEIGHT = 32;
/** 缩回时多压一点（百分比），避免抗锯齿在栏顶漏出一条发丝线。 */
const HIDDEN_OVERSCAN = 12;

/** 图标上沿距盒顶的距离。 */
const ICON_TOP = (CHIP_HEIGHT - ICON_SIZE) / 2;
/** 露头时露在栏外的盒高 = 图标上沿空档 + 图标可见高度。 */
const PEEK_BOX_VISIBLE = ICON_TOP + ICON_SIZE * PEEK_ICON_VISIBLE;
/** 露头 / 缩回对应的位移百分比（相对盒高）。 */
const PEEK_Y_PERCENT = (1 - PEEK_BOX_VISIBLE / CHIP_HEIGHT) * 100;
const HIDDEN_Y_PERCENT = 100 + HIDDEN_OVERSCAN;

/** 图标本身的语义动效：与底部导航页签用的是同一套（见 NAV_ROUTE_MOTION）。 */
const PEEK_ICON_MOTION: Record<'settings' | 'home', MotionIconPreset> = {
    settings: 'spin-slow',
    home: 'breathe',
};

interface PeekIconProps {
    /** 露头（true）还是缩回栏后（false）。 */
    visible: boolean;
    icon: IconName;
    label: string;
    iconMotion: MotionIconPreset;
    onClick: () => void;
}

/** 单个露头图标：外层负责「贴栏顶 + 水平居中 + 压层级」，内层按钮由 GSAP 上下推。 */
const PeekIcon: React.FC<PeekIconProps> = ({ visible, icon, label, iconMotion, onClick }) => {
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const primedRef = useRef(false);
    const motion = useMotion();

    useLayoutEffect(() => {
        const element = buttonRef.current;
        if (!element) return;
        const yPercent = visible ? PEEK_Y_PERCENT : HIDDEN_Y_PERCENT;
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
        // zIndex：上浮的那个压在上面，保证两个方向的动画观感一致。
        <div className={cn('pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2', visible ? 'z-[2]' : 'z-[1]')}>
            <button
                ref={buttonRef}
                type="button"
                aria-label={label}
                aria-hidden={!visible}
                tabIndex={visible ? 0 : -1}
                onClick={onClick}
                style={{ height: CHIP_HEIGHT }}
                className={cn(
                    'flex w-10 items-center justify-center bg-transparent text-brand',
                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand',
                    visible ? 'pointer-events-auto' : 'pointer-events-none',
                )}
            >
                <MotionIcon
                    icon={icon}
                    motion={visible ? iconMotion : 'none'}
                    playEnter={visible}
                    enterKey={visible ? label : undefined}
                    size={ICON_SIZE}
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

export const NavSlotPeek: React.FC<NavSlotPeekProps> = ({ target, onSelect }) => {
    const { t } = useTranslation();
    return (
        // 零高度锚点：底边卡在导航栏顶边，横向铺满 → 子级 left-1/2 即槽位正中。
        <div className="pointer-events-none absolute inset-x-0 bottom-full z-0 h-0">
            <PeekIcon
                visible={target?.id === SETTINGS_TAB.id}
                icon={SETTINGS_TAB.icon}
                label={t(SETTINGS_TAB.labelKey)}
                iconMotion={PEEK_ICON_MOTION.settings}
                onClick={() => onSelect(SETTINGS_TAB.id)}
            />
            <PeekIcon
                visible={target?.id === HOME_TAB.id}
                icon={HOME_TAB.icon}
                label={t(HOME_TAB.labelKey)}
                iconMotion={PEEK_ICON_MOTION.home}
                onClick={() => onSelect(HOME_TAB.id)}
            />
        </div>
    );
};

export default NavSlotPeek;
