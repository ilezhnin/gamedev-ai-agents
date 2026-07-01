[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)]
    [string] $TargetProject,

    # Also delete kit files the user modified locally. Default keeps them.
    [switch] $Force
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "kit-common.ps1")

$targetRoot = Resolve-KitTarget -TargetProject $TargetProject
$manifestPath = Join-Path $targetRoot ".agents\kit-manifest.json"
$manifest = Read-KitManifest -Path $manifestPath
if (-not $manifest) {
    Write-Error "No kit manifest found at $manifestPath - nothing to uninstall (or the kit was installed by an old script version)."
    exit 1
}

$removed = 0
$kept = 0
$missing = 0
$dirs = New-Object System.Collections.Generic.HashSet[string]

foreach ($key in $manifest.files.Keys) {
    $path = Join-Path $targetRoot ($key -replace "/", "\")
    if (-not (Test-Path -LiteralPath $path)) { $missing++; continue }
    $hash = Get-FileSha256 -Path $path
    if ($hash -eq $manifest.files[$key] -or $Force) {
        if ($PSCmdlet.ShouldProcess($path, "Remove kit file")) {
            Remove-Item -LiteralPath $path -Force
        }
        Write-Host "REMOVE $key"
        $removed++
        $dir = Split-Path -Parent $path
        while ($dir -and $dir.Length -gt $targetRoot.Length) {
            [void]$dirs.Add($dir)
            $dir = Split-Path -Parent $dir
        }
    }
    else {
        Write-Host "KEEP (locally modified) $key"
        $kept++
    }
}

if ($PSCmdlet.ShouldProcess($manifestPath, "Remove kit manifest")) {
    Remove-Item -LiteralPath $manifestPath -Force -ErrorAction SilentlyContinue
}

# Clean up now-empty directories, deepest first.
foreach ($dir in ($dirs | Sort-Object { $_.Length } -Descending)) {
    if ((Test-Path -LiteralPath $dir) -and -not (Get-ChildItem -LiteralPath $dir -Force)) {
        if ($PSCmdlet.ShouldProcess($dir, "Remove empty directory")) {
            Remove-Item -LiteralPath $dir -Force
        }
    }
}

Write-Host "Summary: removed $removed, kept (modified) $kept, already missing $missing"
if ($kept -gt 0) {
    Write-Warning "Locally modified kit files were kept. Re-run with -Force to delete them too."
}
