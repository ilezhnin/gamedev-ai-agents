[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $TargetProject,

    [switch] $Force
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$templateRoot = Join-Path $repoRoot "templates\csharp-aspnet-project"
$skillsRoot = Join-Path (Join-Path $repoRoot "plugins\codex-unity-agent-kit") "skills"
$targetRoot = (Resolve-Path -LiteralPath $TargetProject).Path

$hasSolution = @(Get-ChildItem -LiteralPath $targetRoot -Force -Filter "*.sln" -File -ErrorAction SilentlyContinue).Count -gt 0 -or @(Get-ChildItem -LiteralPath $targetRoot -Force -Filter "*.slnx" -File -ErrorAction SilentlyContinue).Count -gt 0
$hasProject = @(Get-ChildItem -LiteralPath $targetRoot -Force -Filter "*.csproj" -File -Recurse -ErrorAction SilentlyContinue).Count -gt 0

if (-not $hasSolution -and -not $hasProject) {
    Write-Warning "Target does not contain a .sln, .slnx, or .csproj. Continue only if this is intentional: $targetRoot"
}

function Copy-KitFile {
    param(
        [Parameter(Mandatory = $true)] [string] $Source,
        [Parameter(Mandatory = $true)] [string] $Destination,
        [Parameter(Mandatory = $true)] [string] $Label
    )

    $destinationDir = Split-Path -Parent $Destination
    if (-not (Test-Path -LiteralPath $destinationDir)) {
        New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null
    }

    if ((Test-Path -LiteralPath $Destination) -and -not $Force) {
        Write-Host "SKIP existing $Label"
        return
    }

    Copy-Item -LiteralPath $Source -Destination $Destination -Force:$Force
    Write-Host "COPY $Label"
}

function Copy-KitDirectory {
    param(
        [Parameter(Mandatory = $true)] [string] $Source,
        [Parameter(Mandatory = $true)] [string] $Destination,
        [Parameter(Mandatory = $true)] [string] $Label
    )

    if ((Test-Path -LiteralPath $Destination) -and -not $Force) {
        Write-Host "SKIP existing $Label"
        return
    }

    if (-not (Test-Path -LiteralPath $Destination)) {
        New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    }

    Get-ChildItem -LiteralPath $Source -Force | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $Destination -Recurse -Force:$Force
    }

    Write-Host "COPY $Label"
}

$templateFiles = Get-ChildItem -LiteralPath $templateRoot -Force -Recurse -File

foreach ($file in $templateFiles) {
    $relative = $file.FullName.Substring($templateRoot.Length).TrimStart("\", "/")
    $destination = Join-Path $targetRoot $relative
    Copy-KitFile -Source $file.FullName -Destination $destination -Label $relative
}

$skillNames = @(
    "planning",
    "crossworking",
    "teamwork-preview",
    "create-mr",
    "grill-me",
    "learn",
    "csharp-backend-implement",
    "csharp-backend-review",
    "csharp-backend-validate"
)

foreach ($skillName in $skillNames) {
    $source = Join-Path $skillsRoot $skillName
    if (-not (Test-Path -LiteralPath $source)) {
        throw "Missing bundled skill: $skillName"
    }

    $destination = Join-Path (Join-Path $targetRoot ".agents\skills") $skillName
    Copy-KitDirectory -Source $source -Destination $destination -Label ".agents\skills\$skillName"
}

Write-Host "C# ASP.NET Codex template installed to $targetRoot"
