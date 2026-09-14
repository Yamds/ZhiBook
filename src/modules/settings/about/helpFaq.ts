// 「关于 → 帮助文档」的常见问题**目录**。
//
// 这里只有稳定 id；问答正文在语言文件里（`help.faq.<id>.question` / `.answer`）。
// 口径与实现一致：本地优先、覆盖式恢复、PIN 无后门、固定收支 05:00 逻辑日等。

export interface FaqEntry {
    /** 稳定 id：语言文件 key 为 `help.faq.<id>.question` / `help.faq.<id>.answer`。 */
    readonly id: string;
}

export const HELP_FAQ: readonly FaqEntry[] = [
    { id: 'dataLocation' },
    { id: 'migrate' },
    { id: 'forgotPin' },
    { id: 'forgotCloudKey' },
    { id: 'reminderNotWorking' },
    { id: 'recurring' },
    { id: 'futureDate' },
    { id: 'categoryColor' },
    { id: 'theme' },
    { id: 'settingsEntry' },
    { id: 'exportCsv' },
    { id: 'deleteWithImages' },
    { id: 'multiBook' },
];

/** 某条问答的 key 前缀。 */
export function faqKeyPrefix(id: string): string {
    return `help.faq.${id}`;
}
