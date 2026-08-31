[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent $PSScriptRoot
$toolsRoot = Join-Path $projectRoot '.tools'
$ruffleVersion = '0.5.0'
$ruffleRoot = Join-Path $toolsRoot "ruffle-$ruffleVersion"
$assetName = "ruffle-$ruffleVersion-windows-x86_64.zip"
# SHA-256 of the official release asset, recorded at install time 2026-08-30
# and matching the digest GitHub publishes for the asset.
$pinnedSha256 = '5B4B61F32615C7228B27F5A7098C383DC6C693A7648AF2D19D26724B8790AEFD'

New-Item -ItemType Directory -Path $toolsRoot -Force | Out-Null
if (Test-Path -LiteralPath $ruffleRoot) {
    throw "Portable tool destination already exists. Refusing to overwrite: $ruffleRoot"
}

$temporaryParent = [System.IO.Path]::GetTempPath()
$temporaryRoot = Join-Path $temporaryParent ("ss2-ruffle-install-" + [guid]::NewGuid().ToString('N'))
$resolvedTemporaryParent = [System.IO.Path]::GetFullPath($temporaryParent)
$resolvedTemporaryRoot = [System.IO.Path]::GetFullPath($temporaryRoot)
if (-not $resolvedTemporaryRoot.StartsWith($resolvedTemporaryParent, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Temporary install path escaped the system temporary directory: $resolvedTemporaryRoot"
}
New-Item -ItemType Directory -Path $temporaryRoot | Out-Null

try {
    $headers = @{ 'User-Agent' = 'swords-and-sandals-2-multiplayer' }
    $releaseUri = "https://api.github.com/repos/ruffle-rs/ruffle/releases/tags/v$ruffleVersion"
    $release = Invoke-RestMethod -Uri $releaseUri -Headers $headers
    $asset = $release.assets | Where-Object name -EQ $assetName | Select-Object -First 1
    if (-not $asset) {
        throw "The Ruffle $ruffleVersion asset $assetName was not present in the official GitHub release."
    }

    $archive = Join-Path $temporaryRoot $assetName
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $archive -Headers $headers

    $hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
    if ($hash -ne $pinnedSha256) {
        throw "Ruffle checksum mismatch. Expected $pinnedSha256, received $hash."
    }
    if ($asset.digest) {
        $publishedHash = (($asset.digest -split ':')[-1]).ToUpperInvariant()
        if ($hash -ne $publishedHash) {
            throw "Ruffle checksum disagrees with the GitHub-published digest. Published $publishedHash, received $hash."
        }
    }

    Expand-Archive -LiteralPath $archive -DestinationPath $ruffleRoot
    $exe = Join-Path $ruffleRoot 'ruffle.exe'
    if (-not (Test-Path -LiteralPath $exe)) {
        throw 'The extracted Ruffle archive did not contain ruffle.exe.'
    }
    & $exe --version
    if ($LASTEXITCODE -ne 0) { throw "Ruffle verification failed with exit code $LASTEXITCODE." }

    [pscustomobject]@{
        RuffleVersion = $ruffleVersion
        RufflePath = $exe
        RuffleSHA256 = $hash
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
