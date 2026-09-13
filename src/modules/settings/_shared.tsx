// 设置页共享视觉组件。结构与源项目一致：纵向分组、左侧引导线、行间分隔、
// 主题缩略窗口预览、段选动效和速度滑块。

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '../../shared/ui';
import { AppIcon } from '../../shared/ui/AppIcon';
import { useMotion } from '../../hooks/preferences/useMotion';
import { UI_ICONS, type IconName } from '../../core/design/icons';
import { SegmentMotionIcon } from '../../shared/ui/motion';
import type { ThemeMode } from '../../core/design/themes';
import { THEME_GROUPS as THEME_GROUPS_FROM_REGISTRY } from '../../core/design/themes';
import { STARTUP_TABS, type StartupTab } from '../../core/domain/ui/startupTab';
import type { MotionLevel } from '../../core/design/motion';
import { MOTION_SPEED_DEFAULT, MOTION_SPEED_MAX, MOTION_SPEED_MIN, motionSpeedDisplayMultiplier } from '../../core/design/motion';
import type { RadiusStyle } from '../../core/design/radius';
import { RADIUS_LABELS } from '../../core/design/radius';

export function SettingsTabSections({ children }: { children: ReactNode }) {
    return <div className="flex w-full flex-col gap-14">{children}</div>;
}

function SettingsSectionHeader({ title, description }: { title: ReactNode; description?: ReactNode }) {
    return <div className="space-y-1.5"><div className="flex items-center gap-2.5"><span className="h-3.5 w-0.5 shrink-0 rounded-full bg-brand/45" aria-hidden /><h2 className="text-[13.5px] font-semibold leading-none tracking-tight text-text">{title}</h2></div>{description && <p className="pl-3 text-[12px] leading-relaxed text-text-tertiary">{description}</p>}</div>;
}

export function SettingsSection({ title, description, children, layout = 'fields' }: { title: ReactNode; description?: ReactNode; children: ReactNode; layout?: 'fields' | 'panel' }) {
    return <section className="space-y-4"><SettingsSectionHeader title={title} description={description} />{layout === 'panel' ? <div className="min-w-0">{children}</div> : <div className="border-l border-border-subtle/80 pl-4 sm:pl-5"><div className="flex flex-col divide-y divide-border-subtle/70">{children}</div></div>}</section>;
}

export function FieldRow({ label, description, isLast: _isLast, layout = 'inline', children }: { label: string; description?: ReactNode; isLast?: boolean; layout?: 'inline' | 'stacked'; children?: ReactNode }) {
    if (layout === 'stacked') return <div className="flex flex-col gap-2 py-5 first:pt-1 last:pb-1"><div className="space-y-1"><label className="block text-[13px] font-medium leading-snug text-text">{label}</label>{description && <p className="text-[12px] leading-relaxed text-text-tertiary">{description}</p>}</div>{children && <div>{children}</div>}</div>;
    return <div className="flex items-center justify-between gap-6 py-5 first:pt-1 last:pb-1"><div className="min-w-0 flex-1 space-y-1"><label className="block text-[13px] font-medium leading-snug text-text">{label}</label>{description && <p className="text-[12px] leading-relaxed text-text-tertiary">{description}</p>}</div>{children && <div className="flex shrink-0 items-center gap-2">{children}</div>}</div>;
}

interface ThemeItem { value: ThemeMode; label: string; canvas: string; sidebar: string; text: string; subtext: string; brand: string; accent: string; }
interface ThemeGroup { label: string; items: ReadonlyArray<ThemeItem>; }

/**
 * 主题预览表直接由注册表（`core/design/themes.ts`）推导：
 * 新主题只需在注册表里加一行 + 在 `tokens.css` 里加一个块，设置页自动出现。
 */
const THEME_GROUPS: ReadonlyArray<ThemeGroup> = THEME_GROUPS_FROM_REGISTRY.map((group) => ({
    label: group.label,
    items: group.items.map((theme) => ({
        value: theme.value,
        label: theme.label,
        canvas: theme.preview.canvas,
        sidebar: theme.preview.sidebar,
        text: theme.preview.text,
        subtext: theme.preview.subtext,
        brand: theme.preview.brand,
        accent: theme.preview.accent,
    })),
}));

function findThemeItem(value: ThemeMode): ThemeItem | undefined {
    for (const group of THEME_GROUPS) { const found = group.items.find((item) => item.value === value); if (found) return found; }
    return undefined;
}

export function ThemePicker({ value, onChange }: { value: ThemeMode; onChange: (next: ThemeMode) => void }) {
    const [open, setOpen] = useState(false);
    const current = findThemeItem(value);
    const motion = useMotion();
    const cardRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
    const setCardRef = useCallback((key: string) => (element: HTMLButtonElement | null) => { if (element) cardRefs.current.set(key, element); else cardRefs.current.delete(key); }, []);
    useEffect(() => { const cleanups: Array<() => void> = []; cardRefs.current.forEach((element) => { cleanups.push(motion.bindHover(element)); cleanups.push(motion.bindPress(element)); }); return () => cleanups.forEach((cleanup) => cleanup()); }, [motion.bindHover, motion.bindPress, open]);
    return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><button type="button" className="flex h-7 items-center gap-2 rounded-md bg-inset px-2.5 text-[12px] font-medium text-text transition-colors hover:bg-muted/50">{current && <span className="h-3.5 w-3.5 shrink-0 rounded-sm" style={{ background: current.brand, boxShadow: 'inset 0 0 0 0.5px rgba(128,128,128,0.15)' }} />}<span>{current?.label ?? value}</span><AppIcon name={UI_ICONS.chevronDown} size={12} className="text-text-tertiary" /></button></PopoverTrigger><PopoverContent side="bottom" align="start" sideOffset={6}><div className="flex max-h-[min(58vh,420px)] flex-col gap-3 overflow-y-auto overscroll-contain pr-0.5">{THEME_GROUPS.map((group) => <div key={group.label} className="space-y-1.5"><span className="text-[11px] font-medium tracking-wide text-text-tertiary">{group.label}</span><div className="grid grid-cols-4 gap-1.5">{group.items.map((item) => { const selected = value === item.value; return <button key={item.value} ref={setCardRef(item.value)} type="button" onClick={() => onChange(item.value)} className={'relative flex flex-col items-stretch gap-1 rounded-md p-1 transition-colors ' + (selected ? 'bg-surface' : 'hover:bg-muted/40')} style={selected ? { boxShadow: `inset 0 0 0 1px ${item.brand}44` } : undefined}><div className="relative h-9 w-full overflow-hidden rounded-[3px]" style={{ background: item.canvas, boxShadow: 'inset 0 0 0 0.5px rgba(128,128,128,0.1)' }}><div className="absolute inset-y-0 left-0 w-[30%]" style={{ background: item.sidebar }} /><div className="absolute inset-y-0 right-0 left-[30%] flex flex-col justify-center gap-[3px] px-1.5"><div className="h-[2.5px] w-[60%] rounded-full" style={{ background: item.text, opacity: 0.5 }} /><div className="h-[2.5px] w-[40%] rounded-full" style={{ background: item.subtext, opacity: 0.4 }} /><div className="mt-[1px] h-[4px] w-[32%] rounded-full" style={{ background: item.brand }} /></div><div className="absolute right-1 top-1 h-[4px] w-[4px] rounded-full" style={{ background: item.accent }} /></div><span className={'text-center text-[11px] font-semibold leading-tight ' + (selected ? 'text-text' : 'text-text-tertiary')}>{item.label}</span></button>; })}</div></div>)}</div></PopoverContent></Popover>;
}

export function MotionLevelSegment({ value, onChange, disabled }: { value: MotionLevel; onChange: (next: MotionLevel) => void; disabled?: boolean }) {
    const items: ReadonlyArray<{ value: MotionLevel; label: string; icon: IconName }> = [{ value: 'elegant', label: '优雅', icon: UI_ICONS.motionElegant }, { value: 'standard', label: '标准', icon: UI_ICONS.motionStandard }, { value: 'rich', label: '丰富', icon: UI_ICONS.motionRich }];
    return <div className={'flex h-7 items-center rounded-md bg-inset p-0.5 ' + (disabled ? 'pointer-events-none opacity-60' : '')}>{items.map((item) => { const selected = value === item.value; return <button key={item.value} type="button" onClick={() => onChange(item.value)} disabled={disabled} className={'flex h-6 items-center gap-1 rounded-sm px-2.5 text-[12px] font-medium transition-all ' + (selected ? 'border border-border/50 bg-surface text-text shadow-sm' : 'border border-transparent text-text-tertiary hover:text-text')}><SegmentMotionIcon icon={item.icon} selected={selected} segmentKey={`motion-level-${item.value}`} /><span>{item.label}</span></button>; })}</div>;
}

export function MotionSpeedSlider({ value, onChange, disabled }: { value: number; onChange: (next: number) => void; disabled?: boolean }) {
    return <div className="flex items-center gap-2"><input type="range" min={MOTION_SPEED_MIN} max={MOTION_SPEED_MAX} step={0.05} value={value} disabled={disabled} onChange={(event) => onChange(parseFloat(event.target.value))} className="h-1.5 w-32 cursor-pointer appearance-none rounded-pill bg-inset outline-none accent-brand disabled:pointer-events-none disabled:opacity-50" /><span className="w-10 text-right font-mono text-[11.5px] tabular-nums text-text-tertiary">{motionSpeedDisplayMultiplier(value).toFixed(2)}x</span><button type="button" onClick={() => onChange(MOTION_SPEED_DEFAULT)} disabled={disabled || value === MOTION_SPEED_DEFAULT} className="rounded-sm px-1.5 py-0.5 text-[11px] text-text-tertiary transition-colors hover:bg-inset hover:text-text disabled:pointer-events-none disabled:opacity-40">重置</button></div>;
}

export function RadiusStyleSegment({ value, onChange }: { value: RadiusStyle; onChange: (next: RadiusStyle) => void }) {
    const items: ReadonlyArray<{ value: RadiusStyle; label: string; icon: IconName }> = [{ value: 'square', label: RADIUS_LABELS.square, icon: UI_ICONS.radiusSquare }, { value: 'standard', label: RADIUS_LABELS.standard, icon: UI_ICONS.radiusStandard }, { value: 'round', label: RADIUS_LABELS.round, icon: UI_ICONS.radiusRound }];
    return <div className="flex h-7 items-center rounded-md bg-inset p-0.5">{items.map((item) => { const selected = value === item.value; return <button key={item.value} type="button" onClick={() => onChange(item.value)} className={'flex h-6 items-center gap-1 rounded-sm px-2.5 text-[12px] font-medium transition-all ' + (selected ? 'border border-border/50 bg-surface text-text shadow-sm' : 'border border-transparent text-text-tertiary hover:text-text')}><SegmentMotionIcon icon={item.icon} selected={selected} segmentKey={`radius-${item.value}`} /><span>{item.label}</span></button>; })}</div>;
}

/** 启动页签选择：底部 5 个页签一字排开（值集合见 `core/domain/ui/startupTab.ts`）。 */
export function StartupTabSegment({ value, onChange }: { value: StartupTab; onChange: (next: StartupTab) => void }) {
    const items = STARTUP_TABS.map((tab) => ({ value: tab.value, label: tab.label }));
    return (
        <div className="flex h-9 w-full items-center rounded-md bg-inset p-0.5">
            {items.map((item) => {
                const selected = value === item.value;
                return (
                    <button
                        key={item.value}
                        type="button"
                        onClick={() => onChange(item.value)}
                        aria-pressed={selected}
                        className={
                            'flex h-8 flex-1 items-center justify-center rounded-sm text-[12px] font-medium transition-all ' +
                            (selected
                                ? 'border border-border/50 bg-surface text-text shadow-sm'
                                : 'border border-transparent text-text-tertiary')
                        }
                    >
                        {item.label}
                    </button>
                );
            })}
        </div>
    );
}
