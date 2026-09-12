import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

// Tauri 生产环境用自定义协议加载前端；base 必须相对路径，
// 否则 index.html 写成 /assets/...，WebView 里脚本 404，表现为「前端崩溃」。
//
// 前端源代码位于 src/；仓库根为 monorepo 工作区（package.json / Cargo / dist）。
const repoRoot = resolve(__dirname, '..');

export default defineConfig({
  // 相对 base：生产 asset 协议 + dev 都可用
  base: './',
  root: __dirname,
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_'],
  // .env 仍放在仓库根，与既有本地开发习惯一致。
  envDir: repoRoot,
  server: {
    // 1420 落在 Windows 保留端口范围（1340-1439）内，被 Hyper-V/WinNAT 排除后
    // node 绑定时会 EACCES；换用普通用户端口。
    port: 5180,
    strictPort: true,
    // 移动端真机经局域网访问 dev server（Tauri CLI 会把 devUrl 换成局域网 IP）。
    host: true,
    hmr: { overlay: true },
    fs: {
      allow: [repoRoot],
    },
    watch: {
      ignored: [
        '**/target/**',
        '**/src-tauri/gen/**',
        '**/.references/**',
      ],
    },
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      '@tanstack/react-query',
      'gsap',
      'gsap/CustomEase',
      'gsap/CustomBounce',
      'gsap/CustomWiggle',
      'lucide-react',
    ],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname),
    },
  },
  build: {
    // 产物仍输出到仓库根 dist，供 src-tauri frontendDist 使用。
    outDir: resolve(repoRoot, 'dist'),
    emptyOutDir: true,
    // Android WebView 随系统更新，直接按 esnext 产出，无需为旧 Chromium 降级。
    target: 'esnext',
    minify: process.env.TAURI_ENV_DEBUG === 'true' ? false : 'esbuild',
    sourcemap: process.env.TAURI_ENV_DEBUG === 'true',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('gsap')) return 'vendor-gsap';
            if (id.includes('@radix-ui')) return 'vendor-radix';
            if (id.includes('lucide-react')) return 'vendor-icons';
            return 'vendor';
          }
          return undefined;
        },
      },
    },
  },
});
