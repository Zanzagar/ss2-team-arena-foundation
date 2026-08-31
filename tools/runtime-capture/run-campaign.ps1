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
    # Maximum number of sessions to run. A round takes roughly 14 seconds at
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
    # a way that jumping the playhead is not.
    #
    # Measured, whole round, wall clock: 30fps 66s, 120 23.7s, 240 18s,
    # 480 18.3s, 960 14.3s. It plateaus because Ruffle becomes CPU-bound on
    # this content somewhere around 300 effective fps, and because roughly 7s
    # of every round is fixed setup - hashing the installed build, compiling
    # the wrapper, and starting the player - which no frame rate touches.
    # Asking for more than the machine can execute is harmless: frames still
    # run in order, just slower than requested.
    #
    # Behaviour-neutral at every rate tested. Six sessions across 120, 240,
    # 480 and 960 were ingested against the already-promoted normal band and
    # all six matched, each reporting an overdraw of zero.
    [int] $FrameRate = 960,
    # How many sessions to run at once. Each concurrent session is given its
    # own isolated SharedObject store, seeded from the real save and thrown
    # away afterwards, so it provably cannot touch the licensed save or another
    # session's state - the reason rounds had to be serial in the first place.
    #
    # Measured: three concurrent rounds in 22s wall clock against ~45s serial.
    # It is well short of linear because roughly 7s of every round is fixed
    # setup - hashing the 107 MB install, and starting the player - and those
    # contend on disk and CPU.
    #
    # This is safe ONLY for capture families, which read a staged save and are
    # indifferent to what a session writes. It is NOT safe for the arena route:
    # per-session stores FORK the save, and that route has to ACCUMULATE level,
    # gold and experience across bouts. Concurrency > 1 is refused below for
    # any navigator other than 'prisoner'.
    [int] $Concurrency = 1
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

if ($Concurrency -lt 1) { throw '-Concurrency must be at least 1.' }
if ($Concurrency -gt 1 -and $Navigate -ne 'prisoner') {
    throw "-Concurrency $Concurrency is refused for -Navigate '$Navigate'. Concurrent sessions get " +
        'isolated SharedObject stores, which FORK the save; only a route that reads a staged save and ' +
        'is indifferent to what it writes can be run that way. The arena route must accumulate state ' +
        'across bouts and stays serial.'
}
$isolationRoot = Join-Path $env:LOCALAPPDATA 'ss2-capture-isolated'

$ran = 0
$filed = 0
$diverged = 0
$round = 1
while ($round -le $Rounds) {
    if ($StopWhenComplete -and (Test-FamilyComplete)) {
        Write-Host 'Every direction in the family is already a golden; stopping.'
        break
    }

    # A batch is the unit of concurrency. Ingest and settle run AFTER the whole
    # batch, serially: they are CPU-only, they mutate test/observations/, and
    # promotion reads the evidence set as a whole, so overlapping them would
    # race for no gain.
    $batch = @()
    $batchSize = [Math]::Min($Concurrency, $Rounds - $round + 1)
    for ($slot = 0; $slot -lt $batchSize; $slot++) {
        $batch += [pscustomobject]@{
            Round = $round + $slot
            SessionId = "session-$SessionPrefix$index"
            ObservationId = "obs-$SessionPrefix$index"
        }
        $index++
    }
    Write-Host ''
    Write-Host ("=== rounds {0}..{1}/{2} : {3} session(s) at once ===" -f `
        $batch[0].Round, $batch[-1].Round, $Rounds, $batch.Count)

    $jobs = @()
    foreach ($item in $batch) {
        # A private store per session, seeded from the real save by the
        # launcher (which asserts the seed landed byte-identical and refuses to
        # start if it did not). Kept OUTSIDE the repo: this path plus the
        # store's own nesting is ~203 characters, and under captures/ it would
        # be 259 and hit the Windows MAX_PATH boundary during the seed copy.
        $saveDirectory = if ($Concurrency -gt 1) { Join-Path $isolationRoot $item.SessionId } else { '' }
        if ($saveDirectory) { Remove-Item -Recurse -Force $saveDirectory -ErrorAction SilentlyContinue }
        $jobs += Start-Job -ScriptBlock {
            param($root, $script, $fixture, $sessionId, $observationId, $autopilot,
                  $navigate, $launchTimeout, $navTimeout, $battleTimeout, $frameRate, $saveDirectory)
            Set-Location $root
            $arguments = @(
                '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $script,
                '-FixturePath', $fixture, '-SessionId', $sessionId, '-ObservationId', $observationId,
                '-Autopilot', $autopilot, '-Navigate', $navigate, '-SkipPipeline',
                '-LaunchTimeoutSec', $launchTimeout, '-NavigateTimeoutSec', $navTimeout,
                '-BattleTimeoutSec', $battleTimeout, '-FrameRate', $frameRate
            )
            if ($saveDirectory) { $arguments += @('-SaveDirectory', $saveDirectory) }
            & powershell @arguments 2>&1
            $LASTEXITCODE
        } -ArgumentList $projectRoot, (Join-Path $PSScriptRoot 'run-capture.ps1'), $seedFixture,
            $item.SessionId, $item.ObservationId, $Autopilot, $Navigate,
            $LaunchTimeoutSec, $NavigateTimeoutSec, $BattleTimeoutSec, $FrameRate, $saveDirectory
    }

    # Generous: the batch's own per-stage timeouts are the real bound, and this
    # only stops a wedged job from hanging the campaign forever.
    $jobs | Wait-Job -Timeout ($LaunchTimeoutSec + $NavigateTimeoutSec + $BattleTimeoutSec + 120) | Out-Null
    foreach ($job in $jobs) {
        if ($job.State -eq 'Running') {
            Write-Host "A session job did not finish in time; stopping it."
            $job | Stop-Job
        }
    }
    $jobs | Remove-Job -Force

    # A failed session is a fact about the campaign, not a reason to abandon
    # it: the trace either exists or it does not, and ingest is the judge.
    foreach ($item in $batch) {
        $traceLog = Join-Path $projectRoot "captures\$($item.SessionId)\$($item.ObservationId).rufflelog"
        if (-not (Test-Path $traceLog)) {
            Write-Host "Round $($item.Round) did not produce a session log."
            continue
        }
        $ran++
        & $nodeExe $campaign ingest-round --family $Family --session $item.SessionId --observation $item.ObservationId
        if ($LASTEXITCODE -eq 0) { $filed++ } else { $diverged++ }
    }

    & $nodeExe $campaign settle --family $Family

    foreach ($item in $batch) {
        $saveDirectory = Join-Path $isolationRoot $item.SessionId
        if (Test-Path $saveDirectory) { Remove-Item -Recurse -Force $saveDirectory -ErrorAction SilentlyContinue }
    }
    $round += $batch.Count
}

Write-Host ''
Write-Host "=== campaign summary ==="
Write-Host "sessions run: $ran   filed as evidence: $filed   diverged: $diverged"
& $nodeExe $campaign plan --family $Family
