// 图标流水线产物的自洽性测试：生成脚本改动后如果漏了 body / 前缀 / 分组，
// 在这里就会失败，而不是等真机上渲染出灰框。

import { describe, expect, it } from 'vitest';
import mdiSubset from '../../assets/icons/mdi-subset.json';
import siSubset from '../../assets/icons/si-subset.json';
import { ICON_CATALOG, ICON_GROUPS, ICON_NAMES } from './icons.generated';

describe('icons.generated', () => {
    it('每个 IconName 都能在离线子集里找到 body', () => {
        const available = new Set<string>([
            ...Object.keys(mdiSubset.icons).map((name) => `${mdiSubset.prefix}:${name}`),
            ...Object.keys(siSubset.icons).map((name) => `${siSubset.prefix}:${name}`),
        ]);
        const missing = ICON_NAMES.filter((name) => !available.has(name));
        expect(missing).toEqual([]);
        expect(ICON_NAMES.length).toBe(available.size);
    });

    it('IconName 清单本身不重复', () => {
        expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
    });

    it('选择器候选都在 IconName 清单里，且分组顺序稳定', () => {
        const known = new Set<string>(ICON_NAMES);
        for (const entry of ICON_CATALOG) {
            expect(known.has(entry.name)).toBe(true);
            expect(ICON_GROUPS).toContain(entry.group);
        }
        // 「支付与账户」在前（账户编辑器默认展示），紧随其后的品牌分组是 P9 新增
        expect(ICON_GROUPS[0]).toBe('支付与账户');
        expect(ICON_GROUPS[1]).toBe('支付品牌');
    });

    it('支付品牌分组带中文别名（支付宝 / 微信可搜到）', () => {
        const alipay = ICON_CATALOG.find((entry) => entry.name === 'simple-icons:alipay');
        const wechat = ICON_CATALOG.find((entry) => entry.name === 'simple-icons:wechat');
        expect(alipay?.group).toBe('支付品牌');
        expect(alipay?.aliases).toContain('支付宝');
        expect(wechat?.aliases).toContain('微信');
    });
});
