# 知枝 1.1.0 · React + TypeScript

这是正式应用的 TS/React 迁移版。界面为 React，学习、记忆、任务调度和 Pi 适配为严格 TypeScript；沿用 Capacitor Android 与必要 Java 原生插件。手机独立运行，模型经 DeepSeek API 联网推理，档案存本地 IndexedDB，Key 由 Android Keystore 加密。

## 运行与检查

要求 Node.js 24+。应用不要求手机安装 Node.js 或 TypeScript 编译器。

```bash
npm ci
npm run dev
npm run check
```

`check` 依次执行 Prettier 检查、43 项自动测试（含 `tests/architecture.test.mjs` 分层检查）、TS 类型检查、Vite 生产构建和工程核对。每项测试覆盖现有学习行为或迁移风险，不把编译通过当成学习效果证明。

```bash
npm run preview -- --port 5175
node scripts/verify_react.cjs
```

浏览器脚本需要 Playwright 与 Chromium。本工作区可使用预装 Playwright；其他环境先安装对应工具。浏览器检查前完成构建，检查过程中不要重建资源。默认验证地址为 `http://localhost:5175/`，可通过 `ZHIZHI_URL` 修改。

弹窗打开时，操作提示显示在弹窗所在的顶层，导入档案、学习资料、调整讲法和自愿加强的失败原因均可直接看到；没有弹窗时保留原提示行为，文字、样式及四秒自动消失时间不变。失败后保留输入。

`node scripts/dialog-toast-checks.cjs` 可单独检查弹窗提示；完整 `verify_react.cjs` 也运行这些场景。检查会通过浏览器命中测试确认文字没有被弹窗或遮罩覆盖，覆盖错误档案、超大材料文件、讲法与加强校验失败，以及无弹窗时的提示。设置 `ZHIZHI_REPORT_DIR` 可将完整浏览器报告写入独立目录。

## 模块

```text
src/
  main.tsx                  React 应用入口
  contracts.ts              动作、档案、模型阶段及服务契约
  ui/                       页面、卡片、表单、弹窗与导航
  application/service.ts    应用服务、任务队列、原子保存与旧结果拦截
  core/
    domain.ts               事件、记忆、档案迁移与导入
    learning.ts             资料到卡片、结算、加强与路线调整
    runtime.ts              真实 Pi Agent 与只读工具循环
    transport.ts            模型消息协议
    validate.ts             模型结果的运行时校验
  platform/
    repository.ts           保持原名的 IndexedDB 存储
    platform.ts             Android / 浏览器能力适配
skills/                     十二份教学规则的唯一源码
public/demo.json            明确标注的固定演示
android/                    Capacitor 与现有原生插件
legacy/                     已退出正式运行路径的历史实现
```

界面通过 `LearningService` 的类型化 `dispatch/read/subscribe` 调用业务；业务层不操作 DOM，平台能力通过接口注入。不再覆盖 `window.fetch`，也不依赖 `window.ZhizhiPi`。应用源码没有 `any`、`@ts-nocheck` 或 `@ts-ignore`。

`npm run build` 将教学规则同步到 `public/` 并生成 `dist/`，同时生成兼容旧托管预览进程的 `static/` 镜像。这两处均不作为源码提交。`legacy/desktop/` 不是当前应用后端。

## Android

```bash
npm run android:build
python3 scripts/verify_apk.py
```

配置 JDK 21 的 `JAVA_HOME` 与含 API 36 的 `ANDROID_HOME`。本环境可复用工作区 `work/pi-probe-tools` 缓存。Windows 可用 `build-android.ps1`。

应用 ID 保持 `app.zhizhi.personal.v1`，versionCode 为 6，versionName 为 1.1.0。正式构建使用 `work/release-signing/zhizhi-v1.keystore`；其他机器须通过 `ZHIZHI_DEBUG_KEYSTORE` 指向同一 v1 私钥。APK 放到上级 `知枝-1.1.0.apk`。签名核对记录见 `apk-verification.json`。

数据库保持 `zhizhi-app` / `state` / `document`，档案格式保持 `zhizhi-personal-2`。旧文档迁移保留学习树 ID、卡片、阅读位置、记忆和事件；未完成任务重开后标为中断，用户手动重试。

## 功能与验收边界

保留需求整理、路线、资料导入与有限百科检索、完整节点和短卡片、主动答疑、反馈记忆、结算、自愿加强、知识树、档案恢复及任务取消。主线不强制测验，阅读与加强证据分开。

43 项自动测试通过；正式 React 界面 19 项浏览器场景通过。真实模型输出使用模拟传输做回归，浏览器 UI 使用标注的演示。真实 DeepSeek Key、目标手机覆盖安装、前后台切换和长期性能尚待验收，不能以本轮检查宣称已经真机稳定。

完整产品说明见上级 `知枝-1.1使用与验收说明.md`，工程边界见仓库 `docs/工程架构与开发规范.md`。
