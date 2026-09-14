// 破坏性操作的二次确认弹层（BRD 3.7：删除分类 / 账户 / 账单都要说明影响范围）。
//
// 移动端通用原子件（P5 从 `modules/add` 提到 `shared/ui`）：明细页删账单也要用。
// 用 BottomSheet 而不是系统 confirm：移动端更顺手，也能带上「影响范围」文案。

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from './BottomSheet';
import { cn } from '../utils/cn';

export interface ConfirmSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    /** 影响范围说明（必填，别让用户猜）。 */
    description: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    /** danger = 删除类操作。 */
    tone?: 'danger' | 'primary';
    busy?: boolean;
    onConfirm: () => void;
}

export function ConfirmSheet({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel,
    cancelLabel,
    tone = 'danger',
    busy = false,
    onConfirm,
}: ConfirmSheetProps) {
    const { t } = useTranslation();
    const resolvedConfirmLabel = confirmLabel ?? t('common.confirmDelete');
    const resolvedCancelLabel = cancelLabel ?? t('common.cancel');
    return (
        <BottomSheet open={open} onOpenChange={onOpenChange} title={title} maxHeightRatio={0.6}>
            <div className="flex flex-col gap-4">
                <div className="text-[13px] leading-relaxed text-text-secondary">{description}</div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        className="h-10 flex-1 rounded-md bg-inset text-[14px] font-medium text-text-secondary active:bg-muted"
                    >
                        {resolvedCancelLabel}
                    </button>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onConfirm}
                        className={cn(
                            'h-10 flex-1 rounded-md text-[14px] font-semibold text-white',
                            tone === 'danger' ? 'bg-danger' : 'bg-brand',
                            busy ? 'opacity-60' : 'active:opacity-90',
                        )}
                    >
                        {busy ? t('common.processing') : resolvedConfirmLabel}
                    </button>
                </div>
            </div>
        </BottomSheet>
    );
}

export default ConfirmSheet;
