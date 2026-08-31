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
    [string] $Name
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
        if (Get-Process ruffle -ErrorAction SilentlyContinue) {
            throw 'Ruffle is running; close every capture window before restoring.'
        }
        Invoke-Mirror $source $saveRoot
        Assert-TreesIdentical $source $saveRoot
        Write-Host "Restored Ruffle saves from snapshot '$Name'."
    }
}
