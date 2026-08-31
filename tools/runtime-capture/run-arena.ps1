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
# current_tournament == 1 (snapshot 'level4-vitality-tournament-gate').
#
# The five candidate-champion-* fixtures each stage the per-piece <piece>_defence
# fields, which the wrapper's default watch list omits, and ingest refuses a
# trace whose staged dump omits a field the fixture stages. Hence -WatchFields.
# Run ONE member per session: campaign.mjs reports 2 fixtures claiming attack
# direction 5 and 2 claiming direction 9, so a family run cannot serve them all.
#
# -ArenaStagedLevel is not optional here. Both herolevel and staminaleft carry
# across the two RNG-generated bouts that must be won to reach rank 1, so
# without it a run can silently produce a trace no second session reproduces.
powershell -File tools\runtime-capture\run-arena.ps1 `
  -SessionId arena-champ-2 -Snapshot pre-arena-champ-2 `
  -ArenaTarget tournament -ArenaCapture champion -ArenaStagedLevel 4 `
  -FixturePath test\fixtures\ss2-1v1\candidate-champion-normal-armour-absorbed.json `
  -ObservationId obs-champ-2 `
  -WatchFields "boot_defence,breastplate_defence,equipped_weapon,gauntlet_defence,greaves_defence,helmet_defence,shield_defence,shinguard_defence,shoulderguard_defence,weapon_enchantment_potency,weapon_enchantment_type"

.EXAMPLE
# The tournament family needs no extra watch fields: the default list covers it.
powershell -File tools\runtime-capture\run-arena.ps1 `
  -SessionId arena-tourn-3 -Snapshot pre-arena-tourn-3 `
  -ArenaTarget tournament -ArenaCapture champion -ArenaStagedLevel 4 `
  -FixturePath test\fixtures\ss2-1v1\candidate-tournament-nonlethal-normal-hit.json `
  -ObservationId obs-tourn-3
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
    # Combatant state written before the first action, as field:value comma
    # lists. The ONLY place the wrapper authors game state; see stepStaging.
    [string] $StageHero = '',
    [string] $StageVillain = '',
    # Equip through the game OWN purchase path. Gold is the one field no combat
    # site reads; the shop ids are the HIGHEST to try, stepping down until the
    # game accepts one.
    [int] $StageGold = 0,
    [int] $ShopWeapon = 0,
    [int] $ShopArmour = 0,
    # Only read when $ArenaCapture is not 'never'; a tape is still required by
    # the launcher, and a non-capturing run is launched passive so the tape can
    # never reach a fight nobody staged.
    # Extra Object.watch fields, comma separated, ADDED to the wrapper's
    # default list rather than replacing it. Forwarded verbatim to
    # launch-capture.ps1, exactly as run-capture.ps1 already forwards it.
    #
    # Five candidate-champion-* fixtures need eleven of these, and until now the
    # only script exposing both -WatchFields and -Stage* was launch-capture.ps1,
    # which has no snapshot guard. The alternative was to put run-arena's guard
    # onto launch-capture.ps1 instead. This flag lives HERE, for two reasons.
    #
    # launch-capture.ps1 is the shared bottom layer. run-campaign.ps1 drives it
    # at -Concurrency 3 with per-session -SaveDirectory stores that provably do
    # not touch the licensed save (three concurrent sessions completed and the
    # master ss2_data.sol was byte-identical afterwards). A snapshot guard there
    # would demand a fresh restore point from runs that mutate nothing, so it
    # would have to be opt-out - and an opt-out guard is precisely the defect
    # class this project already closed once, when the launch-nonce gate turned
    # out to be opt-out and two forgeries walked straight through it.
    #
    # Keeping the guard in run-arena.ps1 alone also keeps the invariant worth
    # having: the only save-mutating script is the one that snapshots, and it
    # snapshots itself rather than trusting an operator to remember.
    #
    # run-arena.ps1 is already in campaign.mjs's VEHICLE_SCRIPTS, and that file
    # reads each launcher's capabilities out of its own param() block rather
    # than from a table, so `campaign.mjs plan` reports this the moment it
    # exists here. No second edit keeps it honest.
    [string] $WatchFields = '',
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
    '-StageHero', "`"$StageHero`"",
    '-StageVillain', "`"$StageVillain`"",
    '-StageGold', "$StageGold",
    '-ShopWeapon', "$ShopWeapon",
    '-ShopArmour', "$ShopArmour",
    '-TimeOfDayCeiling', "$TimeOfDayCeiling",
    '-SessionLimitSec', "$SessionLimitSec",
    '-FrameRate', "$FrameRate",
    '-SkipPipeline'
)
# A levelling run must not have a tape available to serve. The wrapper only
# consumes one while armed, and a non-capturing run never arms - but passive is
# the belt to that braces, and it costs nothing.
if ($ArenaCapture -eq 'never') { $launcherArgs += '-Passive' }

# Only appended when set, so an empty -WatchFields leaves the launcher
# invocation byte-identical to what it was before this flag existed. A run that
# matches an existing golden therefore cannot be perturbed by the flag's
# addition - which matters, because a watched field CAN add a mutation line to
# a trace (campaign.mjs refuses to run the armoured family as one family for
# exactly that reason).
if ($WatchFields) { $launcherArgs += @('-WatchFields', "`"$WatchFields`"") }

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
            # A CAPTURE run is finished the moment the trace closes, and winning
            # the bout is beside the point. The wrapper arms on the first
            # checkattackroll and closes on that call's return, so the evidence
            # is one action - what happens to the gladiator afterwards changes
            # nothing about it. Waiting for the bout to be won instead would
            # throw away good captures against an opponent nobody can beat,
            # which is exactly the champion's case.
            # An ABORT is checked FIRST, before a closed trace. The wrapper's
            # hooks keep running after arenaAbort - only the navigator stops -
            # so a run that hit a gate and then armed would otherwise be
            # reported as a successful capture. The wrapper now also refuses to
            # arm once aborted; this is the other half of that fix, and the
            # cheaper half to get wrong.
            $abort = Select-String -Path $logPath -Pattern '"step":"ABORT:' -SimpleMatch |
                Select-Object -First 1
            if ($abort) {
                $outcome = 'ABORTED'
                if ($abort.Line -match '"step":"ABORT:([a-z-]+)"') { $abortReason = $Matches[1] }
                break
            }
            if ($ArenaCapture -ne 'never' -and
                (Select-String -Path $logPath -Pattern '"t":"end"' -SimpleMatch -Quiet)) {
                $outcome = 'CAPTURED'; break
            }
            if (Select-String -Path $logPath -Pattern '"step":"TARGET-REACHED' -SimpleMatch -Quiet) {
                $outcome = 'REACHED'; break
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

    if ($outcome -eq 'REACHED' -or $outcome -eq 'CAPTURED') { break }
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
if ($outcome -ne 'REACHED' -and $outcome -ne 'CAPTURED') { exit 1 }
exit 0
