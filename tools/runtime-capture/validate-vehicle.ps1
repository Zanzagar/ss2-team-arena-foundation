<#
.SYNOPSIS
One-command capture-vehicle validation gate.

Rebuilds the wrapper and the structural stub game from source, runs the
wrapper against the stub under portable Ruffle with the target fixture's
tape injected, then delogs, ingests (which performs the live post-session
install-hash check), and verifies the observation against the fixture.
Exits 0 only when the round trip MATCHES.

Run this after every wrapper edit and before trusting any real capture.
Traces produced here are validation artifacts (ids prefixed stubcheck-);
never place their observation records under test/observations/.

The run is isolated from the licensed save. Ruffle gets its own empty
--save-directory under captures\vehicle-check\ (throwaway, like every other
artifact in that directory), the licensed ss2_data.sol is hashed before and
after to prove this gate did not touch it, and the gate refuses to start
while any other Ruffle window is open. None of that was here originally:
the gate ran at the real SharedObject root with no process guard, which is
a poor property for the one script the project mandates running most often.
#>
[CmdletBinding()]
param(
    [string] $FixturePath = 'test/fixtures/ss2-1v1/candidate-lethal-result.json',
    [int] $RunSeconds = 12
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $projectRoot

# Captured BEFORE Build-Movie can redirect it. tools/ffdec.ps1 points APPDATA
# and LOCALAPPDATA at .tools/ffdec-profile for the whole PROCESS while FFDec
# runs; it restores them in a finally block, but launch-capture.ps1 keeps its
# own copy for exactly this reason and so does this script. Reading the
# redirected value here would make the licensed-save check below hash a path
# inside .tools/ that does not exist, and report ABSENT -> ABSENT for a save it
# never looked at. That leak already cost this project a session once.
$realLocalAppData = $env:LOCALAPPDATA

# Read-only. Mirrors Get-SaveState in run-arena.ps1: the size and hash of the
# licensed gladiator save, or ABSENT when there is none. ABSENT is a legitimate
# state (a machine that has never run the game), and ABSENT before and after is
# a pass - the assertion is that this gate CHANGED nothing, not that a save
# exists.
function Get-LicensedSaveState {
    $root = Join-Path $realLocalAppData 'ruffle\SharedObjects'
    if (-not (Test-Path $root)) { return 'ABSENT' }
    $file = Get-ChildItem -LiteralPath $root -Recurse -File -Filter 'ss2_data.sol' -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $file) { return 'ABSENT' }
    $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
    return "$($file.Length) bytes sha256 $hash"
}

$node = Get-Command node -ErrorAction SilentlyContinue
$nodeExe = if ($node) { $node.Source } else {
    'C:\Users\corey\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
$ruffle = Get-ChildItem -LiteralPath (Join-Path $projectRoot '.tools') -Filter 'ruffle.exe' -File -Recurse |
    Select-Object -First 1
if (-not $ruffle) { throw 'Portable Ruffle is not installed. Run tools/install-ruffle.ps1 first.' }

# Refused OUTRIGHT, and refused here rather than after ~7s of builds so the
# operator gets the message before the work is spent.
#
# launch-capture.ps1 and run-capture.ps1 lift this same guard for a session that
# brings its own -SaveDirectory, because for them the hazard was one SHARED save
# store and nothing else. This gate now brings its own store too, so on that
# reasoning alone the guard could be lifted here as well. It is kept anyway:
# run-arena.ps1 drives the one route that mutates the licensed save, it uses the
# shared store by necessity, and it refuses to START while any Ruffle window is
# open. This is the other half of that refusal - without it, the gate is the one
# script in the repository that can walk into a supervised save-mutating route.
#
# (run-arena.ps1 used to key its own bookkeeping on the process NAME, so a
# stub-check window would also have satisfied its wait, masked the real
# window's death, and been killed mid-check by its blanket kill. That is fixed -
# it now waits on, polls and closes its own pid from captures\<SessionId>\
# ruffle.pid - so this guard no longer stands on that, only on the shared store.)
#
# Cost of a false refusal is one re-run of a gate that mutates nothing.
if (Get-Process ruffle -ErrorAction SilentlyContinue) {
    throw 'A Ruffle window is already open; close every Ruffle window before running the vehicle gate.'
}

$work = Join-Path $projectRoot 'captures\vehicle-check'
# Ruffle receives RELATIVE paths: PowerShell 5.1 native-argument passing
# mangles absolute paths containing spaces (this repo's path has them).
$workRelative = 'captures\vehicle-check'
New-Item -ItemType Directory -Path $work -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMddHHmmss'

# This gate's own Ruffle SharedObject store, empty and per-run.
#
# Without --save-directory Ruffle's store root is
# %LOCALAPPDATA%\ruffle\SharedObjects - the licensed save's own directory. The
# gate compares a trace to a fixture; it has no business reading or writing
# that tree at all. The stub creates no SharedObject today, so nothing was
# observed to land there, but this is the script the project mandates running
# after EVERY wrapper edit - i.e. the one most likely to be pointed at a
# wrapper that has just started writing something new. Isolation makes "the
# gate cannot touch the save" true by construction instead of by inspection,
# and keeps this run from adding files to a save root whose emptiness
# save-state.ps1 uses as its snapshot precondition.
#
# Deliberately NOT seeded from the master store, which is where this differs
# from launch-capture.ps1: that seed exists so the licensed GAME finds its
# gladiator, and the stub has no save to read. An empty private store is the
# correct starting state here, and copying the licensed save in would hand the
# gate a licensed save it could lose.
#
# Per-run rather than reused so the store is fresh by construction - no delete
# step that can fail silently and leave the previous run's state in place.
# These directories are throwaway on the same terms as the stubcheck-* logs
# beside them.
#
# RELATIVE for the same reason every other path handed to Ruffle here is:
# Start-Process joins -ArgumentList with plain spaces and adds no quoting, and
# this repo's absolute path contains spaces.
$saveRelative = "$workRelative\save-$stamp"
New-Item -ItemType Directory -Path (Join-Path $projectRoot $saveRelative) -Force | Out-Null

function Build-Movie([string] $shell, [string] $source, [string] $outSwf) {
    & $nodeExe tools/runtime-capture/make-wrapper-shell.mjs $shell | Out-Null
    $scripts = "$outSwf-scripts"
    New-Item -ItemType Directory -Path (Join-Path $scripts 'scripts\frame_1') -Force | Out-Null
    Copy-Item $source (Join-Path $scripts 'scripts\frame_1\DoAction.as') -Force
    & (Join-Path $projectRoot 'tools\ffdec.ps1') -importScript $shell $outSwf $scripts | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "FFDec script import failed for $source (exit $LASTEXITCODE)." }
}

# A PASS must name a REVISION, not a moment. This script compiles whatever is
# on disk at the instant it runs, and under the parallel-agent working agreement
# a save landing mid-build would compile a half-written file - so "the vehicle
# check passed" previously attributed to nothing at all. The source is hashed
# before and after the copy, a mid-build change is refused, and the hash is
# printed with the PASS.
$wrapperSource = 'tools\runtime-capture\ss2-capture-wrapper.as'
$sourceHashBefore = (Get-FileHash -LiteralPath $wrapperSource -Algorithm SHA256).Hash

Write-Host 'Building wrapper and stub from source...'
Build-Movie (Join-Path $work 'wrapper-shell.swf') $wrapperSource (Join-Path $work 'ss2-capture-wrapper.swf')
Build-Movie (Join-Path $work 'stub-shell.swf') 'tools\runtime-capture\stub-game.as' (Join-Path $work 'stub-game.swf')

$sourceHashAfter = (Get-FileHash -LiteralPath $wrapperSource -Algorithm SHA256).Hash
if ($sourceHashBefore -ne $sourceHashAfter) {
    throw "ss2-capture-wrapper.as changed while it was being compiled ($($sourceHashBefore.Substring(0,16)) -> " +
        "$($sourceHashAfter.Substring(0,16))). This PASS would not name any revision; re-run it."
}

$tape = & $nodeExe tools/capture-session.mjs tape --fixture $FixturePath
if ($LASTEXITCODE -ne 0) { throw 'Reading the fixture tape failed.' }

$log = Join-Path $work "stubcheck-$stamp.rufflelog"
# Raised to the level launch-capture.ps1 uses for an ISOLATED session, and for
# its reason. 'avm_trace=info' alone sets Ruffle's GLOBAL level to off, which
# suppresses every storage diagnostic it emits - including the
# `Unable to read file "..."` warning that names the exact SharedObject key it
# wanted. That suppression is why --save-directory was misdiagnosed as broken
# for a whole session. This gate now passes --save-directory, so a store Ruffle
# quietly declined to use would otherwise leave no trace anywhere and the BLAST
# RADIUS line below would be asserting an isolation nothing could observe.
#
# Cannot perturb the round trip: extractCaptureTraceFromRuffleLog
# (tools/capture-session.mjs:315-338) skips every line without an `avm_trace:`
# prefix outright, and the dropped count it reports is a message, not a
# threshold.
$env:RUST_LOG = 'warn,ruffle=info,ruffle_frontend_utils=info,avm_trace=info'
$ruffleArgs = @(
    '--no-gui', '--width', '200', '--height', '150',
    '--filesystem-access-mode', 'allow',
    '--save-directory', $saveRelative,
    '-PgameUrl=stub-game.swf',
    "-PobservationId=stubcheck-obs-$stamp",
    "-PsessionId=stubcheck-session-$stamp",
    '-PtoolVersion=ss2-capture/0.1.0',
    "-PobservedAt=$((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'))",
    '-PhashBefore=true', '-PattackerSide=hero', '-Pinjected=true',
    "-Ptape=$tape",
    "$workRelative\ss2-capture-wrapper.swf"
)
Write-Host "Running wrapper against the stub for $RunSeconds seconds..."
$saveBefore = Get-LicensedSaveState
# Stopped by PID, never by image name. `Get-Process ruffle | Stop-Process` is
# the sabotage pattern run-capture.ps1:86-104 exists to avoid; this script was
# already correct on that point and stays correct.
$proc = Start-Process -FilePath $ruffle.FullName -ArgumentList $ruffleArgs `
    -RedirectStandardOutput $log -PassThru -NoNewWindow
Start-Sleep -Seconds $RunSeconds
if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -Confirm:$false }
Start-Sleep -Seconds 1

# Asserted, not assumed - the same discipline launch-capture.ps1 applies to its
# seed. --save-directory is the mechanism; this is the check that the mechanism
# worked. It is deliberately placed before the pipeline: a mutated licensed
# save matters more than whether the round trip matched, and the raw trace is
# already on disk either way.
$saveAfter = Get-LicensedSaveState
if ($saveBefore -ne $saveAfter) {
    throw "The licensed save changed during the vehicle check ($saveBefore -> $saveAfter). " +
        "This gate must never touch it; restore from a snapshot with save-state.ps1 and " +
        "find out what wrote to %LOCALAPPDATA%\ruffle\SharedObjects before running anything else."
}

$jsonl = Join-Path $work "stubcheck-$stamp.jsonl"
$observation = Join-Path $work "stubcheck-$stamp-observation.json"
& $nodeExe tools/capture-session.mjs delog --trace $log --out $jsonl
if ($LASTEXITCODE -ne 0) { throw 'delog failed - no trace lines captured.' }
& $nodeExe tools/capture-session.mjs ingest --trace $jsonl --fixture $FixturePath --out $observation
if ($LASTEXITCODE -ne 0) { throw 'ingest failed - see the raw trace for the divergence.' }
# --divergence-dir is overridden because verify DEFAULTS to the committed
# test/fixtures/ss2-1v1-divergences tree. A failing gate would otherwise drop
# stub-derived evidence into the committed evidence store - which this script's
# own header forbids ("never place their observation records under
# test/observations/"). It has never fired only because the gate has always
# passed.
& $nodeExe tools/capture-session.mjs verify --fixture $FixturePath --observation $observation `
    --divergence-dir $workRelative
if ($LASTEXITCODE -ne 0) { throw 'VEHICLE CHECK FAILED: the stub round trip does not match the fixture.' }
Write-Host "VEHICLE CHECK PASSED for wrapper source $($sourceHashBefore.Substring(0,16)): wrapper -> Ruffle -> delog -> ingest -> verify round trip matches."
Write-Host ''
Write-Host 'WHAT THIS DOES NOT PROVE. Audited coverage: this gate never enters the'
Write-Host 'navigator, the arena state machine, the four gates, staging, the shop,'
Write-Host 'the fight policy or the capture gate, and isNum has ZERO reachable call'
Write-Host 'sites in a stub run. It caught 0 of the 6 defects found live on this'
Write-Host 'route. It proves the wrapper compiles, wraps and re-wraps overlay'
Write-Host 'functions, serves an injected tape, and round-trips one lethal action'
Write-Host 'through the pipeline. Save corruption is outside its observable'
Write-Host 'universe entirely - it compares a trace to a fixture, never a save.'
Write-Host ''
Write-Host 'BLAST RADIUS OF THIS RUN. Ruffle was given its own empty store at'
Write-Host "$saveRelative and never the licensed one. The licensed ss2_data.sol read"
Write-Host "  $saveBefore"
Write-Host 'before the run and read exactly that again after.'
Write-Host ''
Write-Host 'Read that line for what it is. The stub writes no SharedObject at all,'
Write-Host 'so the before/after check is a tripwire that nothing in this gate can'
Write-Host 'currently trip: deleting --save-directory above would not fail it. It is'
Write-Host 'here to catch a FUTURE wrapper that starts writing a save, and until'
Write-Host 'then a PASS on this line is the absence of a counterexample, not'
Write-Host 'evidence of isolation. It does NOT soften the paragraph above: what the'
Write-Host 'wrapper does to a REAL save during a REAL capture remains untested here.'
