$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$jdk = Get-ChildItem "$PSScriptRoot/.tools/java" -Directory | Select-Object -First 1
if (!$jdk -or !(Test-Path "$PSScriptRoot/.tools/android-sdk/platforms/android-36/android.jar")) {
    throw '构建环境尚未准备完成：需要项目内 JDK 21 与 Android SDK 36。'
}
$env:JAVA_HOME = $jdk.FullName
$env:ANDROID_HOME = "$PSScriptRoot/.tools/android-sdk"
$env:GRADLE_USER_HOME = "$PSScriptRoot/.tools/gradle-cache"
& python "$PSScriptRoot/prepare-mobile.py"
if ($LASTEXITCODE -ne 0) { throw '移动端资源准备失败' }
& npm.cmd run android:sync
if ($LASTEXITCODE -ne 0) { throw '安卓资源同步失败' }
Push-Location android
try {
    $localGradle = "$PSScriptRoot/.tools/gradle/gradle-8.14.3/bin/gradle.bat"
    if (Test-Path $localGradle) {
        & $localGradle assembleDebug --no-daemon
    } else {
        & ./gradlew.bat assembleDebug --no-daemon
    }
    if ($LASTEXITCODE -ne 0) { throw 'APK 构建失败' }
} finally { Pop-Location }
Copy-Item -LiteralPath 'android/app/build/outputs/apk/debug/app-debug.apk' -Destination '../知枝-安卓验证版.apk' -Force
Write-Output '已生成 outputs/知枝-安卓验证版.apk；尚需手机安装验收。'
