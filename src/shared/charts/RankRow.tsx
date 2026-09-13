// 排行行（类目排行 / 明细排行）。
//
// 结构：可选前导图标 + 标题 / 副标题 + 右侧金额 + 占比进度条。
// 用 HTML/CSS 而不是 SVG：中文排版、省略号、点击热区都更自然。

import type { ReactNode } from 'react';
import { cn } from '../utils/cn';
import { useMotion } from '../../hooks/preferences/useMotion';

export interface RankRowProps {
    leading?: ReactNode;
    title: ReactNode;
    subtitle?: ReactNode;
    trailing?: ReactNode;
    /** 0..1；进度条宽度 */
    ratio: number;
    /** 进度条颜色（分类色），默认主题色。 */
    color?: string;
    onClick?: () => void;
    className?: string;
}

export function RankRow({
    leading,
    title,
    subtitle,
    trailing,
    ratio,
    color,
    onClick,
    className,
}: RankRowProps) {
    const motion = useMotion();
    const width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
    const interactive = typeof onClick === 'function';

    const content = (
        <>
            <div className="flex min-w-0 items-center gap-2.5">
                {leading}
                <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-text">{title}</div>
                    {subtitle ? <div className="mt-0.5 truncate text-[11.5px] text-text-tertiary">{subtitle}</div> : null}
                </div>
                {trailing ? <div className="shrink-0 text-[13px] font-medium tabular-nums text-text">{trailing}</div> : null}
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-pill bg-inset">
                <div
                    className={cn('h-full rounded-pill', motion.enabled && 'transition-[width] duration-300 ease-out')}
                    style={{ width, background: color ?? 'var(--brand-500)' }}
                />
            </div>
        </>
    );

    if (interactive) {
        return (
            <button
                type="button"
                onClick={onClick}
                className={cn('block w-full px-0.5 py-1.5 text-left active:opacity-80', className)}
            >
                {content}
            </button>
        );
    }

    return <div className={cn('w-full px-0.5 py-1.5', className)}>{content}</div>;
}

export default RankRow;
