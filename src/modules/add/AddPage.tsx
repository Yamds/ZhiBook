// 添加页：记一笔（支出 / 收入）。
// P1 先占位；分类宫格、自制数字键盘、备注 / 日期 / 图片附件在 P4 阶段接入。

import { PagePlaceholder } from '../../shared/ui';

export function AddPage() {
    return (
        <section className="flex min-h-full w-full flex-col">
            <PagePlaceholder>
                <h2 className="text-[15px] font-semibold text-text">添加</h2>
                <p className="text-[13px] leading-relaxed text-text-tertiary">
                    支出 / 收入子页签、分类宫格（分类管理）、自制数字键盘、
                    <br />
                    备注 / 日期 / 图片附件与账户选择将在 P4 阶段接入。
                </p>
            </PagePlaceholder>
        </section>
    );
}

export default AddPage;
