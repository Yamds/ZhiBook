// 「关于 → 开源许可」弹层：本项目自身的 GPL-3.0 许可 + 主要依赖的许可清单。

import { UI_ICONS } from '../../../core/design/icons';
import { openExternalUrl } from '../../../core/ipc/transport';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { BottomSheet } from '../../../shared/ui/BottomSheet';
import { LICENSE_GROUPS, OWN_LICENSE } from './licenses';

export interface LicensesSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function LicensesSheet({ open, onOpenChange }: LicensesSheetProps) {
    return (
        <BottomSheet
            open={open}
            onOpenChange={onOpenChange}
            title="开源许可"
            description="制账以 GNU GPL v3.0 发布"
            maxHeightRatio={0.9}
        >
            <div className="flex flex-col gap-5">
                <div className="rounded-md border border-brand/25 bg-brand-tint px-4 py-3.5">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-[13.5px] font-semibold text-text">{OWN_LICENSE.name}</p>
                        <span className="shrink-0 rounded-pill bg-brand-soft px-2 py-0.5 text-[10.5px] font-medium text-brand">
                            GPL-3.0
                        </span>
                    </div>
                    <p className="mt-1 text-[12px] text-text-secondary">{OWN_LICENSE.license}</p>
                    <p className="mt-1.5 text-[11.5px] leading-relaxed text-text-tertiary">
                        {OWN_LICENSE.note}
                    </p>
                    <button
                        type="button"
                        onClick={() => void openExternalUrl(OWN_LICENSE.url)}
                        className="mt-2.5 inline-flex h-8 items-center gap-1.5 rounded-md bg-elevated px-3 text-[12px] font-medium text-text active:opacity-80"
                    >
                        <AppIcon name={UI_ICONS.openInNew} size={13} />
                        在浏览器查看完整协议
                    </button>
                </div>

                {LICENSE_GROUPS.map((group) => (
                    <section key={group.title} className="flex flex-col">
                        <h3 className="text-[12px] font-medium text-text">{group.title}</h3>
                        <ul className="mt-1 flex flex-col divide-y divide-border-subtle/70">
                            {group.entries.map((entry) => (
                                <li
                                    key={entry.name}
                                    className="flex items-start justify-between gap-3 py-2"
                                >
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[12.5px] leading-snug text-text">
                                            {entry.name}
                                        </span>
                                        {entry.note ? (
                                            <span className="mt-0.5 block text-[11px] leading-snug text-text-tertiary">
                                                {entry.note}
                                            </span>
                                        ) : null}
                                    </span>
                                    <span className="shrink-0 pt-0.5 text-right text-[11px] text-text-tertiary">
                                        {entry.license}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}

                <p className="text-[11px] leading-relaxed text-text-tertiary">
                    以上为主要依赖；完整清单见仓库的 package.json / Cargo.lock 与各依赖自带的
                    LICENSE 文件。
                </p>
            </div>
        </BottomSheet>
    );
}

export default LicensesSheet;
