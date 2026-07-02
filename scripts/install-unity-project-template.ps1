[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)]
    [string] $TargetProject,

    [switch] $Force,
    [switch] $Update,
    [switch] $AllowNonUnityTarget,

    # Portable install: list every kit file in the repository's .git/info/exclude
    # (a local, never-committed ignore file) so the kit stays out of git status.
    # Later installs/updates refresh the block automatically; uninstall removes it.
    [switch] $Portable
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "kit-common.ps1")

$targetRoot = Resolve-KitTarget -TargetProject $TargetProject

if (-not $AllowNonUnityTarget) {
    $missing = @("Assets", "ProjectSettings") | Where-Object { -not (Test-Path -LiteralPath (Join-Path $targetRoot $_)) }
    if ($missing) {
        Stop-KitWithError "Target does not look like a Unity project (missing: $($missing -join ", ")): $targetRoot`nPass -AllowNonUnityTarget to install anyway."
    }
}

$ctx = New-InstallContext -TargetRoot $targetRoot -ManifestPath (Join-Path $targetRoot ".agents\kit-manifest.json") -Force:$Force -Update:$Update

Install-KitUnityContent -Ctx $ctx -Cmdlet $PSCmdlet

Complete-KitInstall -Ctx $ctx -Cmdlet $PSCmdlet

if ($Portable -or (Test-KitGitExclude -TargetRoot $targetRoot)) {
    Write-KitGitExclude -Ctx $ctx -Cmdlet $PSCmdlet
}

Write-Host "Unity Codex template installed to $targetRoot"
