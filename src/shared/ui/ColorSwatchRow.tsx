// 颜色选择行：默认「跟随主题」+ 内置调色板色块（BRD 3.5）。
//
// 分类编辑器（`modules/add/CategoryEditorSheet`）与账户编辑器（`modules/assets/AccountEditorSheet`）
// 用的是同一套规则，所以提到原子件层，避免两处各写一遍色板。

import { CATEGORY_COLOR_PALETTE, THEME_COLOR_TOKEN, isFixedColor } from '../../core/design/categoryColor';
import { UI_ICONS } from '../../core/design/icons';
import { useThemeTokens } from '../../hooks/theme/useThemeTokens';
import { cn } from '../utils/cn';
import { AppIcon } from './AppIcon';

export interface ColorSwatchRowProps {
    /** `theme` 或 `#RRGGBB`。 */
    value: string;
    onChange: (color: string) => void;
    className?: string;
}

export function ColorSwatchRow({ value, onChange, className }: ColorSwatchRowProps) {
    const { brand } = useThemeTokens({
        brand: { name: '--brand-500', fallback: '#ff6b3d' },
    });
    const invalid = !isFixedColor(value) && value !== THEME_COLOR_TOKEN;

    return (
        <div className={cn('flex flex-col gap-1.5', className)}>
            <div className="flex flex-wrap items-center gap-1.5">
                <button
                    type="button"
                    onClick={() => onChange(THEME_COLOR_TOKEN)}
                    className={cn(
                        'inline-flex h-8 items-center gap-1.5 rounded-pill px-2.5 text-[11.5px]',
                        'active:opacity-80',
                        value === THEME_COLOR_TOKEN
                            ? 'bg-brand-soft font-medium text-brand'
                            : 'bg-inset text-text-secondary',
                    )}
                >
                    <span className="inline-block h-4 w-4 rounded-full" style={{ background: brand }} />
                    跟随主题
                </button>
                {CATEGORY_COLOR_PALETTE.map((swatch) => (
                    <button
                        key={swatch}
                        type="button"
                        aria-label={`使用颜色 ${swatch}`}
                        onClick={() => onChange(swatch)}
                        className={cn(
                            'inline-flex h-8 w-8 items-center justify-center rounded-full active:opacity-80',
                            value === swatch && 'ring-2 ring-brand ring-offset-2 ring-offset-surface',
                        )}
                        style={{ background: swatch }}
                    >
                        {value === swatch ? (
                            <AppIcon name={UI_ICONS.check} size={14} color="#ffffff" />
                        ) : null}
                    </button>
                ))}
            </div>
            {invalid ? <p className="text-[11px] text-danger">颜色值不合法，已回退为跟随主题</p> : null}
        </div>
    );
}

export default ColorSwatchRow;
