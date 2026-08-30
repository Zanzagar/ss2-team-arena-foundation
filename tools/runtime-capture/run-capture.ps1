<#
.SYNOPSIS
Run one capture session end to end without hand-playing it.

Sequence: launch the instrumented session, drive the fixed menu route with
synthetic input (title -> play -> load gladiator -> select -> confirm ->
prologue -> versus), let the in-wrapper autopilot perform the battle actions,
wait for the wrapper to close its own trace, then close the window so the
launcher's delog/ingest/verify pipeline runs.

Only the menu bootstrap uses OS input, and only while the game is at fixed
menu screens; every in-battle action goes through the autopilot, because the
action icons move with the gladiator. Keep the desktop free during the menu
phase (roughly the first 40 seconds); the battle phase does not touch the
cursor.

.EXAMPLE
powershell -File tools\runtime-capture\run-capture.ps1 `
  -FixturePath test\fixtures\ss2-1v1\candidate-prisoner-normal-kill.json `
  -SessionId session-auto-2 -ObservationId obs-auto-2
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string] $FixturePath,
    [Parameter(Mandatory = $true)] [string] $SessionId,
    [Parameter(Mandatory = $true)] [string] $ObservationId,
    [string] $Autopilot = 'walkright*5,normal_attack',
    [int] $MenuTimeoutSec = 120,
    [int] $BattleTimeoutSec = 180
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $projectRoot
$ui = Join-Path $PSScriptRoot 'ui-automation.ps1'
$logPath = Join-Path $projectRoot "captures\$SessionId\$ObservationId.rufflelog"

function Invoke-Ui { param([string[]] $UiArgs)
    & powershell -NoProfile -ExecutionPolicy Bypass -File $ui @UiArgs | Out-Null
}
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

if (Get-Process ruffle -ErrorAction SilentlyContinue) {
    throw 'A Ruffle window is already open; close it before an automated run.'
}

Write-Host 'Launching instrumented session...'
$launch = Start-Process -FilePath 'powershell' -PassThru -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', (Join-Path $PSScriptRoot 'launch-capture.ps1'),
    '-FixturePath', $FixturePath,
    '-SessionId', $SessionId,
    '-ObservationId', $ObservationId,
    '-Autopilot', $Autopilot
) -WindowStyle Hidden

# The launcher verifies both installed hashes (about 107 MB) and compiles
# the wrapper with FFDec before the window appears; that routinely takes
# well over a minute, so this wait is generous.
$deadline = (Get-Date).AddSeconds(300)
while (-not (Get-Process ruffle -ErrorAction SilentlyContinue)) {
    if ((Get-Date) -gt $deadline) { throw 'The Ruffle window never appeared.' }
    Start-Sleep -Milliseconds 500
}
Start-Sleep -Seconds 3

Write-Host 'Driving the menu route...'
Invoke-Ui @('click', '-X', '320', '-Y', '341')   # play
Start-Sleep -Milliseconds 1500
Invoke-Ui @('click', '-X', '320', '-Y', '396')   # load saved gladiator
Start-Sleep -Milliseconds 1800
Invoke-Ui @('click', '-X', '120', '-Y', '157')   # first save slot
Start-Sleep -Milliseconds 1500
Invoke-Ui @('click', '-X', '548', '-Y', '402')   # confirm selection

# The prologue plays before the versus screen. Clicking the versus
# confirm position advances text screens harmlessly and starts the fight as
# soon as that screen appears; stop as soon as the arena is constructed.
Write-Host 'Advancing prologue to the arena...'
$deadline = (Get-Date).AddSeconds($MenuTimeoutSec)
while (-not (Test-Log '"at":"overlay-exists"')) {
    if ((Get-Date) -gt $deadline) { throw 'Never reached the arena; the menu route may have changed.' }
    Invoke-Ui @('click', '-X', '318', '-Y', '273')
    Start-Sleep -Milliseconds 1200
}

Write-Host 'Arena reached; autopilot has the battle. Cursor is free from here.'
if (-not (Wait-Log '"t":"end"' $BattleTimeoutSec 'the wrapper to close its trace')) {
    Write-Host 'No end line: dumping autopilot diagnostics.'
    if (Test-Path $logPath) {
        Select-String -Path $logPath -Pattern '"at":"autopilot"', '"at":"frame"', '"at":"action-armed"' |
            Select-Object -Last 12 | ForEach-Object { $_.Line -replace '^.*avm_trace: ', '' }
    }
}

Write-Host 'Closing the window so the pipeline runs...'
Get-Process ruffle -ErrorAction SilentlyContinue | Stop-Process -Force -Confirm:$false
$launch.WaitForExit()
Write-Host "Launcher exit code: $($launch.ExitCode)"
