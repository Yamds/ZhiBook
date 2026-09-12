// 资产页：账本管理 + 净资产总览。
// P1 先占位；账本增删改查、净资产卡片、账户体系与三线趋势图在 P8 阶段接入。

import { PagePlaceholder } from '../../shared/ui';

export function AssetsPage() {
    return (
        <section className="flex min-h-full w-full flex-col">
            <PagePlaceholder>
                <h2 className="text-[15px] font-semibold text-text">资产</h2>
                <p className="text-[13px] leading-relaxed text-text-tertiary">
                    账本增删改查与切换、净资产 / 总资产 / 负债卡片、账户体系、资产趋势图
                    <br />
                    将在 P8 阶段接入。
                </p>
            </PagePlaceholder>
        </section>
    );
}

export default AssetsPage;
