[CmdletBinding(SupportsShouldProcess = $true, DefaultParameterSetName = "Project")]
param(
    [Parameter(Mandatory = $true, ParameterSetName = "Project")]
    [string] $TargetProject,

    # Uninstall the global profile instead of a project: removes manifest-tracked
    # kit files under CODEX_HOME (default ~/.codex), ~/.agents, and ~/.claude.
    [Parameter(Mandatory = $true, ParameterSetName = "Global")]
    [switch] $Global,

    # Also delete kit files the user modified locally. Default keeps them.
    [switch] $Force
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "kit-common.ps1")

if ($Global) {
    if ($env:CODEX_HOME) { $codexHome = $env:CODEX_HOME } else { $codexHome = Join-Path $HOME ".codex" }
    $roots = @(
        @{ Root = $codexHome; Manifest = (Join-Path $codexHome "kit-manifest.json") }
        @{ Root = (Join-Path $HOME ".agents"); Manifest = (Join-Path $HOME ".agents\kit-manifest.json") }
        @{ Root = (Join-Path $HOME ".claude"); Manifest = (Join-Path $HOME ".claude\kit-manifest.json") }
    )
    $found = $false
    foreach ($entry in $roots) {
        if (Uninstall-KitManifestTree -TargetRoot $entry.Root -ManifestPath $entry.Manifest -Force:$Force -Cmdlet $PSCmdlet) {
            $found = $true
        }
    }
    if (-not $found) {
        Stop-KitWithError "No kit manifest found under $codexHome, ~/.agents, or ~/.claude - nothing to uninstall (or the profile was installed by an old script version)."
    }
    Write-Host "NOTE: a WSL profile installed with -InstallWslSkills is not tracked and must be removed inside WSL manually."
    exit 0
}

$targetRoot = Resolve-KitTarget -TargetProject $TargetProject
$manifestPath = Join-Path $targetRoot ".agents\kit-manifest.json"
if (-not (Uninstall-KitManifestTree -TargetRoot $targetRoot -ManifestPath $manifestPath -Force:$Force -Cmdlet $PSCmdlet)) {
    Stop-KitWithError "No kit manifest found at $manifestPath - nothing to uninstall (or the kit was installed by an old script version)."
}
Remove-KitGitExclude -TargetRoot $targetRoot -Cmdlet $PSCmdlet
