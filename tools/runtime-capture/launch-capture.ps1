<#
.SYNOPSIS
Launch one controlled licensed capture session.

Verifies the installed hashes, rebuilds the wrapper from source, injects the
target fixture's tape, and opens the licensed game (read in place via a
file: URL — never copied) inside the instrumented wrapper under portable
Ruffle.

With -Autopilot and -Navigate set (which every automated caller does), the
session needs no human input at all: the wrapper navigates the menus with the
game own calls, the autopilot performs the action through the same entry point
the on-screen buttons call, and the trace closes itself. No cursor, no window
focus, no clicking. Leave -Autopilot empty only if you deliberately want to
play the fight by hand.

The script then extracts the trace and runs ingest (with the live post-session
hash check) and verify automatically.

.EXAMPLE
powershell -File tools\runtime-capture\launch-capture.ps1 `
  -FixturePath test\fixtures\ss2-1v1\candidate-normal-threshold-hit.json `
  -SessionId session-20260831-a -ObservationId obs-20260831-a1
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string] $FixturePath,
    [Parameter(Mandatory = $true)] [string] $SessionId,
    [Parameter(Mandatory = $true)] [string] $ObservationId,
    [ValidateSet('hero', 'villain')] [string] $AttackerSide = 'hero',
    # Autopilot performs the in-battle actions by calling the game's own
    # action entry point, e.g. 'walkright*5,normal_attack'. Leave empty to
    # play the fight by hand.
    [string] $Autopilot = '',
    # 'prisoner' makes the wrapper navigate from the title screen to the
    # tutorial battle with the game's own calls, so no clicks are needed.
    [string] $Navigate = '',
    [switch] $Passive,
    # The campaign driver files the evidence itself: it ingests the trace
    # against every candidate in the target family and keeps the one that
    # matches. Verifying here first would write a divergence report every
    # time the game picked a different (equally valid) attack direction,
    # burying real disagreements in noise. With this set the session stops
    # once the raw log is written.
    [switch] $SkipPipeline,
    # Override and lock the player frame rate. This is a time dilation, not a
    # shortcut: every frame of the game still executes, in order, with all
    # inter-clip timing preserved, so it is categorically different from
    # jumping the playhead past the prologue (which trips the game own
    # character-tampering screen and voids the run). The whole wrapper is
    # frame-based - cooldowns, idle ticks, the autopilot wait limit - so it
    # scales with this automatically. 0 leaves the movie own rate.
    [int] $FrameRate = 0,
    # Isolated SharedObject store for this session. Ruffle shares one save
    # location by default, and a window that loaded older state flushes it
    # back on exit, clobbering a newer session - which is the only reason
    # sessions must be serialised.
    #
    # NOT YET USABLE, and left opt-in and empty by default for that reason.
    # The protective half works: a session given its own directory provably
    # cannot touch the real save (checked by hashing the master before and
    # after a run, and against a snapshot). The seeding half does not: Ruffle
    # wrote a fresh empty store into the isolated directory rather than
    # reading the seeded copy placed at the same relative path, so the game
    # found no saved gladiator and the navigator stalled on the slot screen
    # with max_gladiators unset. Until that is understood, a session started
    # this way cannot reach a battle, and parallel capture stays blocked on
    # it.
    [string] $SaveDirectory = "",
    # Extra Object.watch fields, comma separated, ADDED to the wrapper default
    # list rather than replacing it. Needed by fixtures that stage the
    # per-piece <piece>_defence fields, which the default omits and ingest
    # refuses a trace for when the fixture stages them. Leave empty for every
    # capture that matches an existing golden.
    [string] $WatchFields = "",
    # --- the leveled-gladiator arena route (-Navigate arena) --------------
    # These are inert unless -Navigate is 'arena'. See stepArenaNavigator in
    # ss2-capture-wrapper.as and docs/integration/ss2-arena-route.md.
    #
    # NOTE that the arena route is NOT save-neutral: root frame 150 flushes the
    # SharedObject on every town-square entry, and this route passes through it
    # on the way in and after every win. Use run-arena.ps1, which refuses to
    # start without a fresh snapshot, rather than calling this directly.
    #
    # 'level:<n>' fights duels until herolevel reaches n; 'tournament' enters
    # the ladder and fights it to rank 1.
    [string] $ArenaTarget = "",
    # 'aggressive' is the only policy; empty lets the wrapper pick it.
    [string] $ArenaPolicy = "",
    # Which bout of a multi-bout run may be recorded: 'never' (a levelling run
    # is staging, not evidence), 'champion' (the tournament rank-1 bout only),
    # or 'always'.
    [string] $ArenaCapture = "",
    # GATE A bounds. time_of_day advances on a 1.5s WALL-CLOCK interval outside
    # the battle; at 200 the game takes a special event that permanently
    # mutates charisma, magicka or gold and then saves it. 0 leaves the
    # wrapper's own defaults (150 and 900s).
    [int] $TimeOfDayCeiling = 0,
    [int] $SessionLimitSec = 0,
    # Force a fresh wrapper compile instead of reusing the content-addressed
    # build. The cache is keyed on the source hash and so cannot go stale; this
    # exists for diagnosing the FFDec step itself, not for correctness.
    [switch] $NoWrapperCache
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $projectRoot

$node = Get-Command node -ErrorAction SilentlyContinue
$nodeExe = if ($node) { $node.Source } else {
    'C:\Users\corey\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
$ruffle = Get-ChildItem -LiteralPath (Join-Path $projectRoot '.tools') -Filter 'ruffle.exe' -File -Recurse |
    Select-Object -First 1
if (-not $ruffle) { throw 'Portable Ruffle is not installed. Run tools/install-ruffle.ps1 first.' }

# One session at a time: a stale window that loaded older save state flushes
# it back on exit, silently clobbering everything a newer session saved
# (observed live - last writer wins).
#
# That hazard is a consequence of sharing one SharedObject store, and nothing
# else - so it is lifted exactly when the caller supplies its own. A session
# given -SaveDirectory reads and writes a private seeded copy, cannot see or
# overwrite another session's state, and leaves the real save untouched, so
# concurrent sessions are safe and the guard would only be in the way.
if (-not $SaveDirectory -and (Get-Process ruffle -ErrorAction SilentlyContinue)) {
    throw 'A Ruffle window is already open; close every capture window before launching a session, or give this one its own -SaveDirectory.'
}

Write-Host 'Pre-session install verification...'
& $nodeExe tools/capture-session.mjs verify-install
if ($LASTEXITCODE -ne 0) { throw 'The installed build does not match the pinned fingerprint. Aborting.' }

$sessionDirRelative = "captures\$SessionId"
New-Item -ItemType Directory -Path (Join-Path $projectRoot $sessionDirRelative) -Force | Out-Null

# The wrapper compile depends on nothing but ss2-capture-wrapper.as, so it is
# identical every round - and it is roughly half of the ~7s of fixed setup a
# ~14s capture round pays. The build is therefore CONTENT-ADDRESSED on the
# source hash and reused across sessions.
#
# Keyed on the source hash rather than a filename or a timestamp on purpose:
# reusing a stale wrapper would silently capture with the wrong
# instrumentation, which is the one failure mode a cache here could introduce.
# Any edit to the source produces a different directory and a fresh compile,
# so the cache cannot go stale - it can only be cold.
#
# This does NOT hoist the install hash verification above it. That is a
# per-session attestation, not setup, and it stays per session.
#
# Moving the wrapper SWF out of the per-session directory does not move the
# game's SharedObject. Ruffle keys a store by the path of the SWF that created
# it, and so_local is created by the GAME on _level1 - its store has stayed at
# the installed-game path across 163 sessions whose wrapper lived at 163
# different paths.
$wrapperSource = 'tools\runtime-capture\ss2-capture-wrapper.as'
$wrapperSourceHash = (Get-FileHash -LiteralPath $wrapperSource -Algorithm SHA256).Hash
$wrapperKey = $wrapperSourceHash.Substring(0, 16)
$cacheRelative = "captures\wrapper-cache\$wrapperKey"
$wrapperSwf = "$cacheRelative\ss2-capture-wrapper.swf"
$builtStamp = "$cacheRelative\built.sha256"

if ((-not $NoWrapperCache) -and (Test-Path $builtStamp) -and (Test-Path $wrapperSwf)) {
    Write-Host "Reusing the compiled wrapper for source $wrapperKey."
} else {
    Write-Host 'Building the wrapper from source...'
    New-Item -ItemType Directory -Path $cacheRelative -Force | Out-Null
    $shell = "$cacheRelative\wrapper-shell.swf"
    & $nodeExe tools/runtime-capture/make-wrapper-shell.mjs $shell | Out-Null
    $scripts = "$wrapperSwf-scripts"
    New-Item -ItemType Directory -Path (Join-Path $scripts 'scripts\frame_1') -Force | Out-Null
    Copy-Item $wrapperSource (Join-Path $scripts 'scripts\frame_1\DoAction.as') -Force
    & (Join-Path $projectRoot 'tools\ffdec.ps1') -importScript $shell $wrapperSwf $scripts | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "FFDec wrapper compilation failed (exit $LASTEXITCODE)." }
    Set-Content -LiteralPath $builtStamp -Value $wrapperSourceHash -Encoding utf8
    Write-Host "Compiled the wrapper for source $wrapperKey."
}

$tape = & $nodeExe tools/capture-session.mjs tape --fixture $FixturePath
if ($LASTEXITCODE -ne 0) { throw 'Reading the fixture tape failed.' }

# The installed SWF is read in place; spaces are URL-escaped so the value
# survives PowerShell 5.1 native-argument passing.
$installedSwf = 'C:\Program Files (x86)\Steam\steamapps\common\Swords and Sandals Classic Collection\swf\swords_sandals2_download.swf'
$gameUrl = ([uri] $installedSwf).AbsoluteUri

$log = "$sessionDirRelative\$ObservationId.rufflelog"
$observedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$injected = if ($Passive) { 'false' } else { 'true' }
$env:RUST_LOG = 'avm_trace=info'
$ruffleArgs = @(
    '--width', '640', '--height', '420',
    '--filesystem-access-mode', 'allow',
    '--player-runtime', 'flash-player',
    "-PgameUrl=$gameUrl",
    "-PobservationId=$ObservationId",
    "-PsessionId=$SessionId",
    '-PtoolVersion=ss2-capture/0.1.0',
    "-PobservedAt=$observedAt",
    '-PhashBefore=true',
    "-PattackerSide=$AttackerSide",
    "-Pinjected=$injected",
    "-Ptape=$tape",
    "-Pautopilot=$Autopilot",
    "-Pnavigate=$Navigate",
    "-PwatchFields=$WatchFields",
    "-ParenaTarget=$ArenaTarget",
    "-ParenaPolicy=$ArenaPolicy",
    "-ParenaCapture=$ArenaCapture",
    $wrapperSwf
)
# Passed only when set: an empty FlashVar reads as "" in the wrapper, which is
# already "unset", but a zero would read as an explicit ceiling of zero and
# abort the run on its first tick.
if ($TimeOfDayCeiling -gt 0) {
    $ruffleArgs = @("-PtimeOfDayCeiling=$TimeOfDayCeiling") + $ruffleArgs
}
if ($SessionLimitSec -gt 0) {
    $ruffleArgs = @("-PsessionLimitSec=$SessionLimitSec") + $ruffleArgs
}
if ($FrameRate -gt 0) { $ruffleArgs = @('--frame-rate', "$FrameRate") + $ruffleArgs }
if ($SaveDirectory) {
    # Seed the private store from the real one, so the session starts from the
    # same saved gladiator the serialised path uses. Everything the game writes
    # during the capture lands here and is thrown away with the session
    # directory, which means a capture can no longer mutate the licensed save
    # at all - the clobbering class of bug is removed rather than avoided.
    New-Item -ItemType Directory -Path $SaveDirectory -Force | Out-Null
    $masterSave = Join-Path $env:LOCALAPPDATA 'ruffle\SharedObjects'
    if (Test-Path $masterSave) {
        Copy-Item -Path (Join-Path $masterSave '*') -Destination $SaveDirectory -Recurse -Force
    }
    $ruffleArgs = @('--save-directory', "$SaveDirectory") + $ruffleArgs
}

if ($Autopilot) {
    Write-Host "Launching the instrumented session. The wrapper navigates and"
    Write-Host "fights on its own - no input, no focus, no clicking required."
} else {
    # Hand-played fallback. Nothing automated uses this path.
    Write-Host 'Launching the instrumented session with NO autopilot. Stage the'
    Write-Host 'scenario yourself, perform the one controlled action (press END'
    Write-Host 'after a non-lethal action), then CLOSE the Ruffle window.'
}
$proc = Start-Process -FilePath $ruffle.FullName -ArgumentList $ruffleArgs `
    -RedirectStandardOutput (Join-Path $projectRoot $log) -PassThru -NoNewWindow
$proc.WaitForExit()

if ($SkipPipeline) {
    Write-Host "Session ended. Raw log left at $log for the campaign driver."
    exit 0
}

Write-Host 'Session ended. Extracting and verifying...'
$jsonl = "$sessionDirRelative\$ObservationId.jsonl"
$observation = "$sessionDirRelative\$ObservationId-observation.json"
& $nodeExe tools/capture-session.mjs delog --trace $log --out $jsonl
if ($LASTEXITCODE -ne 0) { throw 'delog found no trace lines - the session did not emit a capture.' }
& $nodeExe tools/capture-session.mjs ingest --trace $jsonl --fixture $FixturePath --out $observation
if ($LASTEXITCODE -ne 0) { throw "ingest rejected the trace; the raw evidence stays at $jsonl." }
& $nodeExe tools/capture-session.mjs verify --fixture $FixturePath --observation $observation
if ($LASTEXITCODE -ne 0) {
    Write-Host 'DIVERGENCE: preserved under test/fixtures/ss2-1v1-divergences/. Correct the candidate from it.'
    exit 1
}
Write-Host "MATCH. Move $observation into test/observations/ss2-1v1/ and repeat in a fresh session."
