// 账单页卡片骨架：统一标题栏 + 分类圆底图标。
//
// 每个统计主题（概览 / 趋势 / 占比 / 类目排行 / 明细排行）都是独立卡片，
// 标题栏样式由这里统一，避免各卡片各写一套。

import type { ReactNode } from 'react';
import { categoryColors } from '../../core/design/categoryColor';
import { toIconName } from '../../core/design/icons';
import { AppIcon } from '../../shared/ui/AppIcon';
import { Card } from '../../shared/ui';
import { cn } from '../../shared/utils/cn';

export interface BillsCardProps {
    title: string;
    /** 标题右侧的附加内容（如结余口径的「支出占比 / 收入占比」子切换）。 */
    extra?: ReactNode;
    children: ReactNode;
    className?: string;
}

export function BillsCard({ title, extra, children, className }: BillsCardProps) {
    return (
        <Card className={cn('flex flex-col gap-2.5 rounded-lg p-3.5', className)}>
            <header className="flex items-center justify-between gap-2">
                <h2 className="shrink-0 text-[13px] font-semibold text-text">{title}</h2>
                {extra}
            </header>
            {children}
        </Card>
    );
}

/** 排行行的分类圆底图标（颜色与图表图例同源）。 */
export function CategoryBadge({
    iconName,
    color,
    brand,
    surface,
}: {
    iconName: string;
    color: string;
    brand: string;
    surface: string;
}) {
    const colors = categoryColors(color, brand, surface);
    return (
        <span
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ background: colors.background, color: colors.foreground }}
        >
            <AppIcon name={toIconName(iconName)} size={16} />
        </span>
    );
}
