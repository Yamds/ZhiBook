// 顶层消息条原子件（Toast 式）。
//
// 形态：**底部居中的白色小窗**（`InfoBarStack` 负责定位与堆叠），一条消息一行标题、
// 可选一行补充说明；tone 只体现在图标颜色与边框（warning / danger 略微加深边框）。
//
// 样式上刻意保持「不挡内容」：宽度随内容收缩（不占满屏宽）、底色微透 + 轻模糊，
// 且**自动消失的提示整块点击穿透**（pointer-events-none）——手机上的 Toast 不该
// 拦住它下面那层（添加页的数字键盘就在正下方）。
//
// 行为：
//   - 自动消失时长由 `resolveInfoBarAutoDismissMs` 决定（danger 永不自动关）；
//   - 自动消失的消息**不给关闭按钮**（一次性提示，安卓 Toast 也没有）；
//     常驻消息（如 danger）才给，用户能手动关掉。
//
// 这一层只管展示，不管"何时该出现"；进退场动画由 InfoBarStack 的 GsapPresence 驱动。
// forwardRef 把 root div 暴露给外部，GsapPresence 才能拿到节点。

import { forwardRef, useEffect, useRef, type HTMLAttributes, type ReactNode } from 'react';
import { cva } from 'class-variance-authority';
import { UI_ICONS, type IconName } from '../../core/design/icons';
import { cn } from '../utils/cn';
import { AppIcon } from './AppIcon';
import { MotionIcon, infoToneMotion } from './motion';

/** 底色统一走 elevated（浅色主题就是白色）；tone 只体现在边框与图标。 */
const surfaceClass = {
    info: 'border-border-subtle',
    success: 'border-border-subtle',
    warning: 'border-warning/40',
    danger: 'border-danger/45',
} as const;

const iconVariants = cva('shrink-0', {
    variants: {
        tone: {
            info: 'text-info',
            success: 'text-success',
            warning: 'text-warning',
            danger: 'text-danger',
        },
    },
    defaultVariants: { tone: 'info' },
});

function defaultIconFor(tone: 'info' | 'success' | 'warning' | 'danger'): IconName {
    switch (tone) {
        case 'success':
            return UI_ICONS.success;
        case 'warning':
            return UI_ICONS.warning;
        case 'danger':
            return UI_ICONS.danger;
        case 'info':
        default:
            return UI_ICONS.info;
    }
}

export type InfoBarTone = 'info' | 'success' | 'warning' | 'danger';

export interface InfoBarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'content'> {
    tone?: InfoBarTone;
    title: ReactNode;
    content?: ReactNode;
    autoDismissMs?: number;
    onDismiss?: () => void;
    onAutoDismiss?: () => void;
    closable?: boolean;
}

export const InfoBar = forwardRef<HTMLDivElement, InfoBarProps>(
    (
        {
            tone = 'info',
            title,
            content,
            autoDismissMs,
            onDismiss,
            onAutoDismiss,
            closable = true,
            className,
            children,
            ...rest
        },
        ref,
    ) => {
        const onDismissRef = useRef(onDismiss);
        onDismissRef.current = onDismiss;
        const onAutoDismissRef = useRef(onAutoDismiss);
        onAutoDismissRef.current = onAutoDismiss;
        useEffect(() => {
            if (!autoDismissMs || autoDismissMs <= 0) return;
            const id = setTimeout(
                () => (onAutoDismissRef.current ?? onDismissRef.current)?.(),
                autoDismissMs,
            );
            return () => clearTimeout(id);
        }, [autoDismissMs]);

        const toneKey = tone ?? 'info';
        const Icon = defaultIconFor(toneKey);
        // 会自动消失的提示不给关闭按钮：一闪而过的 Toast 上加 × 只会让人误点
        const showClose = closable && !(autoDismissMs && autoDismissMs > 0);

        return (
            <div
                ref={ref}
                role="alert"
                style={{ visibility: 'hidden', opacity: 0 }}
                className={cn(
                    // 宽度随内容收缩（不再占满屏宽）；底色略透 + 轻模糊，减少遮挡感。
                    // 可点击性：会自动消失的提示**整块点击穿透**，手指能直接点到下面的键盘；
                    // 常驻提示（danger）才接收指针事件，否则关闭按钮点不到。
                    'relative flex w-fit max-w-[85%] items-center gap-2 rounded-lg border px-3 py-2.5',
                    'bg-elevated/90 shadow-popover backdrop-blur-sm',
                    showClose ? 'pointer-events-auto' : 'pointer-events-none',
                    surfaceClass[toneKey],
                    className,
                )}
                {...rest}
            >
                <MotionIcon
                    icon={Icon}
                    motion={infoToneMotion(toneKey)}
                    playEnter={false}
                    size={16}
                    className={iconVariants({ tone: toneKey })}
                />
                <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium leading-snug text-text">{title}</div>
                    {content ? (
                        <div className="mt-0.5 break-words text-[11.5px] leading-snug text-text-secondary">
                            {content}
                        </div>
                    ) : null}
                    {children}
                </div>
                {showClose ? (
                    <button
                        type="button"
                        aria-label="关闭"
                        onClick={() => onDismiss?.()}
                        className={cn(
                            '-mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm',
                            'text-text-tertiary active:bg-inset',
                        )}
                    >
                        <AppIcon name={UI_ICONS.close} size={13} />
                    </button>
                ) : null}
            </div>
        );
    },
);
InfoBar.displayName = 'InfoBar';
