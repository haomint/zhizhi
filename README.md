# 知枝 · 1.0.1 开发与交付入口

- 正式源码：`outputs/learning-grove/`。
- 使用与验收：`outputs/知枝-1.0使用与验收说明.md`。
- 安装包：`outputs/知枝-1.0.1.apk`。
- 源码包：`outputs/知枝-1.0.1-源码.zip`（不含依赖、构建产物、签名和本地数据库）。
- 产品策划：`outputs/知枝-MVP完整策划案.md`；专项指导保留设计细节。
- 独立 Pi 验证：`outputs/pi-mobile-probe/`，作为技术参照。

1.0 已接通约定的个人学习 MVP 核心流程，详见交付说明中的功能与验证边界。手机真实模型和真机验收由用户执行。

```bash
cd outputs/learning-grove
npm ci
npm run check
python3 scripts/build_android.py
```

远程仓库：[Zhangchenhao-111/zhizhi](https://github.com/Zhangchenhao-111/zhizhi)（私有）。主分支为 `main`。

Git 标签：`pre-integration-20261023`（清理前）、`ready-0.7.0`（开工基线）、`v1.0.0`（原始 1.0 基线）、`v1.0.1`（续作修订）。

协作时先明确任务与验收条件，从最新 `main` 创建 `feat/功能名` 或 `fix/问题名` 分支；完成对应验证后提交 Pull Request，说明改动、验证结果和剩余问题，审查后合并。多人或多个 Agent 并行开发时使用独立克隆或 Git worktree，避免共用工作目录。

Key、签名私钥、本地数据库、安装包和工具缓存不进入 Git。1.0.1 使用独立应用 ID `app.zhizhi.personal.v1` 与单独保留的签名，可与 0.6.1、0.7 和原始 1.0 并行安装；通过 JSON 档案迁移，无需卸载旧 App。新签名保存在排除于 Git/源码包的 `work/release-signing/`，后续升级应复用。Git 源码回退不等于手机数据回退。
