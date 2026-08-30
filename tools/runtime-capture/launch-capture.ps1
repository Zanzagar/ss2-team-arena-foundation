<#
.SYNOPSIS
Launch one controlled licensed capture session.

Verifies the installed hashes, rebuilds the wrapper from source, injects the
target fixture's tape, and opens the licensed game (read in place via a
file: URL — never copied) inside the instrumented wrapper under portable
Ruffle. Play the staged action, then close the Ruffle window; the script
then extracts the trace and runs ingest (with the live post-session hash
check) and verify automatically.

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
    [string] $SaveDirectory = ""
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

Write-Host 'Building the wrapper from source...'
$shell = "$sessionDirRelative\wrapper-shell.swf"
$wrapperSwf = "$sessionDirRelative\ss2-capture-wrapper.swf"
& $nodeExe tools/runtime-capture/make-wrapper-shell.mjs $shell | Out-Null
$scripts = "$wrapperSwf-scripts"
New-Item -ItemType Directory -Path (Join-Path $scripts 'scripts\frame_1') -Force | Out-Null
Copy-Item 'tools\runtime-capture\ss2-capture-wrapper.as' (Join-Path $scripts 'scripts\frame_1\DoAction.as') -Force
& (Join-Path $projectRoot 'tools\ffdec.ps1') -importScript $shell $wrapperSwf $scripts | Out-Null
if ($LASTEXITCODE -ne 0) { throw "FFDec wrapper compilation failed (exit $LASTEXITCODE)." }

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
    $wrapperSwf
)
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

Write-Host 'Launching the instrumented session. Stage the scenario, perform'
Write-Host 'the one controlled action (press END after a non-lethal action),'
Write-Host 'then CLOSE the Ruffle window to finish.'
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
