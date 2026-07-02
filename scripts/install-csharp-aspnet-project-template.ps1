[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)]
    [string] $TargetProject,

    [switch] $Force,
    [switch] $Update,
    [switch] $AllowNonDotnetTarget,

    # Portable install: list every kit file in the repository's .git/info/exclude
    # (a local, never-committed ignore file) so the kit stays out of git status.
    # Later installs/updates refresh the block automatically; uninstall removes it.
    [switch] $Portable
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "kit-common.ps1")

$targetRoot = Resolve-KitTarget -TargetProject $TargetProject

if (-not $AllowNonDotnetTarget) {
    $hasSolution = @(Get-ChildItem -LiteralPath $targetRoot -Filter "*.sln" -File -ErrorAction SilentlyContinue).Count -gt 0 -or
                   @(Get-ChildItem -LiteralPath $targetRoot -Filter "*.slnx" -File -ErrorAction SilentlyContinue).Count -gt 0
    $hasProject = @(Get-ChildItem -LiteralPath $targetRoot -Filter "*.csproj" -File -Recurse -Depth 3 -ErrorAction SilentlyContinue).Count -gt 0
    if (-not $hasSolution -and -not $hasProject) {
        Stop-KitWithError "Target does not look like a .NET project (no .sln, .slnx, or .csproj found): $targetRoot`nPass -AllowNonDotnetTarget to install anyway."
    }
}

$ctx = New-InstallContext -TargetRoot $targetRoot -ManifestPath (Join-Path $targetRoot ".agents\kit-manifest.json") -Force:$Force -Update:$Update

Install-KitBackendContent -Ctx $ctx -Cmdlet $PSCmdlet

Complete-KitInstall -Ctx $ctx -Cmdlet $PSCmdlet

if ($Portable -or (Test-KitGitExclude -TargetRoot $targetRoot)) {
    Write-KitGitExclude -Ctx $ctx -Cmdlet $PSCmdlet
}

Write-Host "C# ASP.NET Codex template installed to $targetRoot"
