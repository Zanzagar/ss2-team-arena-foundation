<#
.SYNOPSIS
Run one capture session start to finish with no human input and no cursor.

The wrapper navigates the game from its title screen to the target battle
using the game's own navigation calls, performs the battle actions through
the same entry point its buttons call, closes its own trace, and this script
then closes the window so the launcher's delog/ingest/verify pipeline runs.

Nothing here touches the mouse, the keyboard, or the foreground window, so
runs are safe to leave going while the machine is used for something else.

.EXAMPLE
powershell -File tools\runtime-capture\run-capture.ps1 `
  -FixturePath test\fixtures\ss2-1v1\candidate-prisoner-normal-kill.json `
  -SessionId session-auto-4 -ObservationId obs-auto-4
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string] $FixturePath,
    [Parameter(Mandatory = $true)] [string] $SessionId,
    [Parameter(Mandatory = $true)] [string] $ObservationId,
    [string] $Autopilot = 'walkright*5,normal_attack',
    [string] $Navigate = 'prisoner',
    [int] $LaunchTimeoutSec = 300,
    [int] $NavigateTimeoutSec = 180,
    [int] $BattleTimeoutSec = 180
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $projectRoot
$logPath = Join-Path $projectRoot "captures\$SessionId\$ObservationId.rufflelog"

function Test-Log { param([string] $Pattern)
    if (-not (Test-Path $logPath)) { return $false }
    return (Select-String -Path $logPath -Pattern $Pattern -SimpleMatch -Quiet) -eq $true
}
function Wait-Log { param([string] $Pattern, [int] $TimeoutSec, [string] $What)
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Test-Log $Pattern) { return $true }
        Start-Sleep -Milliseconds 700
    }
    Write-Host "Timed out waiting for $What."
    return $false
}
function Show-Diagnostics {
    if (-not (Test-Path $logPath)) { Write-Host '(no log)'; return }
    Select-String -Path $logPath -Pattern '"at":"nav"', '"at":"autopilot"', '"at":"action-armed"', '"at":"rootframe"' |
        Select-Object -Last 14 | ForEach-Object { $_.Line -replace '^.*avm_trace: ', '' }
}

if (Get-Process ruffle -ErrorAction SilentlyContinue) {
    throw 'A Ruffle window is already open; close it before an automated run.'
}

Write-Host 'Launching instrumented session...'
# The launcher must have its streams redirected: started hidden without
# redirection it fails to bring up the window (observed repeatedly), and the
# captured output doubles as the pipeline log for this run.
$launchOut = Join-Path $projectRoot "captures\$SessionId\launcher.log"
New-Item -ItemType Directory -Path (Split-Path -Parent $launchOut) -Force | Out-Null
# Every path is quoted: this repo lives under a directory containing spaces,
# and Start-Process joins an argument array with plain spaces, which
# otherwise truncates -File at the first space.
$launcherScript = Join-Path $PSScriptRoot 'launch-capture.ps1'
$launch = Start-Process -FilePath 'powershell' -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput $launchOut -RedirectStandardError "$launchOut.err" -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', "`"$launcherScript`"",
    '-FixturePath', "`"$FixturePath`"",
    '-SessionId', "`"$SessionId`"",
    '-ObservationId', "`"$ObservationId`"",
    '-Autopilot', "`"$Autopilot`"",
    '-Navigate', "`"$Navigate`""
)

# Hash verification of ~107 MB plus the FFDec wrapper compile happen before
# the window appears, so this wait is deliberately generous.
$deadline = (Get-Date).AddSeconds($LaunchTimeoutSec)
while (-not (Get-Process ruffle -ErrorAction SilentlyContinue)) {
    if ((Get-Date) -gt $deadline) { throw 'The Ruffle window never appeared.' }
    Start-Sleep -Milliseconds 500
}

Write-Host 'Navigating to the battle (no input required)...'
if (-not (Wait-Log '"step":"battle-ready"' $NavigateTimeoutSec 'the navigator to reach the battle')) {
    Show-Diagnostics
    Get-Process ruffle -ErrorAction SilentlyContinue | Stop-Process -Force -Confirm:$false
    $launch.WaitForExit()
    throw 'Navigation failed; see the diagnostics above.'
}

Write-Host 'Battle reached; autopilot performing the action...'
if (-not (Wait-Log '"t":"end"' $BattleTimeoutSec 'the wrapper to close its trace')) {
    Show-Diagnostics
}

Write-Host 'Closing the window so the pipeline runs...'
Get-Process ruffle -ErrorAction SilentlyContinue | Stop-Process -Force -Confirm:$false
$launch.WaitForExit()
Write-Host "Launcher exit code: $($launch.ExitCode)"
Write-Host '--- pipeline result ---'
Get-Content $launchOut -ErrorAction SilentlyContinue |
    Select-String -Pattern 'Extracted', 'MATCH', 'DIVERGE', 'rejected', 'Post-session' |
    Select-Object -Last 5 | ForEach-Object { $_.Line }
