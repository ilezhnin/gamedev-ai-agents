[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)]
    [string] $TargetProject,

    [switch] $Force,
    [switch] $Update,
    [switch] $AllowNonUnityTarget
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "kit-common.ps1")

$targetRoot = Resolve-KitTarget -TargetProject $TargetProject

if (-not $AllowNonUnityTarget) {
    $missing = @("Assets", "ProjectSettings") | Where-Object { -not (Test-Path -LiteralPath (Join-Path $targetRoot $_)) }
    if ($missing) {
        Write-Error "Target does not look like a Unity project (missing: $($missing -join ", ")): $targetRoot`nPass -AllowNonUnityTarget to install anyway."
        exit 1
    }
}

$ctx = New-InstallContext -TargetRoot $targetRoot -ManifestPath (Join-Path $targetRoot ".agents\kit-manifest.json") -Force:$Force -Update:$Update

Install-KitTree -Ctx $ctx -SourceDir (Join-Path $script:KitRoot "templates\unity-project") -RelDestPrefix "" -Cmdlet $PSCmdlet
Install-KitSkills -Ctx $ctx -SkillNames ($script:UnitySkills + $script:SharedSkills) -Cmdlet $PSCmdlet
Install-KitFile -Ctx $ctx -Source (Join-Path $PSScriptRoot "check-unity-meta.ps1") -RelDest ".codex\scripts\check-unity-meta.ps1" -Cmdlet $PSCmdlet

Complete-KitInstall -Ctx $ctx -Cmdlet $PSCmdlet
Write-Host "Unity Codex template installed to $targetRoot"
