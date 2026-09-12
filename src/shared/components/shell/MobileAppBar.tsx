// 移动端顶部栏：抽屉入口 + 页面标题 + 右侧操作位。
//
// 沿用桌面自定义标题栏的高度、间距与图标按钮的按压反馈语言；
// 手机没有窗口拖拽/最小化/最大化，因此只保留汉堡与标题。

import React from 'react';
import { Menu } from 'lucide-react';
import { cn } from '../../utils/cn';
import { MotionIcon } from '../../ui/motion';

export const MobileAppBar: React.FC<{
    title: string;
    onOpenDrawer: () => void;
}> = ({ title, onOpenDrawer }) => (
    <header className="relative z-30 shrink-0 border-b border-border-subtle bg-canvas/95 pt-[var(--safe-top)] backdrop-blur-sm">
        <div className="flex h-12 items-center gap-1.5 px-2">
            <button
                type="button"
                onClick={onOpenDrawer}
                aria-label="打开全部功能"
                title="全部功能"
                className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-secondary',
                    'transition-all duration-150 ease-out active:scale-90 active:bg-brand/15 active:text-brand',
                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand',
                )}
            >
                <MotionIcon icon={Menu} motion="none" hoverAccent size={19} strokeWidth={1.9} />
            </button>
            <h1 className="min-w-0 flex-1 truncate font-display text-[15px] font-semibold leading-none tracking-tight text-text">
                {title}
            </h1>
        </div>
    </header>
);

export default MobileAppBar;
