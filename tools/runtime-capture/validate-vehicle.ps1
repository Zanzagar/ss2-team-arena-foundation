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

$node = Get-Command node -ErrorAction SilentlyContinue
$nodeExe = if ($node) { $node.Source } else {
    'C:\Users\corey\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
$ruffle = Get-ChildItem -LiteralPath (Join-Path $projectRoot '.tools') -Filter 'ruffle.exe' -File -Recurse |
    Select-Object -First 1
if (-not $ruffle) { throw 'Portable Ruffle is not installed. Run tools/install-ruffle.ps1 first.' }

$work = Join-Path $projectRoot 'captures\vehicle-check'
# Ruffle receives RELATIVE paths: PowerShell 5.1 native-argument passing
# mangles absolute paths containing spaces (this repo's path has them).
$workRelative = 'captures\vehicle-check'
New-Item -ItemType Directory -Path $work -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMddHHmmss'

function Build-Movie([string] $shell, [string] $source, [string] $outSwf) {
    & $nodeExe tools/runtime-capture/make-wrapper-shell.mjs $shell | Out-Null
    $scripts = "$outSwf-scripts"
    New-Item -ItemType Directory -Path (Join-Path $scripts 'scripts\frame_1') -Force | Out-Null
    Copy-Item $source (Join-Path $scripts 'scripts\frame_1\DoAction.as') -Force
    & (Join-Path $projectRoot 'tools\ffdec.ps1') -importScript $shell $outSwf $scripts | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "FFDec script import failed for $source (exit $LASTEXITCODE)." }
}

Write-Host 'Building wrapper and stub from source...'
Build-Movie (Join-Path $work 'wrapper-shell.swf') 'tools\runtime-capture\ss2-capture-wrapper.as' (Join-Path $work 'ss2-capture-wrapper.swf')
Build-Movie (Join-Path $work 'stub-shell.swf') 'tools\runtime-capture\stub-game.as' (Join-Path $work 'stub-game.swf')

$tape = & $nodeExe tools/capture-session.mjs tape --fixture $FixturePath
if ($LASTEXITCODE -ne 0) { throw 'Reading the fixture tape failed.' }

$log = Join-Path $work "stubcheck-$stamp.rufflelog"
$env:RUST_LOG = 'avm_trace=info'
$ruffleArgs = @(
    '--no-gui', '--width', '200', '--height', '150',
    '--filesystem-access-mode', 'allow',
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
$proc = Start-Process -FilePath $ruffle.FullName -ArgumentList $ruffleArgs `
    -RedirectStandardOutput $log -PassThru -NoNewWindow
Start-Sleep -Seconds $RunSeconds
if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -Confirm:$false }
Start-Sleep -Seconds 1

$jsonl = Join-Path $work "stubcheck-$stamp.jsonl"
$observation = Join-Path $work "stubcheck-$stamp-observation.json"
& $nodeExe tools/capture-session.mjs delog --trace $log --out $jsonl
if ($LASTEXITCODE -ne 0) { throw 'delog failed - no trace lines captured.' }
& $nodeExe tools/capture-session.mjs ingest --trace $jsonl --fixture $FixturePath --out $observation
if ($LASTEXITCODE -ne 0) { throw 'ingest failed - see the raw trace for the divergence.' }
& $nodeExe tools/capture-session.mjs verify --fixture $FixturePath --observation $observation
if ($LASTEXITCODE -ne 0) { throw 'VEHICLE CHECK FAILED: the stub round trip does not match the fixture.' }
Write-Host 'VEHICLE CHECK PASSED: wrapper -> Ruffle -> delog -> ingest -> verify round trip matches.'
