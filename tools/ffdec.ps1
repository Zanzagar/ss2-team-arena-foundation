[CmdletBinding(PositionalBinding = $false)]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $FfdecArguments
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent $PSScriptRoot
$toolsRoot = Join-Path $projectRoot '.tools'
$ffdecProfile = Join-Path $toolsRoot 'ffdec-profile'
New-Item -ItemType Directory -Path $ffdecProfile -Force | Out-Null
$env:APPDATA = $ffdecProfile
$env:LOCALAPPDATA = $ffdecProfile
$java = Get-ChildItem -LiteralPath (Join-Path $toolsRoot 'temurin-jre-21') -Filter 'java.exe' -File -Recurse |
    Where-Object { $_.Directory.Name -eq 'bin' } |
    Select-Object -First 1
$ffdecJar = Get-ChildItem -LiteralPath (Join-Path $toolsRoot 'ffdec-26.2.1') -Filter 'ffdec.jar' -File -Recurse |
    Select-Object -First 1

if (-not $java -or -not $ffdecJar) {
    throw 'Portable FFDec is not installed. Run tools/install-ffdec.ps1 first.'
}

& $java.FullName "-Duser.home=$ffdecProfile" -jar $ffdecJar.FullName @FfdecArguments
exit $LASTEXITCODE
