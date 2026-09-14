// 内置分类 / 默认账本的「本地化名字」解析。
//
// 背景（i18n 打底的关键一环）：
//   内置分类（餐饮 / 购物 / …）和默认账本名是**落库的数据**，不是界面常量——
//   `crates/tk-ledger` 的种子数据里存的就是中文名。切语言时既有行不会自己变。
//
// 判定规则（不需要数据迁移，可逆）：
//   1. 行的 id 命中内置目录的稳定 id（`expense_food` / `book_default`）；
//   2. 且当前 `name` 与内置中文名**逐字相同**（说明用户没改过名）。
//   两条同时成立 ⇒ 视为「未自定义」，渲染时用语言文件里的名字。
//
// 用户一旦改过名（或它是自建分类），name 与内置值就对不上，走原样展示——
// 用户的输入永远优先于翻译。

import { DEFAULT_CATEGORIES } from '../design/icons.generated';
import { t as translate } from '../i18n';

/** 默认账本的稳定 id 与内置中文名（与 `tk-ledger::seed` 保持一致）。 */
export const DEFAULT_BOOK_ID = 'book_default';
// i18n-allow: 与 Rust 种子值对齐的**落库数据**，不是界面文案（展示时走 assets.defaultBookName）。
export const DEFAULT_BOOK_NAME = '默认账本';

/** 内置分类 id → `{ kind, name }`（前端目录与 Rust 种子同源，见 scripts/icon-catalog.mjs）。 */
const BUILTIN_CATEGORIES: ReadonlyMap<string, { kind: 'expense' | 'income'; name: string }> =
    new Map(
        (['expense', 'income'] as const).flatMap((kind) =>
            DEFAULT_CATEGORIES[kind].map(
                (item) => [`${kind}_${item.id}`, { kind, name: item.name }] as const,
            ),
        ),
    );

/** 内置分类在语言文件里的 key：`category.<expense|income>.<目录 id>`。 */
function builtinCategoryKey(dbId: string): string | null {
    const parts = dbId.split('_');
    const kind = parts[0];
    const slug = parts.slice(1).join('_');
    if ((kind !== 'expense' && kind !== 'income') || !slug) return null;
    return `category.${kind}.${slug}`;
}

export interface NameResolvable {
    readonly id: string;
    readonly name: string;
}

/**
 * 分类展示名。
 *
 * @param category 至少要有 `id` 与 `name`；`null/undefined` 时返回 `fallback`。
 * @param t        `useTranslation()` 出来的 t（组件里传进来，保证语言切换会重渲染）。
 * @param fallback 分类缺失时的兜底文案（如「未知分类」），调用方已翻译好。
 */
export function categoryDisplayName(
    category: NameResolvable | null | undefined,
    t: (key: string) => string,
    fallback: string,
): string {
    if (!category) return fallback;
    const builtin = BUILTIN_CATEGORIES.get(category.id);
    if (!builtin || builtin.name !== category.name) return category.name;
    const key = builtinCategoryKey(category.id);
    if (!key) return category.name;
    const localized = t(key);
    // 语言文件里没写这条（新增了内置分类但忘了补 key）时退回库里存的名字。
    return localized === key ? category.name : localized;
}

/** 同上，用于没有 React `t` 的场景（纯逻辑 / 非组件模块）。 */
export function categoryDisplayNameStatic(
    category: NameResolvable | null | undefined,
    fallback: string,
): string {
    return categoryDisplayName(category, (key) => translate(key), fallback);
}

/**
 * 账本展示名：默认账本且未改名时用语言文件，其余原样。
 *
 * @param t `useTranslation()` 出来的 t。
 */
export function bookDisplayName(
    book: NameResolvable | null | undefined,
    t: (key: string) => string,
    fallback: string,
): string {
    if (!book) return fallback;
    if (book.id !== DEFAULT_BOOK_ID || book.name !== DEFAULT_BOOK_NAME) return book.name;
    return t('assets.defaultBookName');
}

/** 是否为「未改名的内置分类」（用于禁止改名 / 删除等后续判断）。 */
export function isBuiltinCategoryName(category: NameResolvable | null | undefined): boolean {
    if (!category) return false;
    const builtin = BUILTIN_CATEGORIES.get(category.id);
    return !!builtin && builtin.name === category.name;
}

/** 是否为「未改名的默认账本」。 */
export function isDefaultBookName(book: NameResolvable | null | undefined): boolean {
    return !!book && book.id === DEFAULT_BOOK_ID && book.name === DEFAULT_BOOK_NAME;
}
