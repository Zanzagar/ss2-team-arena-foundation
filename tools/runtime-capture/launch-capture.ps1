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
    [switch] $Passive
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
if (Get-Process ruffle -ErrorAction SilentlyContinue) {
    throw 'A Ruffle window is already open; close every capture window before launching a session.'
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
    $wrapperSwf
)

Write-Host 'Launching the instrumented session. Stage the scenario, perform'
Write-Host 'the one controlled action (press END after a non-lethal action),'
Write-Host 'then CLOSE the Ruffle window to finish.'
$proc = Start-Process -FilePath $ruffle.FullName -ArgumentList $ruffleArgs `
    -RedirectStandardOutput (Join-Path $projectRoot $log) -PassThru -NoNewWindow
$proc.WaitForExit()

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
