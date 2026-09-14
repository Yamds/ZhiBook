// 重置金额键（键盘右列第一格，原「日期」位置）。
//
// 规则（本轮需求）：无背景高亮、无文字，只画一个重置图标；必须**长按 0.8s** 才清空金额，
// 按住期间画一圈进度弧，松手 / 滑开 / 取消都立即复位。短按不产生任何动作。
//
// 进度弧用 CSS keyframes（`.ndf-reset-progress`）而不是 GSAP：它是「按住时长」的
// 功能反馈，不跟随动效档位降级；松手即卸载节点，天然复位。

import type { CSSProperties } from 'react';
import { useState } from 'react';
import { UI_ICONS } from '../../core/design/icons';
import { useLongPress } from '../../hooks/ui/useLongPress';
import { AppIcon } from '../../shared/ui/AppIcon';

/** 重置金额的长按阈值（本轮需求：0.8s）。 */
export const RESET_LONG_PRESS_MS = 800;

/** 进度环半径与周长（viewBox 40×40）；周长与 index.css 的 keyframes 保持一致。 */
const RING_RADIUS = 16;
export const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export interface ResetAmountButtonProps {
    onReset: () => void;
}

export function ResetAmountButton({ onReset }: ResetAmountButtonProps) {
    const [pressing, setPressing] = useState(false);

    const longPress = useLongPress({
        onLongPress: () => {
            setPressing(false);
            onReset();
        },
        delayMs: RESET_LONG_PRESS_MS,
    });

    const ringStyle = {
        strokeDasharray: RING_CIRCUMFERENCE,
    } satisfies CSSProperties;

    return (
        <button
            type="button"
            aria-label="长按重置金额"
            className="relative flex h-[58px] items-center justify-center rounded-md text-text-secondary"
            {...longPress}
            onPointerDown={(event) => {
                setPressing(true);
                longPress.onPointerDown(event);
            }}
            onPointerUp={(event) => {
                setPressing(false);
                longPress.onPointerUp(event);
            }}
            onPointerLeave={(event) => {
                setPressing(false);
                longPress.onPointerLeave(event);
            }}
            onPointerCancel={(event) => {
                setPressing(false);
                longPress.onPointerCancel(event);
            }}
        >
            {pressing ? (
                <svg
                    viewBox="0 0 40 40"
                    className="pointer-events-none absolute inset-0 m-auto h-10 w-10 -rotate-90"
                    aria-hidden
                >
                    <circle
                        cx="20"
                        cy="20"
                        r={RING_RADIUS}
                        fill="none"
                        stroke="var(--border-default)"
                        strokeWidth="3"
                    />
                    <circle
                        className="ndf-reset-progress"
                        cx="20"
                        cy="20"
                        r={RING_RADIUS}
                        fill="none"
                        stroke="var(--brand-500)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeDashoffset={RING_CIRCUMFERENCE}
                        style={ringStyle}
                    />
                </svg>
            ) : null}
            <AppIcon name={UI_ICONS.refresh} size={22} />
        </button>
    );
}

export default ResetAmountButton;
