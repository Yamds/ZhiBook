// 密码输入键盘（PIN）：软件键盘，不唤起系统输入法。
//
// 1-9 / ⌫ / 0 / ✓；点按直接改 value，校验交给调用方。

import { useEffect, useRef, type ReactNode } from 'react';
import { UI_ICONS } from '../../core/design/icons';
import { useMotion } from '../../hooks/preferences/useMotion';
import { AppIcon } from '../../shared/ui/AppIcon';
import { cn } from '../../shared/utils/cn';

export const PIN_MIN_LEN = 4;
export const PIN_MAX_LEN = 8;

export interface PinPadProps {
    value: string;
    onChange: (next: string) => void;
    onSubmit: () => void;
    minLength?: number;
    maxLength?: number;
    disabled?: boolean;
    error?: string | null;
    hint?: string;
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

export function PinPad({
    value,
    onChange,
    onSubmit,
    minLength = PIN_MIN_LEN,
    maxLength = PIN_MAX_LEN,
    disabled = false,
    error,
    hint,
}: PinPadProps) {
    const motion = useMotion();
    const dotsRef = useRef<HTMLDivElement | null>(null);
    const prevErrorRef = useRef<string | null | undefined>(undefined);

    // 报错时抖一下输入区。
    useEffect(() => {
        if (error && error !== prevErrorRef.current && dotsRef.current) {
            motion.shake(dotsRef.current);
        }
        prevErrorRef.current = error;
    }, [error, motion]);

    const append = (digit: string) => {
        if (disabled || value.length >= maxLength) return;
        onChange(value + digit);
    };

    return (
        <div className="flex w-full flex-col items-center gap-5">
            <div ref={dotsRef} className="flex h-9 items-center justify-center gap-3">
                {value.length === 0 ? (
                    <span className="text-[13px] text-text-tertiary">
                        {hint ?? `请输入 ${minLength}~${maxLength} 位数字`}
                    </span>
                ) : (
                    Array.from(value).map((_, index) => (
                        <span key={index} className="h-3 w-3 rounded-full bg-brand" />
                    ))
                )}
            </div>

            {error ? <p className="-mt-2 text-[12.5px] text-danger">{error}</p> : null}

            <div className="grid w-full max-w-[300px] grid-cols-3 gap-2.5">
                {DIGITS.map((digit) => (
                    <PinKey key={digit} onClick={() => append(digit)} disabled={disabled}>
                        {digit}
                    </PinKey>
                ))}
                <PinKey
                    onClick={() => onChange(value.slice(0, -1))}
                    disabled={disabled || value.length === 0}
                    label="删除"
                >
                    <AppIcon name={UI_ICONS.backspace} size={20} />
                </PinKey>
                <PinKey onClick={() => append('0')} disabled={disabled}>
                    0
                </PinKey>
                <PinKey
                    onClick={onSubmit}
                    disabled={disabled || value.length < minLength}
                    label="确认"
                >
                    <AppIcon name={UI_ICONS.check} size={22} />
                </PinKey>
            </div>
        </div>
    );
}

function PinKey({
    children,
    onClick,
    disabled,
    label,
}: {
    children: ReactNode;
    onClick: () => void;
    disabled?: boolean;
    label?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            className={cn(
                'flex h-14 items-center justify-center rounded-md bg-inset text-[22px] font-medium text-text',
                'transition-colors active:bg-muted disabled:opacity-40',
            )}
        >
            {children}
        </button>
    );
}

export default PinPad;
