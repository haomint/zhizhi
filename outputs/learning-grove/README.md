# 知枝 1.0

个人安卓学习助手：Pi Core 1.4.0 在手机运行，DeepSeek 负责模型推理，IndexedDB 保存学习记录，Android Keystore 保存 Key。应用 ID 为 `app.zhizhi.personal.integration`，versionCode 4。与 0.7 整合版相同签名，可覆盖升级；与早期 0.6.1 并存，通过导出/导入迁移学习档案。

## 已实现

需求与关键补问、路线轮廓及确认变更、百科检索/文字材料导入、知识整理、页序、卡片、质量检查与一次修订、主动答疑、明确反馈、事件结算、个人策略、记忆纠正与遗忘、自愿加强证据、知识树、当前/下一节点准备、取消及中断恢复、内容历史回退、档案合并/替换/恢复。

默认正文为讲述和完整例子，不强制测验。阅读点亮与加强通过分开。核心缺少依据或内容检查未通过时不发布。

## 构建

```bash
npm ci
npm run check
python3 scripts/doctor.py
python3 scripts/build_android.py
python3 scripts/verify_apk.py
```

Windows 使用 `python` 或 `build-android.ps1`。设置 JDK 21 的 JAVA_HOME 与含 API 36 的 ANDROID_HOME。当前工作区自动复用 `work/pi-probe-tools`；构建脚本显式复用其中保留的开发签名。换机器时通过 ZHIZHI_DEBUG_KEYSTORE 指向同一私钥文件，切勿放入源码包。产物位于上级 `知枝-1.0.0.apk`。

`npm run build` 从 manifest 同步十二份规则，编译真实 Pi 浏览器包，并检查 Agent loop 已进入产物。规则按阶段及学科选择加载。

## 代码入口

- `src/runtime.mjs` / `transport.mjs`：Pi Agent、只读工具与模型协议、预算。
- `src/validate.mjs`：各阶段 JSON 及来源、质检、事件证据契约。
- `src/domain.mjs`：版本、事件、个人记录、遗忘和档案导入。
- `src/learning.mjs`：生成流水线、结算、加强与路线变更。
- `static/mobile-service.js`：IndexedDB 事务、任务状态、原生桥接、旧结果拦截。
- `static/app.js` / `v1-ui.js`：主阅读体验与新增功能入口。
- `skills/manifest.json`：规则版本与启用阶段；`config/providers.json`：公开提供方配置。
- `android/.../PersonalPlugin.java`：加密 Key、模型 HTTPS、资料检索、取消和分享。
- `tests/`：自动回归；`scripts/verify_v1.cjs`：本环境浏览器验收脚本。

## 预览及边界

`python3 scripts/preview_server.py --port 5175` 是浏览器预览，可使用固定演示、本地功能和百科资料；不接受模型 Key。预览模拟桥没有真实 Capacitor.getPlatform，实际安卓不会进入该分支。

Python 桌面 `server.py` 和 Windows 启动器仍是历史实现，不作为 1.0 正式运行路径。手机使用 APK，不要求电脑常开。

检索只覆盖中文 Wikipedia 摘要及用户导入的文字，不是通用网页/PDF 抓取。模型结果经过程序门槛与 AI 检查，仍需核对重要内容。模拟模型自动测试不代表真实账户或真机通过。通用 skill 自动升级按既定范围后置。

详细使用与验收见上级 `知枝-1.0使用与验收说明.md`。测试记录见 `verification.json` 和 `apk-verification.json`。
