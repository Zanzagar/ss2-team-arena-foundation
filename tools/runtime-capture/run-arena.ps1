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
    # The herolevel a champion capture is staged for; the wrapper refuses to arm
    # unless the hero enters the rank-1 bout at exactly this level AND with full
    # stamina. Both carry across bouts from the two RNG-generated opponents that
    # must be beaten to reach rank 1, so without this a run can silently produce
    # a trace no second session can reproduce. Set it whenever -ArenaCapture is
    # 'champion'.
    [int] $ArenaStagedLevel = 0,
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
    [int] $SessionLimitSec = 900,
    # How many times to relaunch after a RECOVERABLE abort. Two aborts are
    # ordinary rather than exceptional on this route and neither is a defect:
    #
    #   battle-lost          duel opponents are generated per entry by
    #                        randomise_gladiator, and the spread is wide - a
    #                        level-2 hero beat a 30 hp unarmoured opponent and
    #                        then lost to one with 40 hp and 42 armour. A duel
    #                        loss is not terminal; it costs gold and battle
    #                        counters.
    #   special-event-screen root frame 150 draws 1 + RandomNumber(100) on
    #                        EVERY town-square entry and jumps to the special
    #                        event when it is <= 2 - a flat 2% per entry through
    #                        an opcode nothing can intercept, so a levelling run
    #                        making three to six entries fails this way roughly
    #                        6-12% of the time.
    #
    # Retries do NOT restore the snapshot. The save is written at town-square
    # entry, so it already holds the progress of every completed bout, and a
    # relaunch resumes from there exactly as a player would. Restoring would
    # throw away the wins that got us this far.
    [int] $Attempts = 1
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $projectRoot

if (-not $ObservationId) { $ObservationId = "$SessionId-obs" }
# Set per attempt in the retry loop below.
$logPath = ""

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
    # No -Autopilot: Start-Process's ArgumentList refuses an empty element, and
    # the launcher already defaults to none. The arena route drives its fights
    # from -ArenaPolicy, not from a step list.
    '-ArenaTarget', "`"$ArenaTarget`"",
    '-ArenaPolicy', "`"$ArenaPolicy`"",
    '-ArenaCapture', "`"$ArenaCapture`"",
    '-ArenaStagedLevel', "$ArenaStagedLevel",
    '-TimeOfDayCeiling', "$TimeOfDayCeiling",
    '-SessionLimitSec', "$SessionLimitSec",
    '-FrameRate', "$FrameRate",
    '-SkipPipeline'
)
# A levelling run must not have a tape available to serve. The wrapper only
# consumes one while armed, and a non-capturing run never arms - but passive is
# the belt to that braces, and it costs nothing.
if ($ArenaCapture -eq 'never') { $launcherArgs += '-Passive' }

# Recoverable aborts get another launch; everything else is a stop. A run that
# hit GATE A, GATE D or an unstaged capture has told us something, and relaunching
# would bury it.
$RECOVERABLE = @('battle-lost', 'special-event-screen')

$outcome = 'TIMEOUT'
$abortReason = ''
for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
    if ($attempt -gt 1) {
        Write-Host ''
        Write-Host "Recoverable abort ('$abortReason'); relaunching, attempt $attempt of $Attempts."
        Write-Host '  (not restoring the snapshot: the save already holds every completed bout)'
    }
    # A fresh log per attempt, so the trail of the attempt that mattered is not
    # buried under the ones that did not.
    $logPath = Join-Path $projectRoot "captures\$SessionId\$ObservationId-a$attempt.rufflelog"
    $attemptArgs = $launcherArgs.Clone()
    for ($i = 0; $i -lt $attemptArgs.Count; $i++) {
        if ($attemptArgs[$i] -eq '-ObservationId') { $attemptArgs[$i + 1] = "`"$ObservationId-a$attempt`"" }
    }

    Write-Host "Launching the arena route (target '$ArenaTarget', capture '$ArenaCapture')..."
    $launch = Start-Process -FilePath 'powershell' -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput $launchOut -RedirectStandardError "$launchOut.err" `
        -ArgumentList $attemptArgs

    $deadline = (Get-Date).AddSeconds($LaunchTimeoutSec)
    while (-not (Get-Process ruffle -ErrorAction SilentlyContinue)) {
        if ((Get-Date) -gt $deadline) { throw 'The Ruffle window never appeared.' }
        Start-Sleep -Milliseconds 500
    }

    Write-Host 'Routing (no input required). Watching for the route to finish or abort...'
    $outcome = 'TIMEOUT'
    $abortReason = ''
    $routeDeadline = (Get-Date).AddSeconds($RouteTimeoutSec)
    while ((Get-Date) -lt $routeDeadline) {
        if (Test-Path $logPath) {
            if (Select-String -Path $logPath -Pattern '"step":"TARGET-REACHED' -SimpleMatch -Quiet) {
                $outcome = 'REACHED'; break
            }
            $abort = Select-String -Path $logPath -Pattern '"step":"ABORT:' -SimpleMatch |
                Select-Object -First 1
            if ($abort) {
                $outcome = 'ABORTED'
                if ($abort.Line -match '"step":"ABORT:([a-z-]+)"') { $abortReason = $Matches[1] }
                break
            }
        }
        if (-not (Get-Process ruffle -ErrorAction SilentlyContinue)) { $outcome = 'WINDOW-GONE'; break }
        Start-Sleep -Milliseconds 700
    }

    Write-Host 'Closing the window...'
    Get-Process ruffle -ErrorAction SilentlyContinue | Stop-Process -Force -Confirm:$false
    $launch.WaitForExit()

    Write-Host ''
    Write-Host "--- arena route trail (attempt $attempt) ---"
    Show-ArenaTrail

    if ($outcome -eq 'REACHED') { break }
    if ($outcome -ne 'ABORTED' -or $RECOVERABLE -notcontains $abortReason) { break }
}

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
