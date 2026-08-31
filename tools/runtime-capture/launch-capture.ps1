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
    # Isolated SharedObject store for this session, seeded from the real save.
    # Ruffle shares one save location by default, and a window that loaded
    # older state flushes it back on exit, clobbering a newer session - which
    # is the only reason sessions had to be serialised.
    #
    # THIS WORKS, and it is what makes concurrent capture possible. It was
    # recorded for a session as broken - "Ruffle wrote a fresh empty store
    # instead of reading the seeded copy" - and that diagnosis was wrong twice
    # over. Ruffle never ignored anything: tools/ffdec.ps1 redirects
    # LOCALAPPDATA to .tools/ffdec-profile for the whole PROCESS, this script
    # called it for the wrapper compile, and the seed copy below then read a
    # master store path inside .tools/ that does not exist and was skipped
    # behind a Test-Path. Ruffle was handed an empty directory and did the only
    # thing it could. The Ruffle-side log lines that would have said so were
    # suppressed by RUST_LOG=avm_trace=info, which sets the global level to off.
    #
    # Both causes are fixed, and the seed is now ASSERTED byte-identical rather
    # than attempted. Measured: three concurrent isolated sessions completed in
    # 22s against ~45s serial, all matched promoted goldens, and the master
    # ss2_data.sol was byte-identical afterwards.
    #
    # Use it for capture families only. Per-session stores FORK the save, which
    # is right for a route that reads a staged gladiator and wrong for the
    # arena route, which must ACCUMULATE level and gold across bouts.
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
    # The herolevel a champion capture is staged for. The rank-1 BOUT is not
    # reproducible unless the hero enters it in exactly the staged state:
    # staminaleft carries across bouts (battlevalues resets it only when it is
    # already <= 0) and a mid-ladder level-up is decided by a generated
    # opponent's character_xp. The wrapper refuses to arm when either differs.
    [int] $ArenaStagedLevel = 0,
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

# Captured BEFORE anything can redirect it. tools/ffdec.ps1 points APPDATA and
# LOCALAPPDATA at .tools/ffdec-profile so FFDec keeps its state out of the real
# profile; it now restores them, but this script depends on the real value for
# the Ruffle SharedObject store and must not be one edit away from reading a
# wrapper build's leftovers. Belt and braces on a bug that cost a session.
$realLocalAppData = $env:LOCALAPPDATA

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
    # Built into a private directory and PUBLISHED by rename, never in place.
    # Concurrent sessions share this cache, and a half-written SWF that another
    # process picked up would be the worst possible cache bug on this project -
    # a capture running instrumentation that never existed in any source file.
    # The rename is the only step other processes can observe, and the loser of
    # the race simply uses the winner's build.
    Write-Host 'Building the wrapper from source...'
    $stagingRelative = "captures\wrapper-cache\.build-$wrapperKey-$PID"
    Remove-Item -Recurse -Force $stagingRelative -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Path $stagingRelative -Force | Out-Null
    $shell = "$stagingRelative\wrapper-shell.swf"
    $stagedSwf = "$stagingRelative\ss2-capture-wrapper.swf"
    & $nodeExe tools/runtime-capture/make-wrapper-shell.mjs $shell | Out-Null
    $scripts = "$stagedSwf-scripts"
    New-Item -ItemType Directory -Path (Join-Path $scripts 'scripts\frame_1') -Force | Out-Null
    Copy-Item $wrapperSource (Join-Path $scripts 'scripts\frame_1\DoAction.as') -Force
    & (Join-Path $projectRoot 'tools\ffdec.ps1') -importScript $shell $stagedSwf $scripts | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "FFDec wrapper compilation failed (exit $LASTEXITCODE)." }
    Set-Content -LiteralPath "$stagingRelative\built.sha256" -Value $wrapperSourceHash -Encoding utf8

    if (Test-Path $cacheRelative) {
        # Another session published first, or -NoWrapperCache is rebuilding a
        # directory that already exists. Either way its contents are keyed on
        # the same source hash, so they are the same build.
        Remove-Item -Recurse -Force $stagingRelative -ErrorAction SilentlyContinue
        Write-Host "Another session published the wrapper for source $wrapperKey first; using it."
    } else {
        try {
            Move-Item -LiteralPath $stagingRelative -Destination $cacheRelative -ErrorAction Stop
            Write-Host "Compiled and published the wrapper for source $wrapperKey."
        } catch {
            Remove-Item -Recurse -Force $stagingRelative -ErrorAction SilentlyContinue
            if (-not (Test-Path $wrapperSwf)) { throw }
            Write-Host "Lost the publish race for source $wrapperKey; using the winner's build."
        }
    }
}
if (-not (Test-Path $wrapperSwf)) { throw "The compiled wrapper is missing at $wrapperSwf." }

$tape = & $nodeExe tools/capture-session.mjs tape --fixture $FixturePath
if ($LASTEXITCODE -ne 0) { throw 'Reading the fixture tape failed.' }

# The installed SWF is read in place; spaces are URL-escaped so the value
# survives PowerShell 5.1 native-argument passing.
$installedSwf = 'C:\Program Files (x86)\Steam\steamapps\common\Swords and Sandals Classic Collection\swf\swords_sandals2_download.swf'
$gameUrl = ([uri] $installedSwf).AbsoluteUri

$log = "$sessionDirRelative\$ObservationId.rufflelog"
$observedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$injected = if ($Passive) { 'false' } else { 'true' }
# Ruffle's own default is 'warn,ruffle=info,avm_trace=info'. Overriding it with
# 'avm_trace=info' alone sets the GLOBAL level to off, which silently suppressed
# every storage diagnostic Ruffle emits - including the
# `Unable to read file "..."` warning that names the exact SharedObject key it
# wanted. That suppression is why the -SaveDirectory failure was misdiagnosed
# for a whole session as "Ruffle ignores the seeded store".
#
# The default is unchanged for ordinary captures, so their raw logs stay
# byte-comparable with the 163 already archived. A caller may raise it, and an
# isolated-store session raises it automatically, because that is the session
# whose failure mode is invisible without it. delog filters on `avm_trace:`, so
# extra lines are dropped rather than ingested.
if (-not $env:RUST_LOG) {
    if ($SaveDirectory) {
        $env:RUST_LOG = 'warn,ruffle=info,ruffle_frontend_utils=info,avm_trace=info'
    } else {
        $env:RUST_LOG = 'avm_trace=info'
    }
}
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
    "-ParenaStagedLevel=$ArenaStagedLevel",
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
    # Ruffle rejects every read and write, silently, if any path component is
    # '..' (ruffle-rs/ruffle#17825). Refuse rather than produce a session that
    # looks like it ran with an isolated store and actually had none.
    if ($SaveDirectory -match '\.\.') {
        throw "-SaveDirectory must not contain '..': Ruffle silently refuses every read and write for such a path."
    }
    New-Item -ItemType Directory -Path $SaveDirectory -Force | Out-Null
    $masterSave = Join-Path $realLocalAppData 'ruffle\SharedObjects'
    if (Test-Path $masterSave) {
        Copy-Item -Path (Join-Path $masterSave '*') -Destination $SaveDirectory -Recurse -Force
    }
    # ASSERT the seed rather than assume it. Ruffle keys a SharedObject by the
    # path of the SWF that created it, and the game's store is created by the
    # GAME on _level1 - so the seeded copy has to land at this exact relative
    # path, and --save-directory is that tree's root with no extra nesting.
    #
    # The absence of this assertion is the whole reason the flag was recorded
    # as broken. The surviving artifact of that run shows every directory
    # inside the isolated store was created by RUFFLE four seconds after the
    # launcher made the root - i.e. the seeded copy was never on disk when
    # Ruffle read. Nothing was wrong with the flag; the seed had not happened.
    $seedRelative = 'localhost\Program%20Files%20(x86)\Steam\steamapps\common\' +
        'Swords%20and%20Sandals%20Classic%20Collection\swf\' +
        'swords_sandals2_download.swf\ss2_data.sol'
    $seededSave = Join-Path $SaveDirectory $seedRelative
    $masterGameSave = Join-Path $masterSave $seedRelative
    if (-not (Test-Path $masterGameSave)) {
        throw "No game save to seed from at $masterGameSave; an isolated session would start with no gladiator."
    }
    if (-not (Test-Path $seededSave)) {
        throw "The seed did not land at $seededSave; the isolated session would read an empty store."
    }
    $masterHash = (Get-FileHash -LiteralPath $masterGameSave -Algorithm SHA256).Hash
    $seededHash = (Get-FileHash -LiteralPath $seededSave -Algorithm SHA256).Hash
    if ($masterHash -ne $seededHash) {
        throw "The seeded save at $seededSave does not match the master ($seededHash vs $masterHash)."
    }
    Write-Host "Seeded the isolated store; ss2_data.sol matches the master ($($masterHash.Substring(0,16)))."
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
# Record the PID so a caller can close THIS session's window rather than every
# Ruffle on the machine. Concurrent isolated sessions make `Get-Process ruffle |
# Stop-Process` an act of sabotage against the other runs.
Set-Content -LiteralPath (Join-Path $projectRoot "$sessionDirRelative\ruffle.pid") `
    -Value $proc.Id -Encoding utf8
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
