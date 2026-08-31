<#
.SYNOPSIS
Drive the leveled-gladiator arena route: level a saved gladiator by winning the
game's own fights, or fight a tournament to its rank-1 bout.

THIS SCRIPT CHANGES THE LICENSED SAVE. It is the only thing in this repository
that does, and that is not incidental - it is the point. Root frame 150 calls
save_character() and flushes the SharedObject on EVERY town-square entry, and
this route passes through town square on the way in and after every win
(docs/integration/ss2-arena-route.md section 8). Gold, experience, level,
equipment and battle counters are all persisted.

So the script refuses to start without a fresh snapshot name, takes the
snapshot itself, and hashes ss2_data.sol before and after so the mutation is
recorded rather than assumed. Restore with:

  powershell -File tools\runtime-capture\save-state.ps1 restore <name>

Nothing here touches the mouse, the keyboard or the foreground window.

.EXAMPLE
# The dry run: one prisoner fight and one level-up, which exercises GATE A,
# GATE C and GATE D. A fresh level-1 gladiator is routed to the dungeon by the
# game itself, so this needs no staging beyond the saved slot.
powershell -File tools\runtime-capture\run-arena.ps1 `
  -SessionId arena-dry-1 -Snapshot pre-arena-dry-1 -ArenaTarget level:2

.EXAMPLE
# Level to the tournament gate.
powershell -File tools\runtime-capture\run-arena.ps1 `
  -SessionId arena-level-1 -Snapshot pre-arena-level-1 -ArenaTarget level:4

.EXAMPLE
# Capture the tournament rank-1 bout. Requires a level-4 gladiator with
# current_tournament == 1.
powershell -File tools\runtime-capture\run-arena.ps1 `
  -SessionId arena-champ-1 -Snapshot pre-arena-champ-1 `
  -ArenaTarget tournament -ArenaCapture champion `
  -FixturePath test\fixtures\ss2-1v1\candidate-tournament-nonlethal-normal-hit.json `
  -ObservationId obs-champ-1
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string] $SessionId,
    # A NEW snapshot name. save-state.ps1 refuses to reuse one, which is what
    # forces every save-mutating run to leave a distinct restore point behind.
    [Parameter(Mandatory = $true)] [string] $Snapshot,
    # 'level:<n>' fights duels until herolevel reaches n (a level-1 gladiator's
    # first fight is the dungeon prisoner, because frame 113 routes it there and
    # this route never shortcuts the game's own frames). 'tournament' enters the
    # ladder and fights it to rank 1.
    [string] $ArenaTarget = 'level:4',
    # 'never' (a levelling run is staging, not evidence), 'champion' (arm only
    # for the tournament rank-1 bout), or 'always'.
    [ValidateSet('never', 'champion', 'always')] [string] $ArenaCapture = 'never',
    # Only read when $ArenaCapture is not 'never'; a tape is still required by
    # the launcher, and a non-capturing run is launched passive so the tape can
    # never reach a fight nobody staged.
    [string] $FixturePath = 'test\fixtures\ss2-1v1\candidate-lethal-result.json',
    [string] $ObservationId = '',
    [string] $ArenaPolicy = 'aggressive',
    # A time dilation, not a frame shortcut: every frame still executes in
    # order. It also reduces the number of 1.5s WALL-CLOCK time_of_day ticks a
    # bout costs, which is what keeps GATE A's ceiling comfortable.
    [int] $FrameRate = 960,
    [int] $LaunchTimeoutSec = 300,
    [int] $RouteTimeoutSec = 900,
    # GATE A bounds, handed to the wrapper. The game's special event fires at
    # time_of_day >= 200 and permanently mutates charisma, magicka or gold.
    [int] $TimeOfDayCeiling = 150,
    [int] $SessionLimitSec = 900
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $projectRoot

if (-not $ObservationId) { $ObservationId = "$SessionId-obs" }
$logPath = Join-Path $projectRoot "captures\$SessionId\$ObservationId.rufflelog"

function Get-SaveFile {
    $root = Join-Path $env:LOCALAPPDATA 'ruffle\SharedObjects'
    if (-not (Test-Path $root)) { return $null }
    return Get-ChildItem $root -Recurse -File -Filter 'ss2_data.sol' | Select-Object -First 1
}
function Get-SaveState {
    $file = Get-SaveFile
    if (-not $file) { return 'ABSENT' }
    $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
    return "$($file.Length) bytes  sha256 $hash"
}
function Show-ArenaTrail {
    param([int] $Last = 40)
    if (-not (Test-Path $logPath)) { Write-Host '(no log)'; return }
    Select-String -Path $logPath -Pattern '"at":"arena"' |
        Select-Object -Last $Last |
        ForEach-Object { $_.Line -replace '^.*avm_trace: ', '  ' }
}

if (Get-Process ruffle -ErrorAction SilentlyContinue) {
    throw 'A Ruffle window is already open; close it before an arena run.'
}

# The snapshot is taken FIRST and by this script, not left to the operator.
# Every previous save-mutating hazard on this project was a step someone
# remembered to do rather than one the tool did.
Write-Host "Snapshotting the save as '$Snapshot' before anything is launched..."
powershell -NoProfile -ExecutionPolicy Bypass `
    -File (Join-Path $PSScriptRoot 'save-state.ps1') snapshot $Snapshot
if ($LASTEXITCODE -ne 0) { throw "Snapshotting failed; refusing to run a save-mutating session." }

$saveBefore = Get-SaveState
Write-Host "Save before: $saveBefore"

$launchOut = Join-Path $projectRoot "captures\$SessionId\launcher.log"
New-Item -ItemType Directory -Path (Split-Path -Parent $launchOut) -Force | Out-Null

# Every path is quoted: this repo lives under a directory containing spaces and
# Start-Process joins its argument array with plain spaces.
$launcherScript = Join-Path $PSScriptRoot 'launch-capture.ps1'
$launcherArgs = @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', "`"$launcherScript`"",
    '-FixturePath', "`"$FixturePath`"",
    '-SessionId', "`"$SessionId`"",
    '-ObservationId', "`"$ObservationId`"",
    '-Navigate', 'arena',
    '-Autopilot', '',
    '-ArenaTarget', "`"$ArenaTarget`"",
    '-ArenaPolicy', "`"$ArenaPolicy`"",
    '-ArenaCapture', "`"$ArenaCapture`"",
    '-TimeOfDayCeiling', "$TimeOfDayCeiling",
    '-SessionLimitSec', "$SessionLimitSec",
    '-FrameRate', "$FrameRate",
    '-SkipPipeline'
)
# A levelling run must not have a tape available to serve. The wrapper only
# consumes one while armed, and a non-capturing run never arms - but passive is
# the belt to that braces, and it costs nothing.
if ($ArenaCapture -eq 'never') { $launcherArgs += '-Passive' }

Write-Host "Launching the arena route (target '$ArenaTarget', capture '$ArenaCapture')..."
$launch = Start-Process -FilePath 'powershell' -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput $launchOut -RedirectStandardError "$launchOut.err" `
    -ArgumentList $launcherArgs

$deadline = (Get-Date).AddSeconds($LaunchTimeoutSec)
while (-not (Get-Process ruffle -ErrorAction SilentlyContinue)) {
    if ((Get-Date) -gt $deadline) { throw 'The Ruffle window never appeared.' }
    Start-Sleep -Milliseconds 500
}

Write-Host 'Routing (no input required). Watching for the route to finish or abort...'
$outcome = 'TIMEOUT'
$routeDeadline = (Get-Date).AddSeconds($RouteTimeoutSec)
while ((Get-Date) -lt $routeDeadline) {
    if (Test-Path $logPath) {
        if (Select-String -Path $logPath -Pattern '"step":"TARGET-REACHED' -SimpleMatch -Quiet) {
            $outcome = 'REACHED'; break
        }
        if (Select-String -Path $logPath -Pattern '"step":"ABORT:' -SimpleMatch -Quiet) {
            $outcome = 'ABORTED'; break
        }
    }
    if (-not (Get-Process ruffle -ErrorAction SilentlyContinue)) { $outcome = 'WINDOW-GONE'; break }
    Start-Sleep -Milliseconds 700
}

Write-Host 'Closing the window...'
Get-Process ruffle -ErrorAction SilentlyContinue | Stop-Process -Force -Confirm:$false
$launch.WaitForExit()

Write-Host ''
Write-Host '--- arena route trail ---'
Show-ArenaTrail

$saveAfter = Get-SaveState
Write-Host ''
Write-Host '--- save state ---'
Write-Host "  before: $saveBefore"
Write-Host "  after:  $saveAfter"
if ($saveBefore -eq $saveAfter) {
    Write-Host '  UNCHANGED (byte-identical). Note this does NOT mean no flush occurred.'
} else {
    Write-Host '  CHANGED. Restore with:'
    Write-Host "    powershell -File tools\runtime-capture\save-state.ps1 restore $Snapshot"
}

Write-Host ''
Write-Host "Route outcome: $outcome"
Write-Host "Raw log: $logPath"
if ($outcome -ne 'REACHED') { exit 1 }
exit 0
