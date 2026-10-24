param([switch]$StopApp)
$ErrorActionPreference = 'Stop'
$taskPython = $null
$taskBundledPython = Join-Path $PSScriptRoot '.runtime\python.exe'
if (Test-Path -LiteralPath $taskBundledPython) {
    $taskPython = $taskBundledPython
}
$taskCandidates = @(@{Name='py'; Prefix=@('-3')}, @{Name='python'; Prefix=@()}, @{Name='python3'; Prefix=@()})
foreach ($taskCandidate in $taskCandidates) {
    if ($taskPython) { break }
    $taskCommand = Get-Command $taskCandidate.Name -ErrorAction SilentlyContinue
    if (-not $taskCommand) { continue }
    if ($taskCommand.Source -like '*\Microsoft\WindowsApps\*') { continue }
    try {
        $taskArguments = @($taskCandidate.Prefix) + @('-c', 'import sys; assert sys.version_info >= (3, 10); print(sys.executable)')
        $taskDetected = & $taskCommand.Source @taskArguments 2>$null
        if ($LASTEXITCODE -eq 0 -and $taskDetected) {
            $taskPython = [string](@($taskDetected)[-1])
            break
        }
    } catch { }
}
if (-not $taskPython) {
    Write-Host 'Python 3.10 or newer was not found. Please install Python and then run this launcher again.'
    exit 1
}
$taskLaunch = Join-Path $PSScriptRoot 'launch.py'
if ($StopApp) { & $taskPython $taskLaunch --stop } else { & $taskPython $taskLaunch }
exit $LASTEXITCODE
