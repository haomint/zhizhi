# 知枝 · 安卓整合验证版 0.7.0

安卓应用在本机运行 Pi Core 1.4.0、教学规则和 IndexedDB，使用 Personal 原生插件调用 DeepSeek。源码主应用 ID 为 `app.zhizhi.personal`。当前交付 debug 包使用 `app.zhizhi.personal.integration`，可与旧知枝并存。工作区签名与旧 0.6.1 不同，不能覆盖安装；旧应用资料与密钥不会自动导入新包。代码保留原存储命名约定，新增语义修订号缺省为 0。

## 当前能力

需求整理、路线、卡片和主动答疑通过真正的 Pi Agent 工具循环运行。每次只加载主规则与当前阶段；注册三个只读工具：任务上下文、任务相关记忆快照、实际提供的材料。没有配置外部搜索服务。

卡片每批一个完整节点，定义开篇，至少一个完整例子，最多八页。字段和类型经程序检查；这不等于事实准确性已获得独立核验。生成期间可阅读已保存卡片；目标、资料等语义变化会阻止旧结果提交。模型最多四次请求、六次工具执行、150 秒，不无限重试。

知识整理、页序、语义质量检查、结算和独立加强规则已纳入资源清单，尚未挂接业务入口。通用 skill 不会随用户使用自动改写。

## 构建与检查

```bash
npm ci
npm run check
python3 scripts/doctor.py
python3 scripts/build_android.py
```

Windows 可用 `python scripts/build_android.py` 或 `build-android.ps1`。JDK 21 和 API 36 SDK 通过 `JAVA_HOME`、`ANDROID_HOME` 设置；当前房间有可复用缓存。产物输出到上级目录 `知枝-整合验证版-0.7.0.apk`。本机路径只写入被忽略的 `android/local.properties`。

`npm run build` 根据 `skills/manifest.json` 同步全部规则，真实打包 Pi，并生成 `static/build-info.json`。新增规则必须登记清单；登记不等于业务阶段已启用。

## 预览与旧桌面入口

`python3 scripts/preview_server.py --port 5175` 提供安卓流程的离线网页预览，允许固定示例和本地进度；网页不接受密钥，不调用真实模型。该预览注入的模拟原生桥不会进入 APK。

`server.py` / Windows 启动器保留为旧桌面实现，尚未改为 Pi；不要用桌面路径的结果代表新版安卓验收。新开发应以安卓业务与运行层为准。

## 源码与安全边界

- `src/runtime.mjs`：Pi 任务、只读工具、预算；`transport.mjs`：完整工具消息传输。
- `src/validate.mjs`：四个业务阶段结果校验。
- `static/mobile-service.js`：移动业务、本地提交与过时结果拦截。
- `skills/manifest.json`：启用阶段、已准备阶段、学科参考、工具状态。
- `config/providers.json`：公开配置说明，不包含 Key。
- `android/.../PersonalPlugin.java`：加密密钥、原生 HTTPS、取消、分享。
- `tests/`：Pi 循环和移动事务测试；模拟模型不证明真实账户可用。

API Key 仅由用户在手机填写，模型名称可在设置修改。学习内容会随任务上下文发给所选模型。当前支持导出，导入恢复、事件结算和完整删除失效治理仍待实现。详细开工顺序见上级 `知枝-开工准备与验收.md`。
