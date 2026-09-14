// 「关于 → 帮助文档」弹层：把常见问题按条列出（图文不需要，纯 Q/A）。

import { BottomSheet } from '../../../shared/ui/BottomSheet';
import { HELP_FAQ } from './helpFaq';

export interface HelpSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function HelpSheet({ open, onOpenChange }: HelpSheetProps) {
    return (
        <BottomSheet
            open={open}
            onOpenChange={onOpenChange}
            title="帮助文档"
            description="常见问题与使用说明"
            maxHeightRatio={0.9}
        >
            <div className="flex flex-col gap-4">
                {HELP_FAQ.map((item, index) => (
                    <section key={item.question} className="flex flex-col gap-1.5">
                        <h3 className="flex items-start gap-2 text-[13.5px] font-semibold leading-snug text-text">
                            <span className="mt-px inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand tabular-nums">
                                {index + 1}
                            </span>
                            <span className="min-w-0 flex-1">{item.question}</span>
                        </h3>
                        <p className="pl-7 text-[12.5px] leading-relaxed text-text-secondary">
                            {item.answer}
                        </p>
                    </section>
                ))}
            </div>
        </BottomSheet>
    );
}

export default HelpSheet;
