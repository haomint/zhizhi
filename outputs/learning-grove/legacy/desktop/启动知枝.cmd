@echo off
setlocal
set PYTHONUTF8=1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch.ps1"
set "GROVE_EXIT=%errorlevel%"
if not "%GROVE_EXIT%"=="0" if not defined GROVE_NO_PAUSE pause
exit /b %GROVE_EXIT%
