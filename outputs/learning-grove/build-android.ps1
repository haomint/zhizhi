$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
& python scripts/build_android.py
if ($LASTEXITCODE -ne 0) { throw 'APK 构建失败' }
