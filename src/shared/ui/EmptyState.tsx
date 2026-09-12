// 空态：列表 / 图表 / 统计卡片没有数据时的统一表达。
//
// 有图标、标题、说明与可选操作；颜色全部走 token，页面不要自己拼一套。

import type { ReactNode } from 'react';
import { AppIcon } from './AppIcon';
import { cn } from '../utils/cn';
import type { IconName } from '../../core/design/icons';

export interface EmptyStateProps {
    icon?: IconName;
    title: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
    /** compact：卡片内的小空态，减少上下留白。 */
    size?: 'compact' | 'normal';
    className?: string;
}

export function EmptyState({ icon, title, description, action, size = 'normal', className }: EmptyStateProps) {
    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center gap-1.5 text-center',
                size === 'compact' ? 'px-4 py-6' : 'px-6 py-10',
                className,
            )}
        >
            {icon ? (
                <span className="mb-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full bg-inset text-text-tertiary">
                    <AppIcon name={icon} size={18} />
                </span>
            ) : null}
            <p className="text-[13px] font-medium text-text-secondary">{title}</p>
            {description ? <p className="max-w-[240px] text-[11.5px] leading-relaxed text-text-tertiary">{description}</p> : null}
            {action ? <div className="mt-1.5">{action}</div> : null}
        </div>
    );
}

export default EmptyState;
