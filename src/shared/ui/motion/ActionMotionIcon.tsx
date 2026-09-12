// 图标按钮 / 工具栏 / 卡片操作区：统一尺寸与可选持续动效。

import type { IconName } from '../../../core/design/icons';
import { MotionIcon, type MotionIconPreset } from './MotionIcon';
import { cn } from '../../utils/cn';

export interface ActionMotionIconProps {
    icon: IconName;
    motion?: MotionIconPreset;
    playEnter?: boolean;
    enterKey?: string;
    size?: number;
    className?: string;
    title?: string;
}

export function ActionMotionIcon({
    icon,
    motion = 'none',
    playEnter = false,
    enterKey,
    className,
    size = 16,
    title,
}: ActionMotionIconProps) {
    return (
        <MotionIcon
            icon={icon}
            motion={motion}
            playEnter={playEnter}
            enterKey={enterKey}
            size={size}
            title={title}
            className={cn('shrink-0', className)}
        />
    );
}
