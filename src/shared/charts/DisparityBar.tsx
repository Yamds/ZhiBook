// 差距条：总资产 / 负债的横向对比（资产卡片用）。
//
// 两条轨道共用同一个最大值刻度，长度差就是「差距」；右侧固定显示金额。

import { cn } from '../utils/cn';
import { formatMoney } from '../../core/domain/money';

export interface DisparityBarProps {
    label: string;
    valueCents: number;
    /** 两条轨道共用的刻度上限（分）。 */
    maxCents: number;
    tone: 'asset' | 'liability';
    className?: string;
}

const TONE_FILL: Record<DisparityBarProps['tone'], string> = {
    asset: 'var(--brand-500)',
    liability: 'var(--state-danger)',
};

export function DisparityBar({ label, valueCents, maxCents, tone, className }: DisparityBarProps) {
    const ratio = maxCents > 0 ? Math.max(0, Math.min(1, valueCents / maxCents)) : 0;
    return (
        <div className={cn('flex items-center gap-2.5', className)}>
            <span className="w-12 shrink-0 text-[12px] text-text-secondary">{label}</span>
            <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-pill bg-inset">
                <div
                    className="h-full rounded-pill transition-[width] duration-300 ease-out"
                    style={{ width: `${ratio * 100}%`, background: TONE_FILL[tone] }}
                />
            </div>
            <span className="shrink-0 text-[12.5px] font-medium tabular-nums text-text">
                {formatMoney(valueCents)}
            </span>
        </div>
    );
}

export default DisparityBar;
