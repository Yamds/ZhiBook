// 数字键盘（BRD FR-ADD-13）：左三列为数字，右侧一列为「日期 / + / − / 完成」。
//
//   7 8 9 | 日期
//   4 5 6 | +
//   1 2 3 | −
//   · 0 ⌫ | 完成
//
// 按键规则（最多 2 位小数、`.` 只能一次、运算符不打头）全部在
// `core/domain/money.tryAppendKeypadKey` 里，这里只负责画与转发。

import type { KeypadKey } from '../../core/domain/money';
import { UI_ICONS } from '../../core/design/icons';
import { AppIcon } from '../../shared/ui/AppIcon';
import { cn } from '../../shared/utils/cn';

const DIGIT_ROWS: ReadonlyArray<ReadonlyArray<KeypadKey>> = [
    ['7', '8', '9'],
    ['4', '5', '6'],
    ['1', '2', '3'],
];

const KEY_CLASS =
    'flex h-[52px] items-center justify-center rounded-md text-[26px] font-semibold text-text tabular-nums active:bg-inset';
const OPERATOR_CLASS =
    'flex h-[52px] items-center justify-center rounded-md text-[28px] font-medium text-text tabular-nums active:bg-inset';

export interface KeypadProps {
    /** 日期键上的文案（如「今天」「09-08」）。 */
    dateLabel: string;
    /** 金额 + 分类是否都就绪（只影响「完成」的视觉强调，点击仍会给提示）。 */
    canSubmit: boolean;
    submitting: boolean;
    onKey: (key: KeypadKey) => void;
    onPickDate: () => void;
    onSubmit: () => void;
}

export function Keypad({
    dateLabel,
    canSubmit,
    submitting,
    onKey,
    onPickDate,
    onSubmit,
}: KeypadProps) {
    return (
        <div className="flex shrink-0 items-stretch gap-1 px-3 pt-1.5 pb-1">
            <div className="grid flex-1 grid-cols-3 gap-1">
                {DIGIT_ROWS.map((row) => (
                    <Row key={row.join('')} keys={row} onKey={onKey} />
                ))}
                <button
                    type="button"
                    className={KEY_CLASS}
                    onClick={() => onKey('.')}
                    aria-label="小数点"
                >
                    ·
                </button>
                <button type="button" className={KEY_CLASS} onClick={() => onKey('0')}>
                    0
                </button>
                <button
                    type="button"
                    className={KEY_CLASS}
                    onClick={() => onKey('backspace')}
                    aria-label="退格"
                >
                    <AppIcon name={UI_ICONS.backspace} size={22} />
                </button>
            </div>

            <div className="grid w-[86px] shrink-0 grid-rows-4 gap-1">
                <button
                    type="button"
                    onClick={onPickDate}
                    className="flex flex-col items-center justify-center rounded-md bg-inset px-1 text-[12.5px] font-medium text-text-secondary active:bg-muted"
                >
                    <AppIcon name={UI_ICONS.calendarToday} size={16} className="mb-0.5" />
                    <span className="max-w-full truncate tabular-nums">{dateLabel}</span>
                </button>
                <button type="button" className={OPERATOR_CLASS} onClick={() => onKey('+')}>
                    +
                </button>
                <button type="button" className={OPERATOR_CLASS} onClick={() => onKey('-')}>
                    −
                </button>
                <button
                    type="button"
                    onClick={onSubmit}
                    disabled={submitting}
                    className={cn(
                        'flex items-center justify-center rounded-md text-[17px] font-semibold',
                        canSubmit
                            ? 'bg-brand text-white shadow-card active:opacity-90'
                            : 'bg-inset text-text-disabled active:bg-muted',
                        submitting && 'opacity-60',
                    )}
                >
                    {submitting ? '保存中' : '完成'}
                </button>
            </div>
        </div>
    );
}

function Row({ keys, onKey }: { keys: ReadonlyArray<KeypadKey>; onKey: (key: KeypadKey) => void }) {
    return (
        <>
            {keys.map((key) => (
                <button key={key} type="button" className={KEY_CLASS} onClick={() => onKey(key)}>
                    {key}
                </button>
            ))}
        </>
    );
}

export default Keypad;
