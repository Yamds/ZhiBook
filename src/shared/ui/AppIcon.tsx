// Iconify 图标唯一入口。
//
// 规则（全工程强制）：
//   1. 所有图标都从 Iconify 选，禁止 emoji、禁止再引入第二套图标库；
//   2. 图标名只能来自 `icons.generated.ts` 的 `IconName` 联合类型，
//      写错名字编译期就报错；
//   3. 图标数据在构建期由 `scripts/build-icon-subset.mjs` 从 `@iconify-json/mdi`
//      抽取成离线子集，运行时 `addCollection` 注册一次，不请求 iconify API。
//
// 想新增图标：写进 scripts/icon-catalog.mjs 后执行 `pnpm run icons`。

import { addCollection, Icon } from '@iconify/react';
import mdiSubset from '../../assets/icons/mdi-subset.json';
import { cn } from '../utils/cn';
import type { IconName } from '../../core/design/icons';

// 模块初始化时注册图标集：保证首帧就能渲染，不出现空图标闪一下。
addCollection(mdiSubset as unknown as Parameters<typeof addCollection>[0]);

export interface AppIconProps {
    name: IconName;
    /** 像素尺寸；默认 16。 */
    size?: number | string;
    className?: string;
    /** 默认 currentColor（跟随文字色）。 */
    color?: string;
    /** 给了 title 就是有语义的图标（role=img），否则 aria-hidden。 */
    title?: string;
}

export function AppIcon({ name, size = 16, className, color, title }: AppIconProps) {
    return (
        <Icon
            icon={name}
            width={size}
            height={size}
            color={color}
            className={cn('shrink-0', className)}
            aria-hidden={title ? undefined : true}
            role={title ? 'img' : undefined}
            aria-label={title}
        />
    );
}

export default AppIcon;
