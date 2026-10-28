# 知枝

当前已归档网页主版本为 **1.0.1**。源码来自版本库的主版本快照，保留居中“要学什么”输入、选择题需求补问、连续阅读、上一张及跨已读小节回看，并包含 API 连接测试和 Android 原生 HTTPS 桥接。

- [当前网页源码与运行说明](outputs/网页原型/知枝-v3/release/README.md)
- [版本来源与归档记录](outputs/网页原型/知枝-v3/release/版本.json)
- [Android 封装源码](outputs/网页原型/知枝-v3/release/android/README.md)：该主版对应 Android 1.1.1。源码不包含签名私钥或 APK。

在仓库中运行：

```bash
cd outputs/网页原型/知枝-v3/release
python3 -m http.server 4184
```

服务器启动后按终端显示的地址访问 `index.html`。该网页已包含运行所需资源，不需要先构建旧 React 工程。真实模型在个人中心自行配置。

本次同步只纳入版本库主指针确认的 1.0.1；尚未整合的知识树、UI 等任务快照与本地后续修改不冒充新的主版本。原始 ZIP 的 SHA-256 为 `8ab111584a556aa604bc0c879e1f6aa3ec21e1db13e7ce73f21b88ba53b53820`，解压后逐文件核对归档清单。

归档记录包含 44 项模拟接口浏览器场景；本次上传再次核对包与全部 19 个业务文件哈希、JavaScript/Python 语法及打包内容。真实模型调用和安卓真机安装尚未验证。

以下保留原 React / TypeScript 应用的开发说明。它与当前网页主版分别维护。

## 历史 React / TypeScript 应用

知枝是手机本地运行的个人学习助手。正式应用已迁移为 **React + TypeScript + Vite + Capacitor**；学习、记忆、任务和 Pi 运行逻辑使用 TypeScript，安卓原生插件负责密钥、网络和系统分享。

- [正式应用源码与开发入口](outputs/learning-grove/README.md)：当前版本 1.1.0。
- [工程架构与开发规范](docs/工程架构与开发规范.md)：目录职责、接口和检查命令。
- [产品策划](outputs/知枝-MVP完整策划案.md)：MVP 功能边界与教学规则。
- [1.1 使用与验收说明](outputs/知枝-1.1使用与验收说明.md)。
- [迁移验收记录](outputs/知枝-1.1-TS-React迁移验收.md)。
- [历史归档与仓库整理](docs/历史归档与仓库整理.md)：旧原型、验证项目与恢复方式。

## 开发

要求 Node.js 24+。先进入正式应用目录：

```bash
cd outputs/learning-grove
npm ci
npm run dev
```

提交前执行 `npm run check`，完成格式检查、28 项自动测试、严格类型检查、生产构建和工程核对。浏览器预览支持本地阅读和明确标注的演示；真实模型和加密 Key 在安卓应用中使用。

```bash
npm run android:build
python3 scripts/verify_apk.py
```

Android 构建还需 JDK 21、Android API 36 和可读取的签名。APK 与源码压缩包在工作区单独交付，不进入 Git。1.1 沿用 1.0.1 的应用 ID、v1 签名与 IndexedDB 名称；真机覆盖安装、生命周期和真实模型仍需设备验收。

## 协作

远程仓库：[haomint/zhizhi](https://github.com/haomint/zhizhi)（私有）。按任务创建 `feat/…`、`fix/…` 或 `refactor/…` 分支，说明验收条件，完成检查后通过 Pull Request 合入 `main`。多人或多个 Agent 使用独立克隆或 worktree。

旧 Python 桌面实现已归档在 `outputs/learning-grove/legacy/`。当前应用入口为 `src/main.tsx`，不依赖电脑后台服务。`dist/` 和兼容旧预览的 `static/` 都是生成目录。

API Key、签名私钥、本地数据库、依赖缓存和安装包不进入 Git。稳定 v1 签名仍在被忽略的 `work/release-signing/`，请单独保存；换机器通过 `ZHIZHI_DEBUG_KEYSTORE` 指定同一签名。Git 源码回退不等于手机数据回退。
