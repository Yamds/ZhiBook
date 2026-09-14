// 固定收支的分类选择：4 列宫格（与添加页同一套分类色）。

import { categoryColors } from '../../../core/design/categoryColor';
import { toIconName } from '../../../core/design/icons';
import type { Category, EntryKind } from '../../../core/ipc/types';
import { CATEGORY_VISUAL_TOKENS, useThemeTokens } from '../../../hooks/theme/useThemeTokens';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { BottomSheet } from '../../../shared/ui/BottomSheet';
import { cn } from '../../../shared/utils/cn';

export interface RecurringCategorySheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    kind: EntryKind;
    categories: ReadonlyArray<Category>;
    value: string;
    onSelect: (categoryId: string) => void;
}

export function RecurringCategorySheet({
    open,
    onOpenChange,
    kind,
    categories,
    value,
    onSelect,
}: RecurringCategorySheetProps) {
    const { brand, surface } = useThemeTokens(CATEGORY_VISUAL_TOKENS);

    return (
        <BottomSheet
            open={open}
            onOpenChange={onOpenChange}
            title={kind === 'expense' ? '选择支出分类' : '选择收入分类'}
        >
            <div className="grid grid-cols-4 gap-x-1 gap-y-2">
                {categories.map((category) => {
                    const colors = categoryColors(category.color, brand, surface);
                    const selected = category.id === value;
                    return (
                        <button
                            key={category.id}
                            type="button"
                            onClick={() => {
                                onSelect(category.id);
                                onOpenChange(false);
                            }}
                            className="flex flex-col items-center gap-1.5 rounded-md px-0.5 py-2 active:bg-inset"
                        >
                            <span
                                className="flex h-11 w-11 items-center justify-center rounded-full"
                                style={{
                                    background: colors.background,
                                    boxShadow: selected
                                        ? `inset 0 0 0 2px ${colors.foreground}`
                                        : undefined,
                                }}
                            >
                                <AppIcon
                                    name={toIconName(category.iconName)}
                                    size={22}
                                    color={colors.foreground}
                                />
                            </span>
                            <span
                                className={cn(
                                    'text-[11.5px] leading-tight',
                                    selected ? 'font-medium text-text' : 'text-text-secondary',
                                )}
                            >
                                {category.name}
                            </span>
                        </button>
                    );
                })}
            </div>
        </BottomSheet>
    );
}

export default RecurringCategorySheet;
