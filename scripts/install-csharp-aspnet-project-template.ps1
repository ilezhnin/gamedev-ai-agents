[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)]
    [string] $TargetProject,

    [switch] $Force,
    [switch] $Update,
    [switch] $AllowNonDotnetTarget
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "kit-common.ps1")

$targetRoot = Resolve-KitTarget -TargetProject $TargetProject

if (-not $AllowNonDotnetTarget) {
    $hasSolution = @(Get-ChildItem -LiteralPath $targetRoot -Filter "*.sln" -File -ErrorAction SilentlyContinue).Count -gt 0 -or
                   @(Get-ChildItem -LiteralPath $targetRoot -Filter "*.slnx" -File -ErrorAction SilentlyContinue).Count -gt 0
    $hasProject = @(Get-ChildItem -LiteralPath $targetRoot -Filter "*.csproj" -File -Recurse -Depth 3 -ErrorAction SilentlyContinue).Count -gt 0
    if (-not $hasSolution -and -not $hasProject) {
        Write-Error "Target does not look like a .NET project (no .sln, .slnx, or .csproj found): $targetRoot`nPass -AllowNonDotnetTarget to install anyway."
        exit 1
    }
}

$ctx = New-InstallContext -TargetRoot $targetRoot -ManifestPath (Join-Path $targetRoot ".agents\kit-manifest.json") -Force:$Force -Update:$Update

Install-KitTree -Ctx $ctx -SourceDir (Join-Path $script:KitRoot "templates\csharp-aspnet-project") -RelDestPrefix "" -Cmdlet $PSCmdlet
Install-KitSkills -Ctx $ctx -SkillNames ($script:BackendSkills + $script:SharedSkills) -Cmdlet $PSCmdlet

Complete-KitInstall -Ctx $ctx -Cmdlet $PSCmdlet
Write-Host "C# ASP.NET Codex template installed to $targetRoot"
