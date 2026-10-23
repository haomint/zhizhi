# 知枝 · 1.0 开发与交付入口

- 正式源码：`outputs/learning-grove/`。
- 使用与验收：`outputs/知枝-1.0使用与验收说明.md`。
- 安装包：`outputs/知枝-1.0.0.apk`。
- 源码包：`outputs/知枝-1.0.0-源码.zip`（不含依赖、构建产物、签名和本地数据库）。
- 产品策划：`outputs/知枝-MVP完整策划案.md`；专项指导保留设计细节。
- 独立 Pi 验证：`outputs/pi-mobile-probe/`，作为技术参照。

1.0 已接通约定的个人学习 MVP 核心流程，详见交付说明中的功能与验证边界。手机真实模型和真机验收由用户执行。

```bash
cd outputs/learning-grove
npm ci
npm run check
python3 scripts/build_android.py
```

本地 Git 标签：`pre-integration-20261023`（清理前）、`ready-0.7.0`（开工基线）、`v1.0.0`（本次交付）。未推送到远端。

Key、签名私钥、本地数据库、安装包和工具缓存不进入 Git。0.6.1 与当前签名不同，保留旧 App 并用档案导出/导入迁移；0.7 整合版与 1.0 使用同一应用 ID 与签名。Git 源码回退不等于手机数据回退。
