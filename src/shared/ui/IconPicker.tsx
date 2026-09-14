// 图标选择器：中文别名 + 英文名搜索，按分组浏览。
//
// 数据来自 `scripts/build-icon-subset.mjs` 生成的选择器目录（ICON_CATALOG），
// 所以选择器里出现的图标一定在离线子集里，选了就一定能渲染。
//
// 使用场景：新增 / 编辑分类时挑图标（P4 的分类编辑器）。

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppIcon } from './AppIcon';
import { ICON_CATALOG, ICON_GROUPS, type IconName } from '../../core/design/icons';
import { cn } from '../utils/cn';

/** 「全部」筛选值：不是真实分组 id，单独一个常量避免与分组 id 撞车。 */
const ALL_GROUPS = '__all__';

/** 图标分组 id → i18n key（分组 id 由 `scripts/icon-catalog.mjs` 提供）。 */
function groupLabelKey(groupId: string): string {
    return `iconGroup.${groupId}`;
}

export interface IconPickerProps {
    value: IconName;
    onChange: (name: IconName) => void;
    /** 网格列数，默认 6。 */
    columns?: number;
    className?: string;
}

/** 图标名去掉集合前缀，方便搜索（mdi:noodles → noodles）。 */
function shortName(name: IconName): string {
    const index = name.indexOf(':');
    return index >= 0 ? name.slice(index + 1) : name;
}

function matches(
    name: IconName,
    groupLabel: string,
    aliases: readonly string[],
    query: string,
): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    if (shortName(name).toLowerCase().includes(q)) return true;
    if (groupLabel.toLowerCase().includes(q)) return true;
    return aliases.some((alias) => alias.toLowerCase().includes(q));
}

export function IconPicker({ value, onChange, columns = 6, className }: IconPickerProps) {
    const { t } = useTranslation();
    const [query, setQuery] = useState('');
    const [group, setGroup] = useState<string>(ALL_GROUPS);

    const results = useMemo(() => {
        return ICON_CATALOG.filter((entry) => {
            if (group !== ALL_GROUPS && entry.group !== group) return false;
            return matches(entry.name, t(groupLabelKey(entry.group)), entry.aliases, query);
        });
    }, [group, query, t]);

    const groups = useMemo(
        () => [
            { id: ALL_GROUPS, label: t('shared.iconSearchAll') },
            ...ICON_GROUPS.map((id) => ({ id, label: t(groupLabelKey(id)) })),
        ],
        [t],
    );

    return (
        <div className={cn('flex min-h-0 w-full flex-col gap-2.5', className)}>
            <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('shared.iconSearchPlaceholder')}
                aria-label={t('shared.iconSearchAria')}
                className={cn(
                    'h-8 w-full rounded-sm border border-border-subtle bg-field px-2.5 text-[12.5px] text-text',
                    'placeholder:text-text-disabled',
                    'focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30',
                )}
            />

            <div className="scrollbar-hide -mx-0.5 flex shrink-0 gap-1 overflow-x-auto px-0.5" data-no-swipe>
                {groups.map((item) => {
                    const selected = item.id === group;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => setGroup(item.id)}
                            aria-pressed={selected}
                            className={cn(
                                'h-[26px] shrink-0 rounded-pill px-2.5 text-[11.5px] font-medium transition-colors',
                                selected
                                    ? 'bg-brand text-white'
                                    : 'bg-inset text-text-tertiary active:bg-muted',
                            )}
                        >
                            {item.label}
                        </button>
                    );
                })}
            </div>

            <div
                className="scrollbar-hide min-h-[132px] overflow-y-auto overscroll-contain"
                style={{ maxHeight: 220 }}
            >
                {results.length === 0 ? (
                    <p className="py-6 text-center text-[12px] text-text-tertiary">{t('shared.iconNoMatch')}</p>
                ) : (
                    <div
                        className="grid gap-1"
                        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
                    >
                        {results.map((entry) => {
                            const selected = entry.name === value;
                            return (
                                <button
                                    key={entry.name}
                                    type="button"
                                    onClick={() => onChange(entry.name)}
                                    aria-pressed={selected}
                                    title={shortName(entry.name)}
                                    className={cn(
                                        'flex h-9 items-center justify-center rounded-sm transition-colors',
                                        selected
                                            ? 'bg-brand-soft text-brand ring-1 ring-brand'
                                            : 'text-text-secondary active:bg-inset',
                                    )}
                                >
                                    <AppIcon name={entry.name} size={18} />
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

export default IconPicker;
