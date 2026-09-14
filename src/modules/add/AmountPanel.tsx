// 输入面板顶部（BRD FR-ADD-10 ~ 12）：
// 第一行：附图 + 日期 + 时间 + 备注（备注延伸到屏幕右缘）；
// 第二行：账户入口（左） + 金额计算（表达式在总额左侧）。
//
// 备注是真实 <input>：聚焦后直接用系统输入法打字，自定义数字键盘**照常保留**在下方。
// 日期按钮与时间按钮同尺寸（FR-ADD-10b 修订）：日期在时间左侧，点击开月历。

import { UI_ICONS } from '../../core/design/icons';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '../../core/domain/money';
import { AppIcon } from '../../shared/ui/AppIcon';
import { TimePicker, type TimeValue } from '../../shared/ui/TimePicker';
import { cn } from '../../shared/utils/cn';

export interface AmountPanelProps {
    note: string;
    onNoteChange: (value: string) => void;
    attachmentCount: number;
    onPickAttachments: () => void;
    /** 该笔账单的时分（默认当前时间）。 */
    time: TimeValue;
    onTimeChange: (next: TimeValue) => void;
    /** 键盘表达式原文（空 = 还没输入）。 */
    expression: string;
    /** 表达式求值结果（分）；非法时为 0。 */
    amountCents: number;
    amountValid: boolean;
    accountName: string;
    onPickAccount: () => void;
    /** 日期按钮文案（如「今天」「09-08」）。 */
    dateLabel: string;
    onPickDate: () => void;
}

export function AmountPanel({
    note,
    onNoteChange,
    attachmentCount,
    onPickAttachments,
    time,
    onTimeChange,
    expression,
    amountCents,
    amountValid,
    accountName,
    onPickAccount,
    dateLabel,
    onPickDate,
}: AmountPanelProps) {
    const { t } = useTranslation();
    return (
        <div className="flex flex-col gap-2 px-3 pt-2 pb-1.5">
            {/* 第一行：附件 / 日期 / 时间 / 备注（日期在时间左侧；备注一直延伸到屏幕右侧） */}
            <div className="flex items-center gap-1.5">
                <button
                    type="button"
                    onClick={onPickAttachments}
                    aria-label={t('add.addAttachment')}
                    className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-inset text-text-secondary active:bg-muted"
                >
                    <AppIcon name={UI_ICONS.camera} size={17} />
                    {attachmentCount > 0 ? (
                        <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-pill bg-brand px-1 text-[10px] font-semibold text-white">
                            {attachmentCount}
                        </span>
                    ) : null}
                </button>

                <button
                    type="button"
                    onClick={onPickDate}
                    aria-label={t('add.pickDate')}
                    className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border-0 bg-inset px-1.5 text-[11.5px] text-text-secondary active:bg-muted"
                >
                    <AppIcon name={UI_ICONS.calendarToday} size={13} />
                    <span className="tabular-nums">{dateLabel}</span>
                </button>

                <TimePicker
                    hours={time.hours}
                    minutes={time.minutes}
                    onChange={onTimeChange}
                    variant="field"
                    side="top"
                    align="start"
                    aria-label={t('add.pickTime')}
                    className="h-8 shrink-0 gap-1 rounded-md border-0 bg-inset px-1.5 text-[11.5px] text-text-secondary"
                />

                <div className="relative min-w-0 flex-1">
                    <input
                        value={note}
                        onChange={(event) => onNoteChange(event.target.value)}
                        maxLength={64}
                        placeholder={t('add.noteOptional')}
                        aria-label={t('add.note')}
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
                            aria-label={t('add.clearNote')}
                            className="absolute top-1/2 right-1.5 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-text-tertiary active:bg-muted"
                        >
                            <AppIcon name={UI_ICONS.close} size={13} />
                        </button>
                    ) : null}
                </div>
            </div>

            {/* 第二行：账户（左） + 金额计算（表达式在总额左侧） */}
            <div className="flex items-center justify-between gap-2">
                <button
                    type="button"
                    onClick={onPickAccount}
                    className="inline-flex h-7 min-w-0 items-center gap-1 rounded-pill bg-inset px-2.5 text-[11.5px] text-text-secondary active:bg-muted"
                >
                    <AppIcon name={UI_ICONS.assets} size={13} className="shrink-0" />
                    <span className="truncate">{accountName}</span>
                    <AppIcon name={UI_ICONS.chevronDown} size={12} className="shrink-0" />
                </button>

                <div className="flex shrink-0 items-baseline gap-1.5">
                    <span
                        className={cn(
                            'max-w-[40vw] truncate text-[10.5px] text-text-tertiary tabular-nums',
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
                </div>
            </div>
        </div>
    );
}

export default AmountPanel;
