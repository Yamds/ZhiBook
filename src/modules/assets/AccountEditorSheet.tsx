// 账户编辑器（FR-AST-7 / FR-AST-8）：名称 + 类型（资产 / 负债）+ 图标 + 颜色 + 初始余额。
//
// 余额口径（BRD Q2 细则）：资产账户存「持有金额」，负债账户存「欠款量级」，都用正数；
// 后端校验允许到单笔上限，也允许负数（透支 / 多还款），输入解析走 `parseBalanceCents`。

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { THEME_COLOR_TOKEN, categoryColors } from '../../core/design/categoryColor';
import { toIconName, type IconName } from '../../core/design/icons';
import { formatCents } from '../../core/domain/money';
import type { Account, AccountKind } from '../../core/ipc/types';
import { CATEGORY_VISUAL_TOKENS, useThemeTokens } from '../../hooks/theme/useThemeTokens';
import { BottomSheet } from '../../shared/ui/BottomSheet';
import { ColorSwatchRow } from '../../shared/ui/ColorSwatchRow';
import { IconPicker } from '../../shared/ui/IconPicker';
import { SegmentedControl } from '../../shared/ui/SegmentedControl';
import { AppIcon } from '../../shared/ui/AppIcon';
import { cn } from '../../shared/utils/cn';
import { ACCOUNT_NAME_MAX, balanceInputValue, parseBalanceCents } from './assetsPage.logic';

export interface AccountDraft {
    kind: AccountKind;
    name: string;
    iconName: IconName;
    color: string;
    initialBalanceCents: number;
}

export interface AccountEditorSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** null = 新建。 */
    account: Account | null;
    /** 新建时的默认类型（从对应分组的「+」进来时带上）。 */
    defaultKind?: AccountKind;
    busy?: boolean;
    /** 后端错误（重名等）：展示在表单里。 */
    errorMessage?: string | null;
    onSubmit: (draft: AccountDraft) => void;
    onRequestDelete?: () => void;
}

const DEFAULT_ICON: IconName = 'mdi:wallet-outline';

/** 账户类型选项（文案在 `assets.accountKind.*`）。 */
const KIND_ITEMS = [
    { value: 'asset' as const, labelKey: 'assets.accountKind.asset' },
    { value: 'liability' as const, labelKey: 'assets.accountKind.liability' },
];

export function AccountEditorSheet({
    open,
    onOpenChange,
    account,
    defaultKind = 'asset',
    busy = false,
    errorMessage,
    onSubmit,
    onRequestDelete,
}: AccountEditorSheetProps) {
    const { t } = useTranslation();
    const { brand, surface } = useThemeTokens(CATEGORY_VISUAL_TOKENS);

    const [kind, setKind] = useState<AccountKind>(defaultKind);
    const [name, setName] = useState('');
    const [iconName, setIconName] = useState<IconName>(DEFAULT_ICON);
    const [color, setColor] = useState<string>(THEME_COLOR_TOKEN);
    const [balanceText, setBalanceText] = useState('');

    useEffect(() => {
        if (!open) return;
        setKind(account?.kind ?? defaultKind);
        setName(account?.name ?? '');
        setIconName(toIconName(account?.iconName ?? DEFAULT_ICON));
        setColor(account?.color ?? THEME_COLOR_TOKEN);
        setBalanceText(balanceInputValue(account?.initialBalanceCents ?? 0));
    }, [open, account, defaultKind]);

    const trimmed = name.trim();
    const nameLength = [...trimmed].length;
    const nameValid = nameLength >= 1 && nameLength <= ACCOUNT_NAME_MAX;
    const balanceCents = parseBalanceCents(balanceText);
    const balanceValid = balanceCents !== null;
    const canSubmit = nameValid && balanceValid && !busy;
    const palette = useMemo(() => categoryColors(color, brand, surface), [color, brand, surface]);

    return (
        <BottomSheet
            open={open}
            onOpenChange={onOpenChange}
            title={account ? t('assets.editAccount') : t('assets.newAccount')}
            description={t('assets.accountSheetDesc')}
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
                            maxLength={ACCOUNT_NAME_MAX}
                            placeholder={t('assets.accountNamePlaceholder')}
                            aria-label={t('assets.accountName')}
                            className={cn(
                                'h-9 w-full rounded-md border bg-field px-2.5 text-[14px] text-text',
                                'placeholder:text-text-disabled focus-visible:outline-none',
                                nameValid || trimmed === ''
                                    ? 'border-border-subtle focus-visible:border-brand'
                                    : 'border-danger',
                            )}
                        />
                        <p className="mt-1 text-[11px] text-text-tertiary">
                            {trimmed === '' ? t('common.required') : t('add.nameLengthCounter', { current: nameLength, max: ACCOUNT_NAME_MAX })}
                        </p>
                    </div>
                </div>

                <section className="flex flex-col gap-1.5">
                    <h3 className="text-[12px] font-medium text-text">{t('assets.type')}</h3>
                    <SegmentedControl
                        items={KIND_ITEMS.map((item) => ({ value: item.value, label: t(item.labelKey) }))}
                        value={kind}
                        onChange={setKind}
                        ariaLabel={t('assets.accountType')}
                    />
                    <p className="text-[11px] leading-relaxed text-text-tertiary">
                        {kind === 'asset'
                            ? t('assets.assetKindHint')
                            : t('assets.liabilityKindHint')}
                    </p>
                </section>

                <section className="flex flex-col gap-1.5">
                    <h3 className="text-[12px] font-medium text-text">{t('assets.initialBalance')}</h3>
                    <div
                        className={cn(
                            'flex h-10 items-center gap-1.5 rounded-md border bg-field px-2.5',
                            balanceValid ? 'border-border-subtle' : 'border-danger',
                        )}
                    >
                        <span className="text-[13px] text-text-tertiary">¥</span>
                        <input
                            value={balanceText}
                            onChange={(event) => setBalanceText(event.target.value)}
                            inputMode="decimal"
                            placeholder="0.00"
                            aria-label={t('assets.initialBalance')}
                            className="min-w-0 flex-1 bg-transparent text-[14px] tabular-nums text-text placeholder:text-text-disabled focus:outline-none"
                        />
                    </div>
                    <p className="text-[11px] text-text-tertiary">
                        {!balanceValid
                            ? t('assets.balanceFormatInvalid')
                            : kind === 'liability'
                              ? t('assets.debtScale', { amount: formatCents(balanceCents) })
                              : t('assets.holdingAmount', { amount: formatCents(balanceCents) })}
                    </p>
                </section>

                <section className="flex flex-col gap-1.5">
                    <h3 className="text-[12px] font-medium text-text">{t('add.color')}</h3>
                    <ColorSwatchRow value={color} onChange={setColor} />
                </section>

                <section className="flex flex-col gap-1.5">
                    <h3 className="text-[12px] font-medium text-text">{t('add.icon')}</h3>
                    <IconPicker value={iconName} onChange={setIconName} columns={6} />
                </section>

                {errorMessage ? (
                    <p className="rounded-md bg-danger-soft px-2.5 py-1.5 text-[12px] text-danger">
                        {errorMessage}
                    </p>
                ) : null}

                <div className="flex items-center gap-2">
                    {account && onRequestDelete ? (
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
                        disabled={!canSubmit}
                        onClick={() =>
                            onSubmit({
                                kind,
                                name: trimmed,
                                iconName,
                                color,
                                initialBalanceCents: balanceCents ?? 0,
                            })
                        }
                        className={cn(
                            'h-10 flex-1 rounded-md text-[14px] font-semibold',
                            canSubmit ? 'bg-brand text-white shadow-card active:opacity-90' : 'bg-inset text-text-disabled',
                        )}
                    >
                        {busy ? t('common.saving') : account ? t('add.saveChanges') : t('assets.createAccount')}
                    </button>
                </div>
            </div>
        </BottomSheet>
    );
}

export default AccountEditorSheet;
