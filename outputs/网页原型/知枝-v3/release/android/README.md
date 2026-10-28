# 知枝安卓连续阅读安装版

版本1.1.1，versionCode 7，网页总版本1.0.1。安装包名：`知枝-android-1.1.1.apk`；应用ID：`app.zhizhi.reading`，独立签名，可与旧 `app.zhizhi.personal.v1` 共存，不覆盖或迁移旧App数据。Android最低8.0/API26，目标API36。

本地打包当前HTML与Java WebView容器，启动无需电脑或网页服务器。页面数据与API Key保存在本应用的私有WebView存储；网络请求经原生HTTPS直接发往用户填写的接口，没有预置真实凭据。

构建：`python3 android/build-android.py`。工具用环境变量 `JAVA_HOME`、`ANDROID_BUILD_TOOLS`、`ANDROID_JAR` 配置，或使用仓库忽略目录 `work/android-tools` 中的JDK与Android官方构建工具。签名及口令存储于仓库忽略目录 `work/release-signing/zhizhi-reading.*`，单独安全备份，不包含在源码包中。换机器必须保留同一阅读版签名才能更新此包。

构建脚本会核对签名、应用ID、版本与打入APK的页面字节，记录在 `build-verification.json`。本轮没有真机或模拟器实测，API桥接通过Chromium模拟验证，真实账号需自行测试。

构建工具来源：[Android SDK命令行工具](https://developer.android.com/studio#command-line-tools-only)、[OpenJDK归档](https://jdk.java.net/archive/)。
