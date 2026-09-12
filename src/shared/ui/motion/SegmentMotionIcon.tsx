// 分段控件（主题 / 动效档位）内的小图标：选中时轻弹入 + 轻呼吸。

import type { IconName } from '../../../core/design/icons';
import { MotionIcon } from './MotionIcon';
import { segmentMotion } from './motionIconSemantics';
import { cn } from '../../utils/cn';

export interface SegmentMotionIconProps {
    icon: IconName;
    selected: boolean;
    segmentKey: string;
    size?: number;
    className?: string;
}

export function SegmentMotionIcon({
    icon,
    selected,
    segmentKey,
    size = 13,
    className,
}: SegmentMotionIconProps) {
    return (
        <MotionIcon
            icon={icon}
            motion={segmentMotion(selected)}
            playEnter={selected}
            enterKey={selected ? segmentKey : undefined}
            size={size}
            className={cn(selected && 'text-brand', className)}
        />
    );
}
