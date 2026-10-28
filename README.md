# 知枝 · React + TypeScript

知枝是手机本地运行的个人学习助手。正式应用已迁移为 **React + TypeScript + Vite + Capacitor**；学习、记忆、任务和 Pi 运行逻辑使用 TypeScript，安卓原生插件负责密钥、网络和系统分享。

- [正式应用源码与开发入口](outputs/learning-grove/README.md)：当前版本 1.1.0。
- [工程架构与开发规范](docs/工程架构与开发规范.md)：目录职责、接口和检查命令。
- [产品策划与网页迭代方案](docs/知枝-产品策划与网页迭代方案.md)：当前有效的产品策划；[MVP 策划案](outputs/知枝-MVP完整策划案.md)作为历史参考。
- [AGENTS.md](AGENTS.md)：AI 编程助手与开发者共用的仓库规则、分层约束和工作流程。
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

提交前执行 `npm run check`，完成格式检查、32 项自动测试（含分层架构检查）、严格类型检查、生产构建和工程核对。GitHub Actions 在每个 PR 上执行同一检查，并用 `npm run test:browser` 运行 13 项浏览器场景。浏览器预览支持本地阅读和明确标注的演示；真实模型和加密 Key 在安卓应用中使用。

```bash
npm run android:build
python3 scripts/verify_apk.py
```

Android 构建还需 JDK 21、Android API 36 和可读取的签名。APK 与源码压缩包在工作区单独交付，不进入 Git。1.1 沿用 1.0.1 的应用 ID、v1 签名与 IndexedDB 名称；真机覆盖安装、生命周期和真实模型仍需设备验收。

## 协作

远程仓库：[haomint/zhizhi](https://github.com/haomint/zhizhi)（公开）。`main` 受分支保护：只能通过 PR 合入，且 `web` 检查必须通过。按任务创建 `feat/…`、`fix/…` 或 `refactor/…` 分支，说明验收条件，完成检查后通过 Pull Request 合入 `main`，按 PR 模板填写测试与 AI 使用说明。规则详见 [AGENTS.md](AGENTS.md)。多人或多个 Agent 使用独立克隆或 worktree。

旧 Python 桌面实现已归档在 `outputs/learning-grove/legacy/`。当前应用入口为 `src/main.tsx`，不依赖电脑后台服务。`dist/` 和兼容旧预览的 `static/` 都是生成目录。

API Key、签名私钥、本地数据库、依赖缓存和安装包不进入 Git。稳定 v1 签名仍在被忽略的 `work/release-signing/`，请单独保存；换机器通过 `ZHIZHI_DEBUG_KEYSTORE` 指定同一签名。Git 源码回退不等于手机数据回退。

## 许可证

本项目以 [MIT 许可证](LICENSE)开源。第三方依赖的许可证见 `outputs/learning-grove/LICENSES/` 与 `outputs/learning-grove/THIRD-PARTY-NOTICES.md`。
