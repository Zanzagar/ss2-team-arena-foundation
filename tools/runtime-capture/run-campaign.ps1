<#
.SYNOPSIS
Run a whole capture campaign: repeat unattended sessions until every attack
direction in a candidate family is a promoted golden.

Each round launches one fully automated session (run-capture.ps1, which needs
no cursor, no focus and no clicking), then hands the raw log to
tools/runtime-capture/campaign.mjs, which ingests it against every candidate
in the family, files the one that matches as an observation, and promotes any
direction that has reached two matching observations from two independent
sessions.

The wrapper observes attack_direction rather than forcing it, so which
direction a round produces is the game's choice. The campaign is therefore a
loop over sessions, not a list of targets: it keeps going until the coverage
report says every direction is covered, or until -Rounds is exhausted.

Only one Ruffle window may exist at a time, so rounds are strictly
sequential. Nothing here writes to the licensed installation; the launcher
re-verifies the pinned hashes before every round and ingest re-verifies them
after.

.EXAMPLE
powershell -File tools\runtime-capture\run-campaign.ps1 -Rounds 6

.EXAMPLE
powershell -File tools\runtime-capture\run-campaign.ps1 `
  -Family prisoner-normal-kill -SessionPrefix camp -Rounds 10 -StopWhenComplete
#>
[CmdletBinding()]
param(
    # Maximum number of sessions to run. A round takes roughly 24 seconds at
    # the default frame rate, of which about 7 is fixed setup (hash
    # verification of the installed build, plus the wrapper compile).
    [int] $Rounds = 4,
    # Candidate family: every fixture whose id starts candidate-<Family>.
    [string] $Family = 'prisoner-normal-kill',
    # Session and observation ids are <prefix><n>; n advances past whatever
    # already exists, so re-running never reuses an id.
    [string] $SessionPrefix = 'camp',
    [string] $Autopilot = 'walkright*5,normal_attack',
    [string] $Navigate = 'prisoner',
    # Stop as soon as every direction in the family has a golden.
    [switch] $StopWhenComplete,
    [int] $LaunchTimeoutSec = 300,
    [int] $NavigateTimeoutSec = 180,
    [int] $BattleTimeoutSec = 180,
    # Locked player frame rate. The prologue the navigator has to sit through
    # is ~84% of an unattended run, and this is a time dilation rather than a
    # frame shortcut - every frame still executes in order - so it is safe in
    # a way that jumping the playhead is not. Validated at 120: two sessions
    # at 4x still matched their candidates exactly, with the same draw count.
    [int] $FrameRate = 120
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $projectRoot

$node = Get-Command node -ErrorAction SilentlyContinue
$nodeExe = if ($node) { $node.Source } else {
    'C:\Users\corey\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
$campaign = 'tools/runtime-capture/campaign.mjs'

if (Get-Process ruffle -ErrorAction SilentlyContinue) {
    throw 'A Ruffle window is already open; close it before starting a campaign.'
}

# One tape drives every round, so the family must agree on it. campaign.mjs
# seed refuses rather than picking when members disagree.
$seedFixture = & $nodeExe $campaign seed --family $Family
if ($LASTEXITCODE -ne 0) { throw 'The family has no usable seed fixture.' }
$seedFixture = $seedFixture.Trim()
Write-Host "Family '$Family' seed fixture: $seedFixture"

function Test-FamilyComplete {
    $plan = & $nodeExe $campaign plan --family $Family --json | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw 'Reading the campaign plan failed.' }
    foreach ($row in $plan.rows) { if (-not $row.hasGolden) { return $false } }
    return $true
}

# Ids must be unique forever: a reused observation id would collide with
# committed evidence, and campaign.mjs refuses to overwrite it. Start past
# every id this prefix has already produced.
$index = 1
while (
    (Test-Path (Join-Path $projectRoot "captures\session-$SessionPrefix$index")) -or
    (Test-Path (Join-Path $projectRoot "test\observations\ss2-1v1\obs-$SessionPrefix$index.json"))
) { $index++ }

$ran = 0
$filed = 0
$diverged = 0
for ($round = 1; $round -le $Rounds; $round++) {
    if ($StopWhenComplete -and (Test-FamilyComplete)) {
        Write-Host 'Every direction in the family is already a golden; stopping.'
        break
    }

    $sessionId = "session-$SessionPrefix$index"
    $observationId = "obs-$SessionPrefix$index"
    $index++
    Write-Host ''
    Write-Host "=== round $round/$Rounds : $sessionId / $observationId ==="

    # A failed session is a fact about the campaign, not a reason to abandon
    # it: record it and take the next round.
    try {
        & powershell -NoProfile -ExecutionPolicy Bypass `
            -File (Join-Path $PSScriptRoot 'run-capture.ps1') `
            -FixturePath $seedFixture -SessionId $sessionId -ObservationId $observationId `
            -Autopilot $Autopilot -Navigate $Navigate -SkipPipeline `
            -LaunchTimeoutSec $LaunchTimeoutSec -NavigateTimeoutSec $NavigateTimeoutSec `
            -BattleTimeoutSec $BattleTimeoutSec -FrameRate $FrameRate
        if ($LASTEXITCODE -ne 0) { throw "run-capture.ps1 exited $LASTEXITCODE" }
    } catch {
        Write-Host "Round $round did not produce a session: $($_.Exception.Message)"
        continue
    }
    $ran++

    & $nodeExe $campaign ingest-round --family $Family --session $sessionId --observation $observationId
    if ($LASTEXITCODE -eq 0) { $filed++ } else { $diverged++ }

    & $nodeExe $campaign settle --family $Family
}

Write-Host ''
Write-Host "=== campaign summary ==="
Write-Host "sessions run: $ran   filed as evidence: $filed   diverged: $diverged"
& $nodeExe $campaign plan --family $Family
