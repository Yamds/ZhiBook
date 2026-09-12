// 移动端顶部栏：页面标题 + 当前账本入口。
//
// 抽屉 / 侧栏已整体移除，左侧不再有汉堡按钮；导航入口只剩底部 5 个页签。
// 右侧显示当前账本名，点击进入资产页（账本数据 P3 落地，切换交互 P8 完成）。

import React from 'react';
import { ChevronRight, Wallet } from 'lucide-react';
import { cn } from '../../utils/cn';

export const MobileAppBar: React.FC<{
    title: string;
    bookName: string;
    onOpenBook: () => void;
}> = ({ title, bookName, onOpenBook }) => (
    <header className="relative z-30 shrink-0 border-b border-border-subtle bg-canvas/95 pt-[var(--safe-top)] backdrop-blur-sm">
        <div className="flex h-12 items-center gap-2 px-3">
            <h1 className="min-w-0 flex-1 truncate font-display text-[15px] font-semibold leading-none tracking-tight text-text">
                {title}
            </h1>
            <button
                type="button"
                onClick={onOpenBook}
                aria-label={`当前账本：${bookName}，点击进入资产页`}
                className={cn(
                    'flex h-8 max-w-[46vw] shrink-0 items-center gap-1 rounded-pill bg-inset px-2.5 text-[12px] font-medium text-text-secondary',
                    'transition-colors active:bg-brand/15 active:text-brand',
                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand',
                )}
            >
                <Wallet aria-hidden size={13} strokeWidth={1.9} className="shrink-0" />
                <span className="truncate">{bookName}</span>
                <ChevronRight aria-hidden size={13} strokeWidth={2} className="shrink-0 text-text-tertiary" />
            </button>
        </div>
    </header>
);

export default MobileAppBar;
