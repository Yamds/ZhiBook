# 制账 · Android 模板

Rust + Tauri 2 + React 18 的安卓应用模板。从桌面模板提取而来，**已移除插件体系**，
UI 与业务直接写在源码树里。

- 包名：`cafe.yamds.bill`
- 应用名：制账
- 目标平台：**仅 Android**（arm64 为主）

---

## 技术栈

| 层 | 技术 |
| --- | --- |
| 平台壳 | Tauri 2（Android） |
| 业务内核 | Rust workspace：`tk-domain` / `tk-traits` / `tk-config` / `tk-log` / `tk-runtime` |
| 前端 | React 18 · Vite 5 · Tailwind CSS 4 · Radix UI · GSAP · TanStack Query |
| 类型同源 | `ts-rs`：Rust 定义 → 生成 TypeScript |
| 测试 | Rust 内建 harness · Vitest + Testing Library |

体积基线：release APK ≈ 8.8 MB（其中 `libyamds_bill.so` ≈ 6.0 MB，已开 fat LTO +
`opt-level="z"` + `panic="abort"` + strip）。

---

## 环境要求

| 组件 | 版本 |
| --- | --- |
| Rust | ≥ 1.85（Edition 2024） |
| Node.js / pnpm | 18+ / 9.15.9 |
| JDK | 17 |
| Android SDK | platform 36、build-tools 35+ |
| Android NDK | 已安装并在 `NDK_HOME` 指向 |

Rust 需要安装 4 个 Android target：

```powershell
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

环境变量（本机已设为系统级）：

```powershell
$env:ANDROID_HOME = "D:\Environment\AndroidSDK"
$env:NDK_HOME     = "D:\Environment\AndroidSDK\ndk\30.0.16248370"
$env:JAVA_HOME    = "D:\Environment\Java\jdk-17.0.12"
```

---

## 常用命令

```powershell
pnpm install                 # 安装前端依赖
pnpm run typecheck           # TypeScript 检查
pnpm run test:unit           # 前端单元测试
pnpm run build               # 构建前端到 dist/
pnpm run rust:check          # cargo check --workspace
pnpm run rust:test           # cargo test --workspace
pnpm run verify              # typecheck + rust:check
pnpm run ts-bindings         # 从 Rust 重新生成 TS 类型（改 tk-domain 后必须跑）
pnpm run icon                # 由 src/assets/app-icon.png 重新生成全套图标
```

### 安卓

```powershell
pnpm tauri android dev                        # 开发模式：编译 → 装设备 → 启动，前端热重载
pnpm tauri android build --apk --debug --target aarch64   # 可直接安装的 debug 包
pnpm tauri android build --apk --target aarch64           # release（未签名，需自行签名）
```

> release 包默认 **unsigned**，`adb install` 会拒绝。开发验证请用 `--debug`，
> 或参考 [打包与签名](docs/02-build-and-release.md)。

---

## 目录结构

```text
crates/            Rust 业务内核（与平台无关）
  tk-domain/       跨边界类型、错误、事件（ts-rs 导出源）
  tk-traits/       接口契约：ConfigStore / EventBus / MigrationStep
  tk-config/       JSON 原子写、data_root 布局、Schema 迁移
  tk-log/          日志行格式与 tracing target 映射
  tk-runtime/      业务编排骨架（空，新业务落这里）
src/               前端
  app/             启动门、Provider、应用壳、导航注册表、滑动仲裁
  core/            design token / 领域类型 / IPC / 服务 / 平台桥
  hooks/           可复用状态与浏览器能力
  modules/         路由级页面
  shared/          壳组件、原子 UI 组件、动效组件
src-tauri/         Tauri 壳（Android）
  src/             Rust 装配层：commands / 日志 / 启动快照
  gen/android/     生成的 Android Studio 工程（含自定义 MainActivity）
docs/              专题文档
```

---

## 文档

- [架构与分层](docs/01-architecture.md)
- [构建与签名](docs/02-build-and-release.md)
- [移动端 UI 与原生桥](docs/03-mobile-ui-and-native-bridge.md)
