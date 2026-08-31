<#
.SYNOPSIS
Snapshot and restore the portable Ruffle save state used by capture sessions.

Ruffle keeps its SharedObjects (the game's save data, created entirely inside
our capture sessions - the Steam installation's saves are never touched)
under %LOCALAPPDATA%\ruffle\SharedObjects. Snapshotting before a session and
restoring afterwards lets the same pending fight be replayed for the
independent second observation the promotion gate requires.

Snapshots are stored under %LOCALAPPDATA%\ss2-capture-snapshots: a SHORT
path outside OneDrive. The first implementation stored them inside the
(deeply nested, OneDrive-synced) repo and PowerShell's copy silently
flattened a 272-character nested path at the Windows MAX_PATH boundary,
corrupting the layout on restore. Copies now use robocopy (native long-path
support) and every operation verifies file counts and hashes afterwards.

.EXAMPLE
powershell -File tools\runtime-capture\save-state.ps1 snapshot pre-taunt-a
powershell -File tools\runtime-capture\save-state.ps1 restore pre-taunt-a
powershell -File tools\runtime-capture\save-state.ps1 list
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet('snapshot', 'restore', 'list')]
    [string] $Command,
    [Parameter(Position = 1)]
    [string] $Name,
    # Restore a snapshot that looks like a WIPED save anyway. See Test-WipedSave.
    [switch] $Force
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$saveRoot = Join-Path $env:LOCALAPPDATA 'ruffle\SharedObjects'
$snapshotRoot = Join-Path $env:LOCALAPPDATA 'ss2-capture-snapshots'

function Invoke-Mirror([string] $source, [string] $destination) {
    # /MIR mirrors the tree exactly (including deletions at the destination).
    & robocopy $source $destination /MIR /R:2 /W:1 /NP /NFL /NDL /NJH /NJS | Out-Null
    if ($LASTEXITCODE -ge 8) {
        throw "robocopy failed with exit code $LASTEXITCODE mirroring '$source' -> '$destination'."
    }
}

function Assert-TreesIdentical([string] $left, [string] $right) {
    $leftFiles = @(Get-ChildItem -LiteralPath $left -Recurse -File | Sort-Object { $_.FullName.Substring($left.Length) })
    $rightFiles = @(Get-ChildItem -LiteralPath $right -Recurse -File | Sort-Object { $_.FullName.Substring($right.Length) })
    # AN EMPTY TREE IS NOT A VERIFIED TREE. `0 -ne 0` passes, so this function
    # printed "Verified: 0 file(s) identical." for a snapshot of nothing - and
    # then run-arena.ps1 accepted that as a restore point and mutated the
    # licensed save behind it.
    #
    # The restore direction is worse. Invoke-Mirror uses robocopy /MIR, which
    # DELETES at the destination, so restoring an empty snapshot would not fail
    # to help - it would destroy the save it was taken to protect. This is the
    # safety net for every save-mutating run in the project, and it could have
    # been the thing that lost the gladiator.
    if ($leftFiles.Count -eq 0 -or $rightFiles.Count -eq 0) {
        throw "Verification failed: one side holds NO files ($($leftFiles.Count) vs $($rightFiles.Count)). " +
            'A snapshot of nothing is not a restore point, and restoring it would mirror the emptiness ' +
            'onto the real save.'
    }
    if ($leftFiles.Count -ne $rightFiles.Count) {
        throw "Verification failed: $($leftFiles.Count) vs $($rightFiles.Count) files."
    }
    for ($i = 0; $i -lt $leftFiles.Count; $i++) {
        $leftRelative = $leftFiles[$i].FullName.Substring($left.Length)
        $rightRelative = $rightFiles[$i].FullName.Substring($right.Length)
        if ($leftRelative -ne $rightRelative) {
            throw "Verification failed: path mismatch '$leftRelative' vs '$rightRelative'."
        }
        $leftHash = (Get-FileHash -LiteralPath $leftFiles[$i].FullName -Algorithm SHA256).Hash
        $rightHash = (Get-FileHash -LiteralPath $rightFiles[$i].FullName -Algorithm SHA256).Hash
        if ($leftHash -ne $rightHash) {
            throw "Verification failed: content mismatch at '$leftRelative'."
        }
    }
    Write-Host "Verified: $($leftFiles.Count) file(s) identical."
}

# The game wipes its own save and flushes the wipe, unprompted.
#
# `refresh_gladiators` (root frame 10) reads `max_gladiators`, and when it is
# undefined, 0 or NaN it rewrites every character slot to "Empty,0", sets the
# count to 0, and flushes UNCONDITIONALLY - on every path, at a frame every
# launch passes. So a `.sol` that is ever short or unparseable destroys itself
# the next time the game opens, and relaunching to inspect the damage is the act
# that erases the evidence.
#
# Which means a wiped save can be snapshotted, and one has been: the store holds
# `zainger-repaired`, 267 bytes, `character1 = Empty` - a wiped save under a name
# that reads like a rescue. Restoring it would look exactly like a recovery and
# would leave no gladiator at all.
#
# The check has to be PRECISE, not merely cautious. A first attempt asked
# whether the file contained `character1` and `Empty` anywhere - which is true of
# EVERY healthy save, because slots 2..11 are legitimately empty and only
# character1 holds the gladiator. It refused the known-good level-4 snapshot.
#
# So: find character1's key, and ask whether ITS VALUE begins `Empty`. In a wiped
# save the value is the literal "Empty,0" and follows the key within a few bytes
# of AMF0 type/length header; in a healthy one the gladiator's DNA string sits
# there instead and the nearest `Empty` is a later slot, far away.
function Test-WipedSave([string] $root) {
    $sol = Get-ChildItem -LiteralPath $root -Recurse -File -Filter 'ss2_data.sol' -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $sol) { return $false }
    $text = [System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes($sol.FullName))
    $keyAt = $text.IndexOf('character1')
    if ($keyAt -lt 0) { return $false }
    $emptyAt = $text.IndexOf('Empty', $keyAt)
    if ($emptyAt -lt 0) { return $false }
    # character1's own value, not a later slot's.
    # MEASURED, not guessed. In the wiped snapshot the gap is 21 bytes; in all
    # three known-good saves it is 448-456, because the gladiator DNA string
    # sits where "Empty,0" would be. A first attempt used 20 and missed the
    # wiped one by a single byte, which is exactly the kind of threshold that
    # should be read off the data rather than assumed.
    return (($emptyAt - $keyAt) -lt 64)
}

switch ($Command) {
    'list' {
        if (Test-Path -LiteralPath $snapshotRoot) {
            Get-ChildItem $snapshotRoot -Directory | Select-Object Name, LastWriteTime
        } else {
            Write-Host 'No snapshots yet.'
        }
    }
    'snapshot' {
        if (-not $Name) { throw 'snapshot requires a name.' }
        if (-not (Test-Path -LiteralPath $saveRoot)) { throw "No Ruffle save data exists yet at $saveRoot." }
        if (@(Get-ChildItem -LiteralPath $saveRoot -Recurse -File).Count -eq 0) {
            throw "$saveRoot holds no files; a snapshot of nothing is not a restore point."
        }
        if (Get-Process ruffle -ErrorAction SilentlyContinue) {
            throw 'Ruffle is running; close every capture window before snapshotting.'
        }
        $dest = Join-Path $snapshotRoot $Name
        if (Test-Path -LiteralPath $dest) { throw "Snapshot '$Name' already exists; pick a new name." }
        Invoke-Mirror $saveRoot $dest
        Assert-TreesIdentical $saveRoot $dest
        Write-Host "Snapshotted Ruffle saves to $dest"
    }
    'restore' {
        if (-not $Name) { throw 'restore requires a name.' }
        $source = Join-Path $snapshotRoot $Name
        if (-not (Test-Path -LiteralPath $source)) { throw "Snapshot '$Name' does not exist." }
        if (@(Get-ChildItem -LiteralPath $source -Recurse -File).Count -eq 0) {
            throw "Snapshot '$Name' holds no files. Restoring it would MIRROR THAT EMPTINESS onto the real save, because Invoke-Mirror uses robocopy /MIR, which deletes at the destination."
        }
        # Parenthesised: PowerShell would otherwise pass `-and -not $Force` as
        # ARGUMENTS to Test-WipedSave, silently ignoring -Force.
        if ((Test-WipedSave $source) -and (-not $Force)) {
            throw "Snapshot '$Name' looks like a WIPED save: its ss2_data.sol carries " +
                "'Empty' in the first character slot. The game blanks and flushes its own save " +
                "when max_gladiators reads undefined/0/NaN, so a wipe can be snapshotted and " +
                "will restore as a total loss of the gladiator. Pass -Force if you are certain."
        }
        if (Get-Process ruffle -ErrorAction SilentlyContinue) {
            throw 'Ruffle is running; close every capture window before restoring.'
        }
        Invoke-Mirror $source $saveRoot
        Assert-TreesIdentical $source $saveRoot
        Write-Host "Restored Ruffle saves from snapshot '$Name'."
    }
}
