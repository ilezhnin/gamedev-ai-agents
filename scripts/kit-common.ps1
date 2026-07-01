# Shared helpers for Codex Unity Agent Kit scripts. Dot-source from sibling scripts.
# Compatible with Windows PowerShell 5.1 and pwsh 7. ASCII only.

$script:KitRoot = Split-Path -Parent $PSScriptRoot
$script:PluginSkillsRoot = Join-Path $script:KitRoot "plugins\codex-unity-agent-kit\skills"

$script:SharedSkills = @("planning", "crossworking", "create-mr", "grill-me", "learn")
$script:UnitySkills = @("unity-orient", "unity-implement", "unity-review", "unity-validate", "unity-debug", "unity-mcp", "unity-merge", "unity-build", "unity-upgrade", "unity-profile", "unity-tests")
$script:BackendSkills = @("backend-orient", "backend-implement", "backend-review", "backend-validate", "backend-debug")

function Get-KitVersion {
    $versionFile = Join-Path $script:KitRoot "VERSION"
    if (Test-Path -LiteralPath $versionFile) {
        return (Get-Content -LiteralPath $versionFile -Raw).Trim()
    }
    return "0.0.0"
}

function Get-FileSha256 {
    param([Parameter(Mandatory = $true)] [string] $Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
}

function Resolve-KitTarget {
    # Friendly target validation: returns the resolved directory path or exits with a clear error.
    param([Parameter(Mandatory = $true)] [string] $TargetProject)
    if (-not (Test-Path -LiteralPath $TargetProject)) {
        Write-Error "Target does not exist: $TargetProject"
        exit 1
    }
    $item = Get-Item -LiteralPath $TargetProject
    if (-not $item.PSIsContainer) {
        Write-Error "Target is a file, not a directory: $TargetProject"
        exit 1
    }
    return $item.FullName
}

function Read-KitManifest {
    param([Parameter(Mandatory = $true)] [string] $Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    $json = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    $files = @{}
    if ($json.files) {
        foreach ($prop in $json.files.PSObject.Properties) { $files[$prop.Name] = $prop.Value }
    }
    return @{ kitVersion = $json.kitVersion; files = $files }
}

function Write-KitManifest {
    param(
        [Parameter(Mandatory = $true)] [string] $Path,
        [Parameter(Mandatory = $true)] [hashtable] $Files
    )
    $dir = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    $sorted = New-Object System.Collections.Specialized.OrderedDictionary
    foreach ($key in ($Files.Keys | Sort-Object)) { $sorted[$key] = $Files[$key] }
    $manifest = [ordered]@{
        kitVersion     = Get-KitVersion
        installedAtUtc = [DateTime]::UtcNow.ToString("o")
        files          = $sorted
    }
    $json = $manifest | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText($Path, $json, (New-Object System.Text.UTF8Encoding $false))
}

function New-InstallContext {
    param(
        [Parameter(Mandatory = $true)] [string] $TargetRoot,
        [Parameter(Mandatory = $true)] [string] $ManifestPath,
        [switch] $Force,
        [switch] $Update
    )
    $old = Read-KitManifest -Path $ManifestPath
    if ($Update -and -not $old) {
        Write-Error "-Update requires a previous install (manifest not found at $ManifestPath). Run a plain install first."
        exit 1
    }
    return @{
        Target       = $TargetRoot
        ManifestPath = $ManifestPath
        Force        = [bool]$Force
        Update       = [bool]$Update
        Old          = $old
        New          = @{}
        Copied       = 0
        Refreshed    = 0
        Skipped      = 0
        Current      = 0
        Preserved    = 0
    }
}

function Install-KitFile {
    param(
        [Parameter(Mandatory = $true)] [hashtable] $Ctx,
        [Parameter(Mandatory = $true)] [string] $Source,
        [Parameter(Mandatory = $true)] [string] $RelDest,
        [Parameter(Mandatory = $true)] $Cmdlet
    )
    $dest = Join-Path $Ctx.Target $RelDest
    $key = $RelDest -replace "\\", "/"
    $srcHash = Get-FileSha256 -Path $Source
    $Ctx.New[$key] = $srcHash

    $destDir = Split-Path -Parent $dest
    if (-not (Test-Path -LiteralPath $dest)) {
        if ($Cmdlet.ShouldProcess($dest, "Copy new file")) {
            if (-not (Test-Path -LiteralPath $destDir)) { New-Item -ItemType Directory -Force -Path $destDir | Out-Null }
            Copy-Item -LiteralPath $Source -Destination $dest -Force
        }
        Write-Host "COPY $key"
        $Ctx.Copied++
        return
    }

    if ($Ctx.Force) {
        if ($Cmdlet.ShouldProcess($dest, "Overwrite (force)")) {
            Copy-Item -LiteralPath $Source -Destination $dest -Force
        }
        Write-Host "FORCE $key"
        $Ctx.Refreshed++
        return
    }

    if ($Ctx.Update) {
        $destHash = Get-FileSha256 -Path $dest
        if ($destHash -eq $srcHash) {
            $Ctx.Current++
            return
        }
        $oldHash = $null
        if ($Ctx.Old -and $Ctx.Old.files.ContainsKey($key)) { $oldHash = $Ctx.Old.files[$key] }
        if ($destHash -eq $oldHash) {
            if ($Cmdlet.ShouldProcess($dest, "Update unmodified kit file")) {
                Copy-Item -LiteralPath $Source -Destination $dest -Force
            }
            Write-Host "UPDATE $key"
            $Ctx.Refreshed++
        }
        else {
            # Manifest keeps the kit-content hash, so the local edit stays
            # recognized as a local edit on every future update.
            Write-Host "KEEP (locally modified) $key"
            $Ctx.Preserved++
        }
        return
    }

    Write-Host "SKIP existing $key"
    $Ctx.Skipped++
}

function Install-KitTree {
    param(
        [Parameter(Mandatory = $true)] [hashtable] $Ctx,
        [Parameter(Mandatory = $true)] [string] $SourceDir,
        [Parameter(Mandatory = $true)] [AllowEmptyString()] [string] $RelDestPrefix,
        [Parameter(Mandatory = $true)] $Cmdlet
    )
    if (-not (Test-Path -LiteralPath $SourceDir)) { return }
    $sourceRoot = (Get-Item -LiteralPath $SourceDir).FullName
    foreach ($file in Get-ChildItem -LiteralPath $sourceRoot -Force -Recurse -File) {
        $relative = $file.FullName.Substring($sourceRoot.Length).TrimStart("\", "/")
        $relDest = if ($RelDestPrefix) { Join-Path $RelDestPrefix $relative } else { $relative }
        Install-KitFile -Ctx $Ctx -Source $file.FullName -RelDest $relDest -Cmdlet $Cmdlet
    }
}

function Install-KitSkills {
    param(
        [Parameter(Mandatory = $true)] [hashtable] $Ctx,
        [Parameter(Mandatory = $true)] [string[]] $SkillNames,
        [Parameter(Mandatory = $true)] $Cmdlet,
        [string] $RelSkillsRoot = ".agents\skills"
    )
    foreach ($name in $SkillNames) {
        $source = Join-Path $script:PluginSkillsRoot $name
        if (-not (Test-Path -LiteralPath $source)) {
            Write-Error "Bundled skill missing from kit: $name (expected at $source)"
            exit 1
        }
        Install-KitTree -Ctx $Ctx -SourceDir $source -RelDestPrefix (Join-Path $RelSkillsRoot $name) -Cmdlet $Cmdlet
    }
}

function Complete-KitInstall {
    param(
        [Parameter(Mandatory = $true)] [hashtable] $Ctx,
        [Parameter(Mandatory = $true)] $Cmdlet
    )
    $staleRemoved = 0
    $staleKept = 0
    if ($Ctx.Update -and $Ctx.Old) {
        foreach ($key in $Ctx.Old.files.Keys) {
            if ($Ctx.New.ContainsKey($key)) { continue }
            $path = Join-Path $Ctx.Target ($key -replace "/", "\")
            if (-not (Test-Path -LiteralPath $path)) { continue }
            $hash = Get-FileSha256 -Path $path
            if ($hash -eq $Ctx.Old.files[$key]) {
                if ($Cmdlet.ShouldProcess($path, "Remove file no longer shipped by the kit")) {
                    Remove-Item -LiteralPath $path -Force
                }
                Write-Host "REMOVE stale $key"
                $staleRemoved++
            }
            else {
                Write-Warning "Stale kit file was locally modified and left in place: $key"
                $staleKept++
            }
        }
    }

    if ($Cmdlet.ShouldProcess($Ctx.ManifestPath, "Write kit manifest")) {
        Write-KitManifest -Path $Ctx.ManifestPath -Files $Ctx.New
    }

    $parts = @("copied $($Ctx.Copied)")
    if ($Ctx.Refreshed) { $parts += "updated $($Ctx.Refreshed)" }
    if ($Ctx.Current) { $parts += "already current $($Ctx.Current)" }
    if ($Ctx.Skipped) { $parts += "skipped $($Ctx.Skipped)" }
    if ($Ctx.Preserved) { $parts += "locally modified kept $($Ctx.Preserved)" }
    if ($staleRemoved) { $parts += "stale removed $staleRemoved" }
    if ($staleKept) { $parts += "stale kept $staleKept" }
    Write-Host ("Summary: " + ($parts -join ", ") + " (kit " + (Get-KitVersion) + ")")

    if ($Ctx.Skipped -gt 0 -and -not $Ctx.Update -and -not $Ctx.Force) {
        Write-Warning "$($Ctx.Skipped) existing files were skipped. Run with -Update to refresh unmodified kit files, or -Force to overwrite everything."
    }
}
