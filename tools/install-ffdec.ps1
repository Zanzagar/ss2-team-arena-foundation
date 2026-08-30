[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent $PSScriptRoot
$toolsRoot = Join-Path $projectRoot '.tools'
$ffdecVersion = '26.2.1'
$ffdecRoot = Join-Path $toolsRoot "ffdec-$ffdecVersion"
$javaRoot = Join-Path $toolsRoot 'temurin-jre-21'

New-Item -ItemType Directory -Path $toolsRoot -Force | Out-Null

if ((Test-Path -LiteralPath $ffdecRoot) -or (Test-Path -LiteralPath $javaRoot)) {
    throw "Portable tool destination already exists. Refusing to overwrite: $toolsRoot"
}
$temporaryParent = [System.IO.Path]::GetTempPath()
$temporaryRoot = Join-Path $temporaryParent ("ss2-ffdec-install-" + [guid]::NewGuid().ToString('N'))
$resolvedTemporaryParent = [System.IO.Path]::GetFullPath($temporaryParent)
$resolvedTemporaryRoot = [System.IO.Path]::GetFullPath($temporaryRoot)
if (-not $resolvedTemporaryRoot.StartsWith($resolvedTemporaryParent, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Temporary install path escaped the system temporary directory: $resolvedTemporaryRoot"
}

New-Item -ItemType Directory -Path $temporaryRoot | Out-Null

try {
    $githubHeaders = @{ 'User-Agent' = 'ss2-team-arena-foundation' }
    $releaseUri = "https://api.github.com/repos/jindrapetrik/jpexs-decompiler/releases/tags/version$ffdecVersion"
    $release = Invoke-RestMethod -Uri $releaseUri -Headers $githubHeaders
    $ffdecAsset = $release.assets | Where-Object name -EQ "ffdec_$ffdecVersion.zip" | Select-Object -First 1
    if (-not $ffdecAsset) {
        throw "The FFDec $ffdecVersion ZIP asset was not present in the official GitHub release."
    }

    $javaAssetsUri = 'https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jre&os=windows&vendor=eclipse'
    $javaAssets = Invoke-RestMethod -Uri $javaAssetsUri -Headers @{ 'User-Agent' = 'ss2-team-arena-foundation' }
    $javaAsset = $javaAssets | Select-Object -First 1
    if (-not $javaAsset.binary.package.link -or -not $javaAsset.binary.package.checksum) {
        throw 'The official Adoptium API did not return a Windows x64 JRE package and checksum.'
    }

    $ffdecArchive = Join-Path $temporaryRoot $ffdecAsset.name
    $javaArchive = Join-Path $temporaryRoot $javaAsset.binary.package.name
    Invoke-WebRequest -Uri $ffdecAsset.browser_download_url -OutFile $ffdecArchive -Headers $githubHeaders
    Invoke-WebRequest -Uri $javaAsset.binary.package.link -OutFile $javaArchive -Headers @{ 'User-Agent' = 'ss2-team-arena-foundation' }

    $ffdecHash = (Get-FileHash -LiteralPath $ffdecArchive -Algorithm SHA256).Hash
    if ($ffdecAsset.digest) {
        $expectedFfdecHash = ($ffdecAsset.digest -split ':')[-1]
        if ($ffdecHash -ne $expectedFfdecHash) {
            throw "FFDec checksum mismatch. Expected $expectedFfdecHash, received $ffdecHash."
        }
    }

    $javaHash = (Get-FileHash -LiteralPath $javaArchive -Algorithm SHA256).Hash
    if ($javaHash -ne $javaAsset.binary.package.checksum) {
        throw "Temurin checksum mismatch. Expected $($javaAsset.binary.package.checksum), received $javaHash."
    }

    Expand-Archive -LiteralPath $ffdecArchive -DestinationPath $ffdecRoot
    Expand-Archive -LiteralPath $javaArchive -DestinationPath $javaRoot

    $java = Get-ChildItem -LiteralPath $javaRoot -Filter 'java.exe' -File -Recurse |
        Where-Object { $_.Directory.Name -eq 'bin' } |
        Select-Object -First 1
    $ffdecJar = Get-ChildItem -LiteralPath $ffdecRoot -Filter 'ffdec.jar' -File -Recurse | Select-Object -First 1
    if (-not $java -or -not $ffdecJar) {
        throw 'Portable FFDec or Java extraction did not contain the expected executable files.'
    }

    & $java.FullName -version
    if ($LASTEXITCODE -ne 0) { throw "Portable Java verification failed with exit code $LASTEXITCODE." }
    & $java.FullName -jar $ffdecJar.FullName -help | Select-Object -First 8
    if ($LASTEXITCODE -ne 0) { throw "FFDec verification failed with exit code $LASTEXITCODE." }

    [pscustomobject]@{
        FFDecVersion = $ffdecVersion
        FFDecPath = $ffdecJar.FullName
        FFDecSHA256 = $ffdecHash
        JavaPath = $java.FullName
        JavaSHA256 = $javaHash
    } | Format-List
}
finally {
    if (Test-Path -LiteralPath $temporaryRoot) {
        $cleanupTarget = [System.IO.Path]::GetFullPath($temporaryRoot)
        if ($cleanupTarget.StartsWith($resolvedTemporaryParent, [System.StringComparison]::OrdinalIgnoreCase)) {
            Remove-Item -LiteralPath $cleanupTarget -Recurse -Force
        }
    }
}
