# Renders the UPM package payload (upm/Kit~) from the kit sources: the Unity
# template tree, the unity+shared skills (with the .claude mirror), the platform
# adapters rendered from global/canon, and the meta-check script. The payload is
# byte-identical to what install-unity-project-template.ps1 would place into a
# project; the in-editor installer only copies files and writes the manifest.
# Re-run after changing templates, skills, or canon. validate-kit.ps1 fails on drift.
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    # Render target. Defaults to the committed payload at upm/Kit~; validate-kit
    # renders into a temp directory to detect drift without touching the repo.
    [string] $OutDir
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "kit-common.ps1")

$defaultOut = Join-Path $script:KitRoot "upm\Kit~"
if (-not $OutDir) { $OutDir = $defaultOut }
$isDefaultOut = ($OutDir -eq $defaultOut)

if (Test-Path -LiteralPath $OutDir) {
    Remove-Item -LiteralPath $OutDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# Same content set as install-unity-project-template.ps1. No manifest is written
# here: the in-editor installer writes .agents/kit-manifest.json at install time.
$ctx = New-InstallContext -TargetRoot $OutDir -ManifestPath (Join-Path $OutDir ".agents\kit-manifest.json") -Force

Install-KitTree -Ctx $ctx -SourceDir (Join-Path $script:KitRoot "templates\unity-project") -RelDestPrefix "" -Cmdlet $PSCmdlet
Install-KitSkills -Ctx $ctx -SkillNames ($script:UnitySkills + $script:SharedSkills) -Cmdlet $PSCmdlet -MirrorClaude
Install-KitPlatformAdapters -Ctx $ctx -Stack "unity" -Cmdlet $PSCmdlet
Install-KitFile -Ctx $ctx -Source (Join-Path $PSScriptRoot "check-unity-meta.ps1") -RelDest ".agents\scripts\check-unity-meta.ps1" -Cmdlet $PSCmdlet

# Keep the UPM manifest version in lock-step with VERSION, but only when
# rendering the committed payload (drift checks must not mutate the repo).
if ($isDefaultOut) {
    $packageJsonPath = Join-Path $script:KitRoot "upm\package.json"
    if (Test-Path -LiteralPath $packageJsonPath) {
        $kitVersion = Get-KitVersion
        $raw = Get-Content -LiteralPath $packageJsonPath -Raw
        $updated = $raw -replace '"version":\s*"[^"]*"', ('"version": "' + $kitVersion + '"')
        if ($updated -ne $raw -and $PSCmdlet.ShouldProcess($packageJsonPath, "Sync version to $kitVersion")) {
            [System.IO.File]::WriteAllText($packageJsonPath, $updated, (New-Object System.Text.UTF8Encoding $false))
            Write-Host "SYNC upm/package.json version -> $kitVersion"
        }
    }
}

Write-Host "Rendered $($ctx.Copied) payload files into $OutDir (kit $(Get-KitVersion))"
