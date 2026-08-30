<#
.SYNOPSIS
Snapshot and restore the portable Ruffle save state used by capture sessions.

Ruffle keeps its SharedObjects (the game's save data, created entirely inside
our capture sessions - the Steam installation's saves are never touched)
under its local storage directory. Snapshotting before a session and
restoring afterwards lets the same pending fight be replayed for the
independent second observation the promotion gate requires.

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

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$saveRoot = Join-Path $env:LOCALAPPDATA 'ruffle\SharedObjects'
$snapshotRoot = Join-Path $projectRoot 'captures\save-snapshots'

switch ($Command) {
    'list' {
        if (Test-Path $snapshotRoot) {
            Get-ChildItem $snapshotRoot -Directory | Select-Object Name, LastWriteTime
        } else {
            Write-Host 'No snapshots yet.'
        }
    }
    'snapshot' {
        if (-not $Name) { throw 'snapshot requires a name.' }
        if (-not (Test-Path $saveRoot)) { throw "No Ruffle save data exists yet at $saveRoot." }
        $dest = Join-Path $snapshotRoot $Name
        if (Test-Path $dest) { throw "Snapshot '$Name' already exists; pick a new name." }
        New-Item -ItemType Directory -Path $dest -Force | Out-Null
        Copy-Item -Path (Join-Path $saveRoot '*') -Destination $dest -Recurse -Force
        Write-Host "Snapshotted Ruffle saves to $dest"
    }
    'restore' {
        if (-not $Name) { throw 'restore requires a name.' }
        $source = Join-Path $snapshotRoot $Name
        if (-not (Test-Path $source)) { throw "Snapshot '$Name' does not exist." }
        if (Test-Path $saveRoot) {
            Remove-Item -Path (Join-Path $saveRoot '*') -Recurse -Force -Confirm:$false
        } else {
            New-Item -ItemType Directory -Path $saveRoot -Force | Out-Null
        }
        Copy-Item -Path (Join-Path $source '*') -Destination $saveRoot -Recurse -Force
        Write-Host "Restored Ruffle saves from snapshot '$Name'."
    }
}
