param([string]$InputPath, [string]$OutputPath)
$ErrorActionPreference = 'Stop'
$taskWord = $null
$taskDocument = $null
try {
    $taskInput = (Resolve-Path -LiteralPath $InputPath).Path
    $taskOutput = [System.IO.Path]::GetFullPath($OutputPath)
    New-Item -ItemType Directory -Path ([System.IO.Path]::GetDirectoryName($taskOutput)) -Force | Out-Null
    $taskWord = New-Object -ComObject Word.Application
    $taskWord.Visible = $false
    $taskWord.DisplayAlerts = 0
    $taskWord.AutomationSecurity = 3
    $taskDocument = $taskWord.Documents.Open($taskInput, $false, $true, $false)
    $taskDocument.Repaginate()
    $taskDocument.Fields.Update() | Out-Null
    $taskDocument.ExportAsFixedFormat($taskOutput, 17)
    Write-Output ('Rendered pages: ' + $taskDocument.ComputeStatistics(2))
    Write-Output $taskOutput
} finally {
    if ($taskDocument) { $taskDocument.Close(0); [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($taskDocument) }
    if ($taskWord) { $taskWord.Quit(0); [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($taskWord) }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
