# 知枝 Pi 手机最小验证 · 0.1.0

这是一个独立技术验证应用，用来回答“Pi Core 能否在现有 Capacitor 安卓技术路线中运行”，不是完整知枝产品，也不替代原知枝安装包。

## Pi 是什么

Pi 是一组构建 AI Agent 的运行组件。本版实际安装并打包 `@earendil-works/pi-agent-core@1.4.0`，由真实 Pi `Agent` 处理模型消息、工具执行和下一轮模型请求。应用负责实际工具、本地数据库、密钥、网络和结果验证。

本版使用 `pi-ai@1.4.0` 的消息及事件流工具，提供自定义非流式 DeepSeek 网络适配器。它把完整 HTTP 回复转换成 Pi 事件；不是模型逐字流式输出，也不是自己重写一个循环冒充 Pi。

完整 Pi Coding Agent SDK 的 skills 自动发现、扩展系统和会话管理不在本次验证内。浏览器打包成功不等于 Pi 所有功能都兼容安卓。

## 验证的最小链

1. 输入主题，触发第一次模型请求，要求模型调用 `read_learning_context`。
2. **Pi 执行真实本地工具**，从 IndexedDB 读取偏好、固定材料和版本，附加本轮随机标记。
3. Pi 把工具结果回传模型，发出第二次请求。
4. 模型依据工具结果生成简短讲解，并带回该随机标记。
5. 程序检查实际工具执行、请求次数、最终 JSON 与随机标记，再用 IndexedDB 事务保存。

模型只给普通回答、未调用工具、标记错误、网络失败、输出截断或保存失败，都不能算通过。报告中的零模型费用未被计算为真实账单；本版只显示请求和耗时。

## 手机安装与使用

APK：`知枝-Pi手机验证-0.1.0.apk`。应用名称：**知枝 Pi 验证**；应用 ID：`app.zhizhi.piprobe`。使用独立开发签名，可与原知枝 `app.zhizhi.personal` 并存。此 APK 不读取原应用的数据库或密钥。

1. 把 APK 传到安卓手机，通过系统文件管理器安装。若系统询问，按设备流程允许该来源安装。
2. 打开“知枝 Pi 验证”，先点 **离线演练（模拟模型）**。无需 Key 或电脑。
3. 检查过程里出现 Pi 工具开始、读取偏好、工具完成，以及两次模型请求。此模式的模型回复是固定模拟数据，**不能证明 DeepSeek 接口可用**。
4. 展开“真实验证：设置 DeepSeek”，输入你自己的 API Key，点“加密保存 Key”。默认模型 `deepseek-flash`；若账户支持的模型名不同，可修改。
5. 点 **真实模型验证**。这会调用你的 API 并消耗账户额度；主题和本验证库中的资料会发送给 DeepSeek 官方地址。
6. 看到“本次真实模型＋Pi 工具循环已完成”后，检查讲解及“2 次模型请求 / 1 次工具”。改变本地偏好、保存并再次运行，看工具是否读取新值。
7. 退出后重开，检查真实结果仍在；断网后应能阅读已保存结果。
8. 点“导出验证报告”，通过系统分享或保存功能取得 JSON，必要时转回项目讨论。

浏览器网页仅提供离线演练。真实网络请求仅由 APK 内的原生插件执行，不依赖电脑服务，不需要 USB。

## 怎样判断通过

请分别判断三层，不能把它们合并：

| 层次 | 通过条件 |
| --- | --- |
| 手机运行与存储 | 能安装启动，离线演练完成，重开仍能读到结果 |
| 真实模型工具协议 | 真实模式完成，报告 mode=live，实际一次工具、至少两次请求，随机标记匹配 |
| 个性化内容质量 | 工具读到修改后的偏好，真实讲解是否体现它；这项需要人工看内容，随机标记本身不能证明教学效果 |

前两项通过，只证明当前版本、当前模型与设备上的最小兼容链；不表示联网搜索、完整教学流程、长期记忆、所有 Pi 插件或后台持续生成已通过。

## 取消、错误与数据

- 按“停止本次验证”会中止本地运行并请求原生层断开网络；切后台时也停止当前运行。服务商已经收到请求时，取消不保证撤销计费。
- 本次最多三次模型请求、一次本地工具执行，总运行上限约 150 秒；原生连接和读取也有超时。正常成功路径为两次请求。
- 密钥通过 Android Keystore AES-GCM 加密，普通 JS、IndexedDB 和报告中不保存密钥。系统自动备份关闭。
- 401 检查 Key，402 检查 API 余额，404 检查模型名，429 稍后重试。错误不覆盖已有成功结果。
- 报告不含 API Key，但包含验证主题、偏好和生成内容，分享前可自行查看。
- 卸载本独立应用会删除其验证记录。源码包不包含签名私钥；在另一台电脑重建的开发签名可能无法覆盖当前验证版。

## 本次已做的检查

以交付时的 `verification.json` 为准：真实 Pi 的模拟模型工具循环、错误处理测试、浏览器手机尺寸交互和持久化，以及安卓 APK 构建、签名与包内资源检查。

本环境没有用户的有效 API Key，也未操作验收手机，因此不声称真实 DeepSeek 账户调用或安卓真机测试已经通过。

## 源码构建

需要 Node.js 22.19+、JDK 21、Android SDK 36、Build Tools 35/36 和可用依赖网络。本次没有将这些大型开发工具装入源码包。

```bash
npm ci
npm test
npm run build
npx cap sync android
cd android
./gradlew assembleDebug
```

Windows 下最后一条使用 `gradlew.bat assembleDebug`。JDK 和 Android SDK 通过 Android Studio 或系统环境配置，`android/local.properties` 根据本机 SDK 位置生成。无需原知枝源码。

`npm run build` 会核对真实 Pi `agent-loop.js` 进入浏览器产物，并生成 `www/build-info.json`；无需 Node 内置模块垫片。`src/core.mjs` 是 Pi 与业务验证逻辑，`src/app.mjs` 是页面及原生桥接，`PiProbePlugin.java` 是加密密钥和 HTTPS 适配。

上层 UI 是简单验证页，不将内部工具日志带入正式知枝学习流程。本项目仅用于验证，暂无正式产品发布承诺。

## 官方依据

- [Pi Agent Core](https://github.com/earendil-works/pi/blob/main/packages/agent/README.md)
- [Pi SDK（区别于本次 Core）](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md)
- [DeepSeek Tool Calls](https://api-docs.deepseek.com/guides/tool_calls/)

直接依赖锁定于 package-lock.json。第三方许可见 THIRD-PARTY-NOTICES.md 及 LICENSES 目录。
