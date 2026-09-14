// 「关于 → 开源许可」的数据：本项目自身的许可 + 主要依赖清单。
//
// 许可名以各包自带的 LICENSE / package.json 为准（前端部分逐个核对过；
// Rust 依赖绝大多数为 MIT OR Apache-2.0，这里按类别归并）。

export interface LicenseEntry {
    readonly name: string;
    /** SPDX 风格许可名，或该依赖自报的许可说明。 */
    readonly license: string;
    readonly note?: string;
    readonly url?: string;
}

export interface LicenseGroup {
    readonly title: string;
    readonly entries: readonly LicenseEntry[];
}

/** 本项目自身的许可。与仓库根目录的 `LICENSE` 文件一致。 */
export const OWN_LICENSE = {
    name: '制账（ZhiBook）',
    license: 'GNU General Public License v3.0',
    note: '本项目的框架与界面基于 NapCatQQ-Desktop（GPL-3.0）搭建，因此同样以 GPL-3.0 发布。',
    url: 'https://github.com/Yamds/ZhiBook',
} as const;

export const LICENSE_GROUPS: readonly LicenseGroup[] = [
    {
        title: '应用框架与运行时（Rust / Tauri）',
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
        title: '前端',
        entries: [
            { name: 'React · React DOM', license: 'MIT' },
            { name: 'Vite', license: 'MIT' },
            { name: 'Tailwind CSS', license: 'MIT' },
            { name: 'Radix UI Primitives', license: 'MIT' },
            { name: 'TanStack Query', license: 'MIT' },
            {
                name: 'GSAP',
                license: "Standard 'no charge' License",
                note: 'GreenSock 标准许可（非 MIT）',
                url: 'https://gsap.com/standard-license/',
            },
            { name: 'class-variance-authority', license: 'Apache-2.0' },
            { name: 'clsx · tailwind-merge', license: 'MIT' },
        ],
    },
    {
        title: '字体与图标',
        entries: [
            { name: 'Inter · JetBrains Mono · Plus Jakarta Sans', license: 'SIL OFL-1.1' },
            { name: 'Iconify', license: 'MIT' },
            { name: 'Material Design Icons（Pictogrammers）', license: 'Apache-2.0' },
            { name: 'Simple Icons', license: 'CC0-1.0' },
        ],
    },
];
