# 知枝 · 开发入口

当前产品基线：`outputs/知枝-MVP完整策划案.md`（3.1）。本轮工程基线：安卓整合验证版 0.7.0。

- 正式项目：`outputs/learning-grove/`，后续业务开发在这里进行。
- 独立技术参照：`outputs/pi-mobile-probe/`，保留已验证的最小 Pi 循环和故障测试。
- 开工清单：`outputs/知枝-开工准备与验收.md`，区分已实现、已备规则和待开发。
- 专项设计：需求分析、内容生成、卡片与加强学习、全流程总览四份指导。
- `work/`：历史回归脚本、本机工具缓存、验收资料；不是应用源码入口。

## 开发命令

```bash
cd outputs/learning-grove
npm ci
npm run check
python3 scripts/doctor.py
python3 scripts/build_android.py
```

Windows 使用 `python`，设置 `JAVA_HOME`（JDK 21）、`ANDROID_HOME`（SDK API 36），或运行项目中的 `build-android.ps1`。当前工作区自动复用 `work/pi-probe-tools`。手机安装 APK 后无需这些开发依赖。

## 版本与历史

本地 Git 已建立；没有推送至 GitHub 或其他远端。

- `pre-integration-20261023`：清理前源码与设计基线。
- `ready-0.7.0`：本次交付基线（完成检查后创建）。

历史文件可用 `git show pre-integration-20261023:相对路径` 查看。请先导出手机学习档案，再测试升级；安装更旧 APK 不等于回滚数据结构。

密钥、签名、数据库、安装包和工具缓存不进入 Git。清理详情见 `outputs/仓库清理清单.json`。旧分发压缩包和已解压安装器已删除；此前原型网页及两份验证 APK 保留作参照。
