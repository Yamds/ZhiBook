// 添加页占位（**临时**）。
//
// P4 会把它替换成真正的记账界面；在那之前，这里作为 P2 通用组件的预览台：
// 图标系统、周期选择器、金额格式、图表、分段控件、底部弹层、长按都能当场试。
//
// 每个组件都只在这里做展示，不承载业务逻辑。

import { useState } from 'react';
import {
    BottomSheet,
    Button,
    EmptyState,
    IconPicker,
    PeriodSelector,
    SegmentedControl,
} from '../../shared/ui';
import { AppIcon } from '../../shared/ui/AppIcon';
import { DisparityBar, DonutChart, LineChart, RankRow } from '../../shared/charts';
import { DEFAULT_CATEGORY_ICONS, UI_ICONS, type IconName } from '../../core/design/icons';
import { formatMoney, formatSignedMoney, parseAmountExpression } from '../../core/domain/money';
import { daysOfMonth, shiftMonth, todayDate } from '../../core/domain/date';
import { useLongPress } from '../../hooks/ui/useLongPress';
import { pushInfoBar } from '../../hooks/ui/globalInfoBarStore';

const UI_ICON_SAMPLE: IconName[] = [
    'mdi:noodles', 'mdi:cart-outline', 'mdi:bus', 'mdi:coffee', 'mdi:paw',
    'mdi:pill', 'mdi:finance', 'mdi:tshirt-crew-outline', 'mdi:home-outline', 'mdi:airplane',
];

const DEMO_SLICES = [
    { key: 'food', label: '餐饮', value: 75000, color: 'var(--brand-500)' },
    { key: 'traffic', label: '交通', value: 14600, color: 'var(--state-info)' },
    { key: 'daily', label: '日用', value: 6200, color: 'var(--state-success)' },
    { key: 'other', label: '其它', value: 3100, color: 'var(--state-warning)' },
];

const DEMO_LINE = Array.from({ length: 30 }, (_, index) => ({
    key: `d${index + 1}`,
    label: String(index + 1).padStart(2, '0'),
    value: Math.round(80 * Math.sin(index / 3) + (index === 8 ? 320 : 0) + 60),
}));

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
    return (
        <section className="rounded-lg border border-border-subtle bg-surface p-3 shadow-card">
            <header className="mb-2.5">
                <h2 className="text-[13px] font-semibold text-text">{title}</h2>
                {hint ? <p className="mt-0.5 text-[11px] text-text-tertiary">{hint}</p> : null}
            </header>
            {children}
        </section>
    );
}

export function AddPage() {
    const today = todayDate();
    const [icon, setIcon] = useState<IconName>('mdi:noodles');
    const [kind, setKind] = useState<'expense' | 'income'>('expense');
    const [year, setYear] = useState(today.year);
    const [month, setMonth] = useState(today.month);
    const [day, setDay] = useState(today.day);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [lineIndex, setLineIndex] = useState<number | null>(null);
    const [donutKey, setDonutKey] = useState<string | null>(null);

    const handleLongPress = () =>
        pushInfoBar({ key: 'long-press-demo', tone: 'info', title: '长按生效', content: 'P4 会用它进入分类编辑模式' });

    const longPressBind = useLongPress({ onLongPress: handleLongPress });

    return (
        <section className="flex w-full flex-col gap-3 pb-2 pt-1">
            <p className="px-0.5 text-[11.5px] leading-relaxed text-text-tertiary">
                当前是 P2 组件预览（临时）：P4 会把这里换成真正的记账界面。
            </p>

            <Section title="图标系统" hint="全部来自 Iconify（MDI 精选子集，离线渲染，可换色）">
                <div className="flex flex-wrap items-center gap-2">
                    {UI_ICON_SAMPLE.map((name) => (
                        <span key={name} className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-inset text-text-secondary">
                            <AppIcon name={name} size={18} />
                        </span>
                    ))}
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-brand-soft text-brand">
                        <AppIcon name={icon} size={18} />
                    </span>
                </div>
                <div className="mt-3">
                    <IconPicker value={icon} onChange={setIcon} />
                </div>
                <p className="mt-2 text-[11px] text-text-tertiary">
                    内置分类图标（支出）：{[...Object.values(DEFAULT_CATEGORY_ICONS.expense)].slice(0, 8).map((name) => (
                        <AppIcon key={name} name={name} size={14} className="mx-0.5 inline-flex align-middle text-text-secondary" />
                    ))}
                </p>
            </Section>

            <Section title="周期选择器" hint="年 3 位 / 月 5 位 / 日 5 位，左右渐隐、吸附、边界留空">
                <PeriodSelector
                    values={Array.from({ length: 6 }, (_, index) => today.year - 5 + index)}
                    value={year}
                    onChange={setYear}
                    visible={3}
                    unit="年"
                    ariaLabel="选择年份"
                />
                <PeriodSelector
                    values={Array.from({ length: 12 }, (_, index) => index + 1)}
                    value={month}
                    onChange={(next) => {
                        setMonth(next);
                        const max = daysOfMonth(year, next).length;
                        if (day > max) setDay(max);
                    }}
                    unit="月"
                    ariaLabel="选择月份"
                />
                <PeriodSelector
                    values={daysOfMonth(year, month)}
                    value={day}
                    onChange={setDay}
                    unit="日"
                    ariaLabel="选择日期"
                />
                <p className="mt-1 text-center text-[11.5px] text-text-tertiary tabular-nums">
                    {year} 年 {month} 月 {day} 日 · 上个月 {(() => { const prev = shiftMonth(year, month, -1); return `${prev.year}-${prev.month}`; })()}
                </p>
            </Section>

            <Section title="金额格式与键盘表达式" hint="内部按分存储，展示统一 ¥ x,xxx.xx">
                <dl className="grid grid-cols-2 gap-1.5 text-[12.5px]">
                    <dt className="text-text-tertiary">支出</dt>
                    <dd className="text-right tabular-nums text-text">{formatSignedMoney(34450, 'expense')}</dd>
                    <dt className="text-text-tertiary">收入</dt>
                    <dd className="text-right tabular-nums text-text">{formatSignedMoney(100000, 'income')}</dd>
                    <dt className="text-text-tertiary">负结余</dt>
                    <dd className="text-right tabular-nums text-text">{formatMoney(-89600)}</dd>
                    <dt className="text-text-tertiary">表达式 12+3.5</dt>
                    <dd className="text-right tabular-nums text-text">
                        {(() => { const parsed = parseAmountExpression('12+3.5'); return parsed.ok ? formatMoney(parsed.cents) : '解析失败'; })()}
                    </dd>
                </dl>
            </Section>

            <Section title="分段控件" hint="支出 / 收入、结余 / 支出 / 收入 的口径切换">
                <SegmentedControl
                    items={[{ value: 'expense', label: '支出' }, { value: 'income', label: '收入' }]}
                    value={kind}
                    onChange={setKind}
                    ariaLabel="收支切换"
                />
            </Section>

            <Section title="图表" hint="自绘 SVG：环形图（可点扇区）、折线图（可点选日期）、排行条、差距条">
                <div className="flex flex-wrap items-center gap-3">
                    <DonutChart
                        slices={DEMO_SLICES}
                        activeKey={donutKey}
                        onSelect={(key) => setDonutKey((prev) => (prev === key ? null : key))}
                        centerLabel="本月支出"
                        centerValue={formatMoney(DEMO_SLICES.reduce((sum, slice) => sum + slice.value, 0))}
                    />
                    <div className="min-w-[150px] flex-1 space-y-1.5">
                        {DEMO_SLICES.map((slice) => (
                            <RankRow
                                key={slice.key}
                                leading={<span className="inline-flex h-7 w-7 items-center justify-center rounded-full" style={{ background: slice.color, opacity: 0.16 }}>
                                    <AppIcon name={'mdi:circle'} size={10} color={slice.color} />
                                </span>}
                                title={slice.label}
                                subtitle={`${((slice.value / DEMO_SLICES.reduce((sum, item) => sum + item.value, 0)) * 100).toFixed(1)}%`}
                                trailing={formatMoney(slice.value)}
                                ratio={slice.value / DEMO_SLICES[0]!.value}
                                color={slice.color}
                            />
                        ))}
                    </div>
                </div>
                <div className="mt-3">
                    <LineChart
                        points={DEMO_LINE}
                        activeIndex={lineIndex}
                        onActiveIndexChange={setLineIndex}
                        formatValue={(value) => formatMoney(value * 100)}
                    />
                </div>
                <div className="mt-2 space-y-1.5">
                    <DisparityBar label="总资产" valueCents={523000} maxCents={600000} tone="asset" />
                    <DisparityBar label="负债" valueCents={78000} maxCents={600000} tone="liability" />
                </div>
            </Section>

            <Section title="交互件" hint="长按（500ms）、底部弹层、空态">
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        {...longPressBind}
                        className="h-9 rounded-md bg-inset px-3 text-[12.5px] font-medium text-text-secondary active:bg-muted"
                    >
                        长按我试试
                    </button>
                    <Button size="sm" variant="secondary" onClick={() => setSheetOpen(true)}>打开底部弹层</Button>
                    <span className="inline-flex items-center gap-1 text-[11px] text-text-tertiary">
                        <AppIcon name={UI_ICONS.info} size={13} /> 长按 500ms 触发
                    </span>
                </div>
                <EmptyState
                    size="compact"
                    icon={UI_ICONS.calendar}
                    title="这是空态样式"
                    description="列表 / 图表 / 统计卡片没有数据时统一用它"
                />
            </Section>

            <BottomSheet
                open={sheetOpen}
                onOpenChange={setSheetOpen}
                title="底部弹层"
                description="P4 的分类编辑器、账户选择都会用它"
            >
                <p className="text-[12.5px] leading-relaxed text-text-secondary">
                    点击遮罩 / 按返回键 / 下拉手柄都能关闭；动效跟随设置里的「动画与体感」开关。
                </p>
                <div className="mt-3">
                    <IconPicker value={icon} onChange={setIcon} columns={5} />
                </div>
                <Button className="mt-3 w-full" variant="primary" onClick={() => setSheetOpen(false)}>知道了</Button>
            </BottomSheet>
        </section>
    );
}

export default AddPage;
