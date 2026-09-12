// 设计系统 / 图标系统的统一入口（渲染实现在 shared/ui/AppIcon）。
//
// 这里只做转发：业务代码 import { UI_ICONS, ICON_CATALOG, type IconName }
// 都从这条路径走，将来换图标集合（例如加 solar）只改生成脚本。

export {
    DEFAULT_CATEGORY_ICONS,
    ICON_CATALOG,
    ICON_GROUPS,
    UI_ICONS,
} from './icons.generated';
export type { IconCatalogEntry, IconName } from './icons.generated';
