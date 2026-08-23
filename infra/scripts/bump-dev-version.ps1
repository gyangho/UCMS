param(
    [string]$VersionFile = (Join-Path $PSScriptRoot "..\..\VERSION")
)

$ErrorActionPreference = "Stop"

# 2026-08-23: Keep each development deployment on a unique 0.1.x application version.
$resolvedVersionFile = [System.IO.Path]::GetFullPath($VersionFile)
if (-not (Test-Path -LiteralPath $resolvedVersionFile -PathType Leaf)) {
    throw "Version file not found: $resolvedVersionFile"
}

$currentVersion = (Get-Content -LiteralPath $resolvedVersionFile -Raw).Trim()
if ($currentVersion -notmatch '^0\.1\.(\d+)$') {
    throw "Development version must use 0.1.x: $currentVersion"
}

$nextPatch = [int]$Matches[1] + 1
$nextVersion = "0.1.$nextPatch"
[System.IO.File]::WriteAllText($resolvedVersionFile, "$nextVersion`n", [System.Text.UTF8Encoding]::new($false))
Write-Output $nextVersion
