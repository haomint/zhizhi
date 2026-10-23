param([switch]$StopApp)
$ErrorActionPreference = 'Stop'
$taskTarget = 'C:\Users\xiang\Documents\ChatGPT\三创赛\outputs\learning-grove\launch.ps1'
if ($StopApp) { & $taskTarget -StopApp } else { & $taskTarget }
exit $LASTEXITCODE
