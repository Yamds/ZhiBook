// 底部弹层（移动端主要的选择 / 编辑容器）。
//
// 基于 Radix Dialog：焦点陷阱、Esc 关闭、滚动锁定都由它兜底。
// 进退场用 CSS keyframes（index.css 里的 .ndf-bottom-sheet-*），
// Radix 会等动画结束再卸载；动效关闭时（data-motion="off"）直接落终态。

import type { ReactNode } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { useMotion } from '../../hooks/preferences/useMotion';
import { cn } from '../utils/cn';

export interface BottomSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title?: ReactNode;
    description?: ReactNode;
    children: ReactNode;
    /** 面板最高高度占视口比例，默认 0.86。 */
    maxHeightRatio?: number;
    className?: string;
    /** 内容区是否自己滚动（默认是）。 */
    scrollable?: boolean;
}

export function BottomSheet({
    open,
    onOpenChange,
    title,
    description,
    children,
    maxHeightRatio = 0.86,
    className,
    scrollable = true,
}: BottomSheetProps) {
    const motion = useMotion();

    return (
        <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
            <RadixDialog.Portal>
                <RadixDialog.Overlay
                    className="ndf-bottom-sheet-overlay fixed inset-0 z-40 bg-black/45"
                    data-motion={motion.enabled ? 'on' : 'off'}
                />
                <RadixDialog.Content
                    className={cn(
                        'ndf-bottom-sheet fixed inset-x-0 bottom-0 z-50 flex flex-col',
                        'rounded-t-lg border-t border-border-subtle bg-elevated shadow-popover',
                        'pb-[var(--safe-bottom)]',
                        className,
                    )}
                    data-motion={motion.enabled ? 'on' : 'off'}
                    style={{ maxHeight: `${Math.round(maxHeightRatio * 100)}vh` }}
                >
                    <div className="flex shrink-0 items-center justify-center pt-2.5" aria-hidden>
                        <span className="h-1 w-9 rounded-pill bg-text/15" />
                    </div>
                    {(title || description) ? (
                        <RadixDialog.Title asChild>
                            <header className="shrink-0 px-4 pb-1 pt-2">
                                <h2 className="font-display text-[15px] font-semibold leading-tight text-text">{title}</h2>
                                {description ? (
                                    <RadixDialog.Description asChild>
                                        <p className="mt-1 text-[12px] leading-relaxed text-text-tertiary">{description}</p>
                                    </RadixDialog.Description>
                                ) : null}
                            </header>
                        </RadixDialog.Title>
                    ) : (
                        <RadixDialog.Title className="sr-only">面板</RadixDialog.Title>
                    )}
                    <div className={cn('min-h-0 flex-1 px-4 pb-4 pt-2', scrollable && 'overflow-y-auto overscroll-contain')}>
                        {children}
                    </div>
                </RadixDialog.Content>
            </RadixDialog.Portal>
        </RadixDialog.Root>
    );
}

export default BottomSheet;
