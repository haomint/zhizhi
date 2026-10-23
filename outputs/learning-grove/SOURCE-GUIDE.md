# 知枝项目源码 · 安卓 0.6.1

## 这是什么

当前开发源文件汇总，包含网页预览、Python 本地服务、安卓工程、手机本地业务层、内置教学规则和检查脚本。源码包不是直接安装包，也不包含开发环境。

项目目标：个人使用的安卓学习助手，本地存储资料，手机直连 DeepSeek；没有账号和自建服务的要求。网页仍作为开发预览载体。

## 目录

- outputs/learning-grove/static：主页、卡片、学习树、个人资料界面。
- static/mobile-service.js：安卓本地资料存储、教学流程与历史检索。
- android/app/src/main/java/app/zhizhi/personal：密钥加密、模型请求、系统分享。
- skills：需求整理、路线、卡片和答疑规则。
- server.py、model_service.py：电脑本地预览服务和模型配置。
- prepare-mobile.py：准备公开教学规则、固定演示数据及框架运行库。
- build-android.ps1：安卓构建入口。
- work：部分关键行为检查脚本。

ANDROID-PLAN.md 记录当前实现及未完成项；旧 README 中的版本说明属于历史说明，以本文及推进记录为准。

## 电脑本地运行

安装 Python 3.10 或更高版本，进入 outputs/learning-grove，运行“启动知枝.cmd”。初次运行创建新的本地资料库，密钥需自行配置。电脑版本的密钥加密使用 Windows DPAPI。

## 安卓构建

需要 Python、Node.js（本次使用24）、OpenJDK 21、Android SDK 36、Build Tools 35/36，以及可访问依赖仓库的网络。

在 outputs/learning-grove 执行 npm ci，安装锁定依赖。build-android.ps1 当前约定的环境位置：

- .tools/java/<JDK目录>/bin/java.exe
- .tools/android-sdk（含 platforms/android-36、build-tools、cmdline-tools）
- 可选 .tools/gradle/gradle-8.14.3；否则使用工程 Gradle Wrapper 自动下载。

配置好后运行 build-android.ps1；脚本准备资源、同步安卓工程、编译 Debug APK，输出到上一级“知枝-安卓验证版.apk”。需要接受 Android SDK 许可；网络代理应按本机情况配置，源码未硬编码个人代理地址。

也可以在 Android Studio 打开 android 文件夹，用本机 JDK/SDK 构建；先运行 python prepare-mobile.py 和 npm run android:sync。

安卓固定应用标识 app.zhizhi.personal。源码未包含原签名私钥：另一台电脑自动生成的开发签名无法保证覆盖原安装版本，请不要为解决签名冲突直接卸载有重要资料的应用。正式连续更新需保管并复用签名。

## 当前能力与限制

已实现需求整理、路线与短卡片、学习树、问答历史、相关交流检索、本地进度、记忆管理、分支、系统分享导出。最小独立运行版已由用户真机验证；0.6.1 完整迁移版已编译及模拟检查，仍需完整真机验收。

尚未完成备份导入、前后台与返回行为专项优化、诊断导出及进一步的教学逻辑优化。问答草稿目前仅在会话内保存。安卓密钥始终通过系统加密保存；界面通用设置中的取消记住选项尚未独立适配。

## 数据与授权

不含个人资料库、API Key、日志、签名私钥、node_modules、JDK、SDK、构建缓存及 APK。静态示例来自项目固定演示内容。Capacitor 运行库许可附在 THIRD-PARTY-CAPACITOR-LICENSE.txt；其他依赖许可随 npm 安装提供。

源码尚未声明对外开源许可；整理源码不等于授权第三方公开发布或商用。
