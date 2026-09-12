// 账单页：以「年 → 月」为轴看统计。
// P1 先占位；年月选择器与统计卡片在 P6 阶段接入。

import { PagePlaceholder } from '../../shared/ui';

export function BillsPage() {
    return (
        <section className="flex min-h-full w-full flex-col">
            <PagePlaceholder>
                <h2 className="text-[15px] font-semibold text-text">账单</h2>
                <p className="text-[13px] leading-relaxed text-text-tertiary">
                    年月选择器、年度结余卡片、12 个月环形图、趋势图、占比概况与排行
                    <br />
                    将在 P6 阶段接入。
                </p>
            </PagePlaceholder>
        </section>
    );
}

export default BillsPage;
