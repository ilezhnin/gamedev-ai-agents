[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $TargetProject,

    [switch] $Force
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$templateRoot = Join-Path $repoRoot "templates\unity-project"
$targetRoot = (Resolve-Path -LiteralPath $TargetProject).Path

foreach ($marker in @("Assets", "Packages", "ProjectSettings")) {
    $path = Join-Path $targetRoot $marker
    if (-not (Test-Path -LiteralPath $path)) {
        Write-Warning "Target does not contain '$marker'. Continue only if this is intentional: $targetRoot"
    }
}

$files = Get-ChildItem -LiteralPath $templateRoot -Force -Recurse -File

foreach ($file in $files) {
    $relative = $file.FullName.Substring($templateRoot.Length).TrimStart("\", "/")
    $destination = Join-Path $targetRoot $relative
    $destinationDir = Split-Path -Parent $destination

    if (-not (Test-Path -LiteralPath $destinationDir)) {
        New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null
    }

    if ((Test-Path -LiteralPath $destination) -and -not $Force) {
        Write-Host "SKIP existing $relative"
        continue
    }

    Copy-Item -LiteralPath $file.FullName -Destination $destination -Force:$Force
    Write-Host "COPY $relative"
}

Write-Host "Unity Codex template installed to $targetRoot"
