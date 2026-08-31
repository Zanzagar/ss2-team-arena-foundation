<#
.SYNOPSIS
Run one capture session start to finish with no human input and no cursor.

The wrapper navigates the game from its title screen to the target battle
using the game's own navigation calls, performs the battle actions through
the same entry point its buttons call, closes its own trace, and this script
then closes the window so the launcher's delog/ingest/verify pipeline runs.

Nothing here touches the mouse, the keyboard, or the foreground window, so
runs are safe to leave going while the machine is used for something else.

.EXAMPLE
powershell -File tools\runtime-capture\run-capture.ps1 `
  -FixturePath test\fixtures\ss2-1v1\candidate-prisoner-normal-kill.json `
  -SessionId session-auto-4 -ObservationId obs-auto-4
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string] $FixturePath,
    [Parameter(Mandatory = $true)] [string] $SessionId,
    [Parameter(Mandatory = $true)] [string] $ObservationId,
    [string] $Autopilot = 'walkright*5,normal_attack',
    [string] $Navigate = 'prisoner',
    [int] $LaunchTimeoutSec = 300,
    [int] $NavigateTimeoutSec = 180,
    [int] $BattleTimeoutSec = 180,
    # Leave the raw log unprocessed for tools/runtime-capture/campaign.mjs,
    # which resolves the observed attack direction to the right candidate
    # before it ingests. See launch-capture.ps1 for why.
    [switch] $SkipPipeline,
    # See launch-capture.ps1: a locked player frame rate is a time dilation,
    # not a frame shortcut. The prologue is ~84% of an unattended run.
    [int] $FrameRate = 0,
    [string] $SaveDirectory = "",
    # Keep the window open this many seconds AFTER the wrapper closes its
    # trace, instead of closing it immediately. Observational only - see the
    # block that uses it. Snapshot the save first: the post-victory route
    # reaches town square, which flushes the SharedObject.
    [int] $LingerSec = 0,
    # See launch-capture.ps1 - extra watch fields, added to the default list.
    [string] $WatchFields = ""
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $projectRoot
$logPath = Join-Path $projectRoot "captures\$SessionId\$ObservationId.rufflelog"

function Test-Log { param([string] $Pattern)
    if (-not (Test-Path $logPath)) { return $false }
    return (Select-String -Path $logPath -Pattern $Pattern -SimpleMatch -Quiet) -eq $true
}
function Wait-Log { param([string] $Pattern, [int] $TimeoutSec, [string] $What)
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Test-Log $Pattern) { return $true }
        Start-Sleep -Milliseconds 700
    }
    Write-Host "Timed out waiting for $What."
    return $false
}
function Show-Diagnostics {
    if (-not (Test-Path $logPath)) { Write-Host '(no log)'; return }
    Select-String -Path $logPath -Pattern '"at":"nav"', '"at":"autopilot"', '"at":"action-armed"', '"at":"rootframe"' |
        Select-Object -Last 14 | ForEach-Object { $_.Line -replace '^.*avm_trace: ', '' }
}

# -WatchFields is a comma list of ActionScript identifiers and nothing else,
# and it is checked HERE, before anything is launched, because the way it fails
# without the check is silent.
#
# The comma is safe either way, and that is worth stating so nobody adds
# quoting for the wrong reason: `powershell -File` passes each argument through
# as a literal string, so `-WatchFields a,b` binds the single string "a,b" and
# is NOT parsed as an array. Measured on this host (PS 5.1) with this script's
# exact argument array: the eleven-name champion list arrives byte-identical
# quoted and unquoted, as do ';', '$', '@' and a backtick.
#
# A SPACE is not safe. Start-Process joins -ArgumentList with plain spaces and
# adds no quoting of its own, so the tail of an unquoted value becomes its own
# token and binds POSITIONALLY to the first unbound parameter of
# launch-capture.ps1 - which is -AttackerSide. Measured, same argument array:
#
#   -WatchFields boot_defence villain  ->  $WatchFields  = "boot_defence"
#                                          $AttackerSide = "villain"
#                                          exit 0, nothing on stderr
#
# That is the trace's entire attacker label, rewritten by a typo, with the
# watch list silently truncated in the same stroke, and no error anywhere. The
# natural human spelling "boot_defence, weapon" fails differently and no less
# confusingly: a ValidateSet error naming -AttackerSide, a parameter this
# script never passes.
#
# So the value is BOTH quoted below (like every other string forward, and like
# run-arena.ps1 already does) and refused here. Quoting alone would only move
# the corruption one hop: launch-capture.ps1 builds "-PwatchFields=$WatchFields"
# into its own Start-Process array and joins that with plain spaces too. And a
# space could not do anything useful even if it arrived - the wrapper parses
# with `rawWatchFields.split(",")` and does not trim, so " weapon" matches no
# field name Object.watch could bind. Nothing legitimate is refused: no field
# the wrapper can watch contains whitespace or a quote.
if ($WatchFields -match '[\s"]') {
    throw ("-WatchFields must be a comma-separated list of field names with no " +
        "whitespace and no quotes; got '$WatchFields'. The wrapper splits on ',' " +
        "and does not trim, and a space here is forwarded as a separate token " +
        "that binds to launch-capture.ps1's -AttackerSide.")
}

# One session at a time is a consequence of SHARING one SharedObject store and
# nothing else, so the guard lifts exactly when this session has its own. A
# session given -SaveDirectory reads and writes a private seeded copy and
# provably cannot touch the real save or another session's - verified live: an
# isolated session reached the battle, closed its trace, matched a promoted
# golden, and left the master ss2_data.sol byte-identical.
if (-not $SaveDirectory -and (Get-Process ruffle -ErrorAction SilentlyContinue)) {
    throw 'A Ruffle window is already open; close it before an automated run, or give this one its own -SaveDirectory.'
}

$pidPath = Join-Path $projectRoot "captures\$SessionId\ruffle.pid"
# A stale pid from an earlier run of the same session id would be waited on and
# then killed, neither of which is this run.
Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue

function Stop-ThisSession {
    # Close THIS session's window by pid. Never `Get-Process ruffle |
    # Stop-Process`: with concurrent isolated sessions that kills every other
    # run in flight, and each would then report a navigation failure of its own.
    if (Test-Path $pidPath) {
        $sessionPid = (Get-Content $pidPath -Raw).Trim()
        if ($sessionPid) {
            Stop-Process -Id ([int] $sessionPid) -Force -Confirm:$false -ErrorAction SilentlyContinue
            return
        }
    }
    if (-not $SaveDirectory) {
        # No pid file and a shared store: the serial path, where the only
        # Ruffle running is ours.
        Get-Process ruffle -ErrorAction SilentlyContinue | Stop-Process -Force -Confirm:$false
    } else {
        Write-Host 'WARNING: no pid file for this session; leaving other Ruffle processes alone.'
    }
}

Write-Host 'Launching instrumented session...'
# The launcher must have its streams redirected: started hidden without
# redirection it fails to bring up the window (observed repeatedly), and the
# captured output doubles as the pipeline log for this run.
$launchOut = Join-Path $projectRoot "captures\$SessionId\launcher.log"
New-Item -ItemType Directory -Path (Split-Path -Parent $launchOut) -Force | Out-Null
# Every path is quoted: this repo lives under a directory containing spaces,
# and Start-Process joins an argument array with plain spaces, which
# otherwise truncates -File at the first space.
$launcherScript = Join-Path $PSScriptRoot 'launch-capture.ps1'
# Built as a variable, never inline: an array concatenation written in a
# parameter position is parsed as further positional arguments, not as an
# operator, and Start-Process then forwards a stray '+' to the launcher.
$launcherArgs = @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', "`"$launcherScript`"",
    '-FixturePath', "`"$FixturePath`"",
    '-SessionId', "`"$SessionId`"",
    '-ObservationId', "`"$ObservationId`"",
    '-Autopilot', "`"$Autopilot`"",
    '-Navigate', "`"$Navigate`""
)
if ($SkipPipeline) { $launcherArgs += '-SkipPipeline' }
# -FrameRate is deliberately NOT quoted and -WatchFields is: the rule is quote
# the [string]s, not quote everything. An [int]'s interpolation is digits with
# no separator under every culture, so it cannot split; a string can, and the
# guard above says what happens when it does. run-arena.ps1 forwards its own
# numerics bare and its own strings quoted for the same reason - the two
# scripts now agree, and -WatchFields was the one string forward that did not.
if ($FrameRate -gt 0) { $launcherArgs += @('-FrameRate', "$FrameRate") }
if ($WatchFields) { $launcherArgs += @('-WatchFields', "`"$WatchFields`"") }
if ($SaveDirectory) { $launcherArgs += @('-SaveDirectory', "`"$SaveDirectory`"") }
$launch = Start-Process -FilePath 'powershell' -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput $launchOut -RedirectStandardError "$launchOut.err" `
    -ArgumentList $launcherArgs

# Hash verification of ~107 MB plus the FFDec wrapper compile happen before
# the window appears, so this wait is deliberately generous.
$deadline = (Get-Date).AddSeconds($LaunchTimeoutSec)
# Wait for THIS session's window, identified by the pid file the launcher
# writes, so a concurrent run's window is never mistaken for ours.
while (-not (Test-Path $pidPath)) {
    if ((Get-Date) -gt $deadline) { throw 'The Ruffle window never appeared.' }
    Start-Sleep -Milliseconds 500
}

Write-Host 'Navigating to the battle (no input required)...'
if (-not (Wait-Log '"step":"battle-ready"' $NavigateTimeoutSec 'the navigator to reach the battle')) {
    Show-Diagnostics
    Stop-ThisSession
    $launch.WaitForExit()
    throw 'Navigation failed; see the diagnostics above.'
}

Write-Host 'Battle reached; autopilot performing the action...'
if (-not (Wait-Log '"t":"end"' $BattleTimeoutSec 'the wrapper to close its trace')) {
    Show-Diagnostics
}

if ($LingerSec -gt 0) {
    # The capture is already finished; this is purely observational. The
    # autopilot has no steps left and nothing is clicked, so the game simply
    # runs its own post-action frames - reward, level-up, and the route back -
    # and the frame log records where they go. This is how the levelled route
    # gets confirmed against the running build rather than only from bytecode.
    #
    # It is NOT save-neutral: the route back passes through town square, which
    # flushes the SharedObject. Snapshot before using this.
    Write-Host "Lingering $LingerSec s to record the game's own post-action frames..."
    Start-Sleep -Seconds $LingerSec
    Show-Diagnostics
}

Write-Host 'Closing the window so the pipeline runs...'
Stop-ThisSession
$launch.WaitForExit()
Write-Host "Launcher exit code: $($launch.ExitCode)"
if ($SkipPipeline) {
    Write-Host "Raw log ready: $logPath"
    return
}
Write-Host '--- pipeline result ---'
Get-Content $launchOut -ErrorAction SilentlyContinue |
    Select-String -Pattern 'Extracted', 'MATCH', 'DIVERGE', 'rejected', 'Post-session' |
    Select-Object -Last 5 | ForEach-Object { $_.Line }
