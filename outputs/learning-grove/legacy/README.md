# 历史实现与验证记录

`desktop/` 保留早期 Python 桌面运行实现及启动器，`verification/` 保留旧 DOM 界面的浏览器脚本。它们仅用于追溯，不是当前应用入口，也不进入 1.1 的 npm 检查流程。

当前应用入口是 `src/main.tsx`，业务服务为 `src/application/service.ts`，Pi 与教学核心在 `src/core/*.ts`。使用项目根目录的 `npm run dev`、`npm run check` 和 Android 构建脚本。旧版本完整源码可从 Git 标签 `v1.0.1` 取回。
