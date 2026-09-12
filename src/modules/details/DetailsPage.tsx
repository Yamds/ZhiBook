// 明细页：按年月日浏览账单。
// P1 先占位；年月日选择器、按天列表与账单详情在 P5 阶段接入。

import { PagePlaceholder } from '../../shared/ui';

export function DetailsPage() {
    return (
        <section className="flex min-h-full w-full flex-col">
            <PagePlaceholder>
                <h2 className="text-[15px] font-semibold text-text">明细</h2>
                <p className="text-[13px] leading-relaxed text-text-tertiary">
                    年 / 月 / 日选择器、按天账单列表、下滑加载更早账单、账单详情与附图
                    <br />
                    将在 P5 阶段接入。
                </p>
            </PagePlaceholder>
        </section>
    );
}

export default DetailsPage;
