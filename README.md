# 制账App · ZhiBook

一款 **本地优先、离线可用** 的 Android 记账应用。账单与附件全部保存在你自己的手机上，
不注册账号、不依赖服务器；需要跨设备时，可以把数据**端到端加密**后推送到你自己的 Git 仓库。

- 平台：Android（arm64 为主，最低 Android 7.0 / API 24）
- 许可：[GNU General Public License v3.0](LICENSE)

---

## 特色

- **数据在你自己手里** —— 账本与附件保存在本机 SQLite 与应用私有目录，不联网也能记；
  没有账号、没有广告、没有埋点。
- **日历化记账** —— 日历上点按某一天就能记一笔，长按看当天明细；支持记录未来日期。
- **固定收支自动记账** —— 房租、工资等可设成固定收支，每天自动补记漏掉的天数。
- **记账提醒** —— 到点用系统通知提醒你记账，App 不在前台也能收到。
- **加密的云端备份** —— 可选：把端到端加密后的数据推送到你自己的 Gitea / GitHub / GitLab
  仓库，多设备共用同一分支自动合并；恢复密钥与保护口令只在本机，云端只存密文。
- **12 套主题** —— 跟随系统 / 浅色 / 暗色，以及 Catppuccin、Everforest、Nord；
  分类与图表颜色会跟随各主题自带的色板。
- **密码锁 · 多账本 · 资产负债** —— 本地 PIN 锁、账本与账户相互独立、净资产与趋势图。

## 快速上手

1. 在**日历**上点某一天 → 选分类、输入金额 →「完成」。
2. 想自动记账：设置 → 功能 →「固定收支」；想被提醒：设置 → 功能 →「记账提醒」。
3. 想备份 / 换机：设置 → 功能 →「云端备份」或「导入 / 导出」。
4. 换主题、关启动动画：设置 → 外观。

> 设置入口：在**日历**页，底部「日历」页签上方会探出一个齿轮图标，点它即可；
> 在设置页里，同一个位置会探出日历图标，点它回到日历（也可以再点一次底部「日历」页签）。

## 下载与安装

在仓库的 **Releases** 页面下载 APK 安装即可（arm64 设备推荐 `arm64` 包）。
如尚未发布 Release，可参考下方「本地构建」自行打包。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 平台壳 | Tauri 2（Android） |
| 业务内核 | Rust workspace：`tk-domain` / `tk-traits` / `tk-config` / `tk-runtime` / `tk-ledger` / `tk-security` / `tk-backup` / `tk-crypto` / `tk-cloud` |
| 前端 | React 18 · Vite 5 · Tailwind CSS 4 · Radix UI · GSAP · TanStack Query |
| 类型同源 | `ts-rs`：Rust 定义 → 生成 TypeScript |
| 存储 | SQLite（rusqlite，bundled） |
| 加密 | XChaCha20-Poly1305 · Argon2id |

## 本地构建

环境要求：Rust ≥ 1.85、Node 18+ / pnpm 9、JDK 17、Android SDK 36 + NDK。

```powershell
pnpm install                 # 安装前端依赖
pnpm run verify              # TypeScript 检查 + cargo check
pnpm run test:unit           # 前端单元测试
cargo test --workspace       # Rust 测试

# 生成可安装的 debug APK（arm64）
pnpm tauri android build --apk --debug --target aarch64
```

## 开源许可与致谢

- 本项目以 **GNU General Public License v3.0** 发布，全文见 [LICENSE](LICENSE)。
- 框架与界面基于 **NapCatQQ-Desktop** 项目搭建（同样以 GPL-3.0 发布），特此致谢。
- 主要开源依赖：Tauri、React、Vite、Tailwind CSS、Radix UI、TanStack Query、GSAP、
  RustCrypto、SQLite、Iconify / Material Design Icons / Simple Icons，以及
  Inter / JetBrains Mono / Plus Jakarta Sans 字体。
  完整清单与各依赖许可见 App 内「设置 → 关于 → 开源许可」，或各依赖自带的 LICENSE 文件。
