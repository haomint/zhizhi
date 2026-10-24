# 知枝 React + TypeScript 手机兼容性验证

这是独立的技术验证样例，使用 React + TypeScript + Vite + Capacitor。正式知枝源码与现有学习档案保持原样；应用 ID 为 `app.zhizhi.reacttsprobe`，与正式版并行安装。

Pi Core 与三个只读工具来自现有应用运行模块的未修改快照，来源和摘要见 `vendor/source-manifest.json`；模型响应、网络异常和慢请求由测试适配器模拟。不调用付费模型，不接收 API Key，不用于验证教学效果。新界面和测试适配器使用严格 TypeScript；复用的三个历史 `.mjs` 模块仍是 JavaScript，尚未迁移为 TS。

## 构建与运行

要求 Node.js 22.12+（或 Vite 支持的版本）。本次实测 Node.js 24.18.0。

```bash
npm ci
npm run build
npm run preview -- --port 5176
```

生产构建先运行 `tsc --noEmit`；Vite 的资源编译不替代类型检查。构建目标为 Chrome/WebView 110。工程中使用 `structuredClone`、`AbortController` 和 IndexedDB；Android 最低 SDK 24 不意味着旧 WebView 自动兼容。目标手机应检查实际 WebView 版本与这些 API。

## 自动验证

先完成构建，再启动预览，最后运行浏览器检查。不要在浏览器检查期间重建或删除 `dist/`。

```bash
node scripts/verify_browser.cjs
```

脚本优先使用本地 `playwright`，本环境使用预装版本 `/usr/local/lib/node_modules/playwright`。其他环境先安装 Playwright 和 Chromium，或通过 `PLAYWRIGHT_MODULE` 指向安装位置。

浏览器验证覆盖读取/翻页/保存、刷新恢复、50 次 Pi 循环、模拟错误、取消、进行中刷新后的数据保留、断网下本地读写和布局。测试数据为样例专用，不读取正式知枝的数据库。测试时长与资源体积只描述本样例，不等同于真机性能基准。

## Android

配置 JDK 21 与 Android API 36：

```bash
python3 scripts/build_android.py
python3 scripts/verify_apk.py
```

脚本也支持复用工作区 `work/pi-probe-tools` 缓存。APK 放在 `verification/`，独立调试签名和正式应用签名无关。自定义 `Probe` 插件已编译，可在安装后点击“检查原生桥接”核对回传与 WebView 版本。编译成功不代表该桥接已经在手机执行。

详细结果、实测边界和手机验收步骤见 `verification/验证报告.md`；机器可读记录见 `verification/browser.json` 和 `verification/apk.json`。
