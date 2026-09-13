// 分类编辑器（BRD FR-ADD-6 / T4.4）：名称 + 图标 + 颜色，新建与编辑共用。
//
// 颜色规则（BRD 3.5）：默认「跟随主题」，也可从内置调色板挑一个固定色；
// 背景色由前景色派生（core/design/categoryColor），这里实时预览。

import { useEffect, useMemo, useState } from 'react';
import {
    CATEGORY_COLOR_PALETTE,
    THEME_COLOR_TOKEN,
    categoryColors,
    isFixedColor,
} from '../../core/design/categoryColor';
import { UI_ICONS, toIconName, type IconName } from '../../core/design/icons';
import { useThemeTokens } from '../../hooks/theme/useThemeTokens';
import type { Category, EntryKind } from '../../core/ipc/types';
import { AppIcon } from '../../shared/ui/AppIcon';
import { BottomSheet } from '../../shared/ui/BottomSheet';
import { IconPicker } from '../../shared/ui/IconPicker';
import { cn } from '../../shared/utils/cn';

/** 分类名上限（与 Rust `validate::CATEGORY_NAME_MAX` 一致）。 */
export const CATEGORY_NAME_MAX = 8;

export interface CategoryDraft {
    name: string;
    iconName: IconName;
    color: string;
}

export interface CategoryEditorSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    kind: EntryKind;
    /** null = 新建。 */
    category: Category | null;
    busy?: boolean;
    /** 名称已存在等后端错误（展示在表单里）。 */
    errorMessage?: string | null;
    onSubmit: (draft: CategoryDraft) => void;
    onRequestDelete?: () => void;
}

const DEFAULT_ICON: IconName = 'mdi:shape-outline';

export function CategoryEditorSheet({
    open,
    onOpenChange,
    kind,
    category,
    busy = false,
    errorMessage,
    onSubmit,
    onRequestDelete,
}: CategoryEditorSheetProps) {
    const { brand, surface } = useThemeTokens({
        brand: { name: '--brand-500', fallback: '#ff6b3d' },
        surface: { name: '--surface-card', fallback: '#ffffff' },
    });

    const [name, setName] = useState('');
    const [iconName, setIconName] = useState<IconName>(DEFAULT_ICON);
    const [color, setColor] = useState<string>(THEME_COLOR_TOKEN);

    useEffect(() => {
        if (!open) return;
        setName(category?.name ?? '');
        setIconName(toIconNameOrNull(category?.iconName) ?? DEFAULT_ICON);
        setColor(category?.color ?? THEME_COLOR_TOKEN);
    }, [open, category]);

    const trimmed = name.trim();
    const nameLength = [...trimmed].length;
    const nameValid = nameLength >= 1 && nameLength <= CATEGORY_NAME_MAX;
    const palette = useMemo(() => categoryColors(color, brand, surface), [color, brand, surface]);

    return (
        <BottomSheet
            open={open}
            onOpenChange={onOpenChange}
            title={category ? '编辑分类' : '新增分类'}
            description={kind === 'expense' ? '支出分类' : '收入分类'}
            maxHeightRatio={0.92}
        >
            <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 rounded-md bg-inset p-3">
                    <span
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                        style={{ background: palette.background, color: palette.foreground }}
                    >
                        <AppIcon name={iconName} size={22} />
                    </span>
                    <div className="min-w-0 flex-1">
                        <input
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            maxLength={CATEGORY_NAME_MAX}
                            placeholder="分类名称"
                            aria-label="分类名称"
                            className={cn(
                                'h-9 w-full rounded-md border bg-field px-2.5 text-[14px] text-text',
                                'placeholder:text-text-disabled focus-visible:outline-none',
                                nameValid || trimmed === ''
                                    ? 'border-border-subtle focus-visible:border-brand'
                                    : 'border-danger',
                            )}
                        />
                        <p className="mt-1 text-[11px] text-text-tertiary">
                            {trimmed === '' ? '必填' : `${nameLength} / ${CATEGORY_NAME_MAX} 字`}
                        </p>
                    </div>
                </div>

                <section className="flex flex-col gap-1.5">
                    <h3 className="text-[12px] font-medium text-text">颜色</h3>
                    <div className="flex flex-wrap items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => setColor(THEME_COLOR_TOKEN)}
                            className={cn(
                                'inline-flex h-8 items-center gap-1.5 rounded-pill px-2.5 text-[11.5px]',
                                'active:opacity-80',
                                color === THEME_COLOR_TOKEN
                                    ? 'bg-brand-soft font-medium text-brand'
                                    : 'bg-inset text-text-secondary',
                            )}
                        >
                            <span
                                className="inline-block h-4 w-4 rounded-full"
                                style={{ background: brand }}
                            />
                            跟随主题
                        </button>
                        {CATEGORY_COLOR_PALETTE.map((swatch) => (
                            <button
                                key={swatch}
                                type="button"
                                aria-label={`使用颜色 ${swatch}`}
                                onClick={() => setColor(swatch)}
                                className={cn(
                                    'inline-flex h-8 w-8 items-center justify-center rounded-full active:opacity-80',
                                    color === swatch && 'ring-2 ring-brand ring-offset-2 ring-offset-surface',
                                )}
                                style={{ background: swatch }}
                            >
                                {color === swatch ? (
                                    <AppIcon name={UI_ICONS.check} size={14} color="#ffffff" />
                                ) : null}
                            </button>
                        ))}
                    </div>
                    {!isFixedColor(color) && color !== THEME_COLOR_TOKEN ? (
                        <p className="text-[11px] text-danger">颜色值不合法，已回退为跟随主题</p>
                    ) : null}
                </section>

                <section className="flex flex-col gap-1.5">
                    <h3 className="text-[12px] font-medium text-text">图标</h3>
                    <IconPicker value={iconName} onChange={setIconName} columns={6} />
                </section>

                {errorMessage ? (
                    <p className="rounded-md bg-danger-soft px-2.5 py-1.5 text-[12px] text-danger">
                        {errorMessage}
                    </p>
                ) : null}

                <div className="flex items-center gap-2">
                    {category && onRequestDelete ? (
                        <button
                            type="button"
                            onClick={onRequestDelete}
                            className="h-10 rounded-md bg-inset px-3 text-[13px] font-medium text-danger active:bg-muted"
                        >
                            删除
                        </button>
                    ) : null}
                    <button
                        type="button"
                        disabled={!nameValid || busy}
                        onClick={() => onSubmit({ name: trimmed, iconName, color })}
                        className={cn(
                            'h-10 flex-1 rounded-md text-[14px] font-semibold',
                            nameValid && !busy
                                ? 'bg-brand text-white shadow-card active:opacity-90'
                                : 'bg-inset text-text-disabled',
                        )}
                    >
                        {busy ? '保存中' : category ? '保存修改' : '创建分类'}
                    </button>
                </div>
            </div>
        </BottomSheet>
    );
}

function toIconNameOrNull(value: string | undefined): IconName | null {
    if (!value) return null;
    return toIconName(value);
}

export default CategoryEditorSheet;
