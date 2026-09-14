// 「关于 → 开源许可」的数据：本项目自身的许可 + 主要依赖清单。
//
// 许可名以各包自带的 LICENSE / package.json 为准（前端部分逐个核对过；
// Rust 依赖绝大多数为 MIT OR Apache-2.0，这里按类别归并）。
//
// 只有「分组标题」与「备注」是可翻译文案，走语言文件；
// 依赖名与 SPDX 许可名是专有名词，原样展示。

export interface LicenseEntry {
    readonly name: string;
    /** SPDX 风格许可名，或该依赖自报的许可说明（不翻译）。 */
    readonly license: string;
    /** 备注的 i18n key（可选）。 */
    readonly noteKey?: string;
    readonly url?: string;
}

export interface LicenseGroup {
    /** 分组标题的 i18n key。 */
    readonly titleKey: string;
    readonly entries: readonly LicenseEntry[];
}

/** 本项目自身的许可。与仓库根目录的 `LICENSE` 文件一致。 */
export const OWN_LICENSE = {
    nameKey: 'settings.about.ownLicenseName',
    /** 协议名（专有名词，不翻译）。 */
    license: 'GNU General Public License v3.0',
    noteKey: 'settings.about.ownLicenseNote',
    url: 'https://github.com/Yamds/ZhiBook',
} as const;

export const LICENSE_GROUPS: readonly LicenseGroup[] = [
    {
        titleKey: 'settings.about.groupRuntime',
        entries: [
            { name: 'Tauri', license: 'MIT OR Apache-2.0', url: 'https://tauri.app' },
            {
                name: 'serde · tokio · tracing · thiserror',
                license: 'MIT OR Apache-2.0',
            },
            { name: 'rusqlite · bundled SQLite', license: 'MIT · Public Domain' },
            {
                name: 'RustCrypto（chacha20poly1305 · argon2 · hkdf · sha2）',
                license: 'MIT OR Apache-2.0',
            },
            { name: 'flate2 · base64 · base32 · zeroize · getrandom', license: 'MIT OR Apache-2.0' },
        ],
    },
    {
        titleKey: 'settings.about.groupFrontend',
        entries: [
            { name: 'React · React DOM', license: 'MIT' },
            { name: 'Vite', license: 'MIT' },
            { name: 'Tailwind CSS', license: 'MIT' },
            { name: 'Radix UI Primitives', license: 'MIT' },
            { name: 'TanStack Query', license: 'MIT' },
            {
                name: 'GSAP',
                license: "Standard 'no charge' License",
                noteKey: 'settings.about.gsapNote',
                url: 'https://gsap.com/standard-license/',
            },
            { name: 'class-variance-authority', license: 'Apache-2.0' },
            { name: 'clsx · tailwind-merge', license: 'MIT' },
        ],
    },
    {
        titleKey: 'settings.about.groupFontsIcons',
        entries: [
            { name: 'Inter · JetBrains Mono · Plus Jakarta Sans', license: 'SIL OFL-1.1' },
            { name: 'Iconify', license: 'MIT' },
            { name: 'Material Design Icons（Pictogrammers）', license: 'Apache-2.0' },
            { name: 'Simple Icons', license: 'CC0-1.0' },
        ],
    },
];
