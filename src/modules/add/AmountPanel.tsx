// 输入面板顶部（BRD FR-ADD-10 ~ 12）：
// 左侧备注输入 + 附图按钮 + 账户入口，右侧金额显示（含表达式）。
//
// 备注是真实 <input>：聚焦时系统键盘会弹出，页面此时会把数字键盘收起
// （见 AddPage），避免两个键盘抢屏。

import type { RefObject } from 'react';
import { UI_ICONS } from '../../core/design/icons';
import { formatMoney } from '../../core/domain/money';
import type { EntryKind } from '../../core/ipc/types';
import { AppIcon } from '../../shared/ui/AppIcon';
import { cn } from '../../shared/utils/cn';
import { MAX_ATTACHMENTS } from './image';

export interface AmountPanelProps {
    kind: EntryKind;
    note: string;
    onNoteChange: (value: string) => void;
    onNoteFocus: () => void;
    onNoteBlur: () => void;
    attachmentCount: number;
    onPickAttachments: () => void;
    /** 键盘表达式原文（空 = 还没输入）。 */
    expression: string;
    /** 表达式求值结果（分）；非法时为 0。 */
    amountCents: number;
    amountValid: boolean;
    accountName: string;
    onPickAccount: () => void;
    /** 页面用来控制聚焦 / 收起（备注聚焦时数字键盘会让位）。 */
    noteInputRef?: RefObject<HTMLInputElement>;
}

export function AmountPanel({
    kind,
    note,
    onNoteChange,
    onNoteFocus,
    onNoteBlur,
    attachmentCount,
    onPickAttachments,
    expression,
    amountCents,
    amountValid,
    accountName,
    onPickAccount,
    noteInputRef,
}: AmountPanelProps) {
    return (
        <div className="flex items-end gap-2 px-3 pt-2 pb-1.5">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={onPickAttachments}
                        aria-label="添加图片附件"
                        className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-inset text-text-secondary active:bg-muted"
                    >
                        <AppIcon name={UI_ICONS.camera} size={17} />
                        {attachmentCount > 0 ? (
                            <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-pill bg-brand px-1 text-[10px] font-semibold text-white">
                                {attachmentCount}
                            </span>
                        ) : null}
                    </button>
                    <div className="relative min-w-0 flex-1">
                        <input
                            ref={noteInputRef}
                            value={note}
                            onChange={(event) => onNoteChange(event.target.value)}
                            onFocus={onNoteFocus}
                            onBlur={onNoteBlur}
                            maxLength={64}
                            placeholder="备注（可选，最多 64 字）"
                            aria-label="备注"
                            className={cn(
                                'h-8 w-full rounded-md border border-border-subtle bg-field pr-7 pl-2 text-[13px] text-text',
                                'placeholder:text-text-disabled',
                                'focus-visible:border-brand focus-visible:outline-none',
                            )}
                        />
                        {note.length > 0 ? (
                            <button
                                type="button"
                                onClick={() => onNoteChange('')}
                                aria-label="清空备注"
                                className="absolute top-1/2 right-1.5 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-text-tertiary active:bg-muted"
                            >
                                <AppIcon name={UI_ICONS.close} size={13} />
                            </button>
                        ) : null}
                    </div>
                </div>

                <button
                    type="button"
                    onClick={onPickAccount}
                    className="inline-flex h-7 max-w-full items-center gap-1 self-start rounded-pill bg-inset px-2.5 text-[11.5px] text-text-secondary active:bg-muted"
                >
                    <AppIcon name={UI_ICONS.assets} size={13} />
                    <span className="truncate">{accountName}</span>
                    <AppIcon name={UI_ICONS.chevronDown} size={12} />
                </button>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-0.5 pb-0.5">
                <span
                    className={cn(
                        'text-[10.5px] text-text-tertiary tabular-nums',
                        expression === '' && 'invisible',
                    )}
                >
                    {expression === '' ? '0' : `${expression} =`}
                </span>
                <span
                    className={cn(
                        'text-[26px] leading-none font-semibold tabular-nums',
                        amountValid ? 'text-text' : 'text-text-disabled',
                    )}
                >
                    {formatMoney(amountCents)}
                </span>
                <span className="text-[10.5px] text-text-tertiary">
                    {kind === 'expense' ? '支出' : '收入'} · 最多 {MAX_ATTACHMENTS} 张图
                </span>
            </div>
        </div>
    );
}

export default AmountPanel;
