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

$java = Get-ChildItem -LiteralPath (Join-Path $toolsRoot 'temurin-jre-21') -Filter 'java.exe' -File -Recurse |
    Where-Object { $_.Directory.Name -eq 'bin' } |
    Select-Object -First 1
$ffdecJar = Get-ChildItem -LiteralPath (Join-Path $toolsRoot 'ffdec-26.2.1') -Filter 'ffdec.jar' -File -Recurse |
    Select-Object -First 1

if (-not $java -or -not $ffdecJar) {
    throw 'Portable FFDec is not installed. Run tools/install-ffdec.ps1 first.'
}

# APPDATA and LOCALAPPDATA are redirected so FFDec keeps its profile inside
# .tools/ instead of the user's real one - but `$env:` assignments are
# PROCESS-wide, and this script is invoked with `&` from other scripts, so
# without the restore below the redirection outlives the java call and every
# later `$env:LOCALAPPDATA` in the CALLER reads .tools/ffdec-profile.
#
# That leak is not hypothetical. It is the entire -SaveDirectory defect: after
# a wrapper compile, launch-capture.ps1 computed the master SharedObject store
# as "$env:LOCALAPPDATA\ruffle\SharedObjects", got a path inside .tools/ that
# does not exist, skipped the seed copy behind a Test-Path, and handed Ruffle an
# empty isolated store. The session then found no saved gladiator - which was
# recorded for a whole session as "Ruffle ignores the seeded copy".
$savedAppData = $env:APPDATA
$savedLocalAppData = $env:LOCALAPPDATA
try {
    $env:APPDATA = $ffdecProfile
    $env:LOCALAPPDATA = $ffdecProfile
    & $java.FullName "-Duser.home=$ffdecProfile" -jar $ffdecJar.FullName @FfdecArguments
    $ffdecExit = $LASTEXITCODE
} finally {
    $env:APPDATA = $savedAppData
    $env:LOCALAPPDATA = $savedLocalAppData
}
exit $ffdecExit
