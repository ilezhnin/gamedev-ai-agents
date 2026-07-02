# Unity .meta / GUID hygiene check. Installed into Unity projects at .agents/scripts/.
# Quick mode (default) checks only files touched per git status; -Full scans all of Assets/.
[CmdletBinding()]
param(
    [Alias("TargetProject")]
    [string] $ProjectRoot = ".",
    [switch] $Full
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path -LiteralPath $ProjectRoot).Path
$assetsRoot = Join-Path $root "Assets"
if (-not (Test-Path -LiteralPath $assetsRoot)) {
    Write-Error "No Assets/ folder under $root - not a Unity project root."
    exit 1
}

$issues = 0

function Get-GitStatus {
    param([string] $Root)
    # PS 5.1 turns native stderr into error records under EAP=Stop; keep git quiet.
    # core.quotepath=off keeps non-ASCII paths raw instead of octal-escaped, so
    # Test-Path can actually find them.
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $out = & git -C $Root -c core.quotepath=off status --porcelain 2>$null
        if ($LASTEXITCODE -ne 0) { return $null }
        return $out
    }
    finally {
        $ErrorActionPreference = $prev
    }
}

function Get-StatusPath {
    # Extracts the current path from one porcelain line; renames report "old -> new".
    param([string] $Line)
    $rel = $Line.Substring(3)
    $arrow = $rel.IndexOf(" -> ")
    if ($arrow -ge 0) { $rel = $rel.Substring($arrow + 4) }
    return $rel.Trim('"')
}

function Test-NeedsMeta {
    param([string] $Path)
    $name = Split-Path -Leaf $Path
    # Unity ignores hidden files/folders, dot-prefixed, tilde-suffixed, and .meta itself.
    if ($name.StartsWith(".")) { return $false }
    if ($name.EndsWith("~")) { return $false }
    if ($name.EndsWith(".meta")) { return $false }
    # Anything inside a hidden/ignored ancestor is also ignored.
    $relative = $Path.Substring($assetsRoot.Length).TrimStart("\", "/")
    foreach ($segment in ($relative -split "[\\/]")) {
        if ($segment.StartsWith(".") -or $segment.EndsWith("~")) { return $false }
    }
    return $true
}

function Test-MetaPair {
    param([string] $Path)
    if ($Path.EndsWith(".meta")) {
        $asset = $Path.Substring(0, $Path.Length - 5)
        if (-not (Test-Path -LiteralPath $asset)) {
            Write-Host "ORPHAN META: $($Path.Substring($root.Length + 1)) has no matching asset"
            $script:issues++
        }
    }
    elseif (Test-NeedsMeta -Path $Path) {
        $meta = $Path + ".meta"
        if (-not (Test-Path -LiteralPath $meta)) {
            Write-Host "MISSING META: $($Path.Substring($root.Length + 1))"
            $script:issues++
        }
    }
}

if ($Full) {
    foreach ($item in Get-ChildItem -LiteralPath $assetsRoot -Recurse -Force) {
        Test-MetaPair -Path $item.FullName
    }

    # Duplicate GUID scan (Full mode only - it reads every .meta).
    $guidMap = @{}
    foreach ($meta in Get-ChildItem -LiteralPath $assetsRoot -Recurse -Filter "*.meta" -File) {
        $guidLine = Select-String -LiteralPath $meta.FullName -Pattern "^guid:\s*([0-9a-f]{32})" | Select-Object -First 1
        if ($guidLine) {
            $guid = $guidLine.Matches[0].Groups[1].Value
            if ($guidMap.ContainsKey($guid)) {
                Write-Host "DUPLICATE GUID: $guid in $($meta.FullName.Substring($root.Length + 1)) and $($guidMap[$guid])"
                $script:issues++
            }
            else {
                $guidMap[$guid] = $meta.FullName.Substring($root.Length + 1)
            }
        }
    }
}
else {
    $status = Get-GitStatus -Root $root
    if ($status) {
        foreach ($line in $status) {
            if ($line.Substring(0, 2).Contains("D")) { continue }
            $rel = Get-StatusPath -Line $line
            if (-not ($rel -replace "/", "\").StartsWith("Assets\")) { continue }
            $full = Join-Path $root ($rel -replace "/", "\")
            if (-not (Test-Path -LiteralPath $full)) { continue }
            # Untracked directories appear as a single "?? dir/" line; check contents.
            if (Test-Path -LiteralPath $full -PathType Container) {
                Test-MetaPair -Path (Get-Item -LiteralPath $full).FullName
                foreach ($item in Get-ChildItem -LiteralPath $full -Recurse -Force) {
                    Test-MetaPair -Path $item.FullName
                }
            }
            else {
                Test-MetaPair -Path $full
            }
        }
    }
}

# Pending changes must never touch Unity's generated folders.
$status = Get-GitStatus -Root $root
if ($status) {
    # obj/ is handled by the anywhere-in-tree check below.
    $forbidden = @("Library/", "Temp/", "Logs/", "UserSettings/", "Build/", "Builds/")
    foreach ($line in $status) {
        $rel = Get-StatusPath -Line $line
        foreach ($prefix in $forbidden) {
            if ($rel.StartsWith($prefix)) {
                Write-Host "FORBIDDEN PATH IN DIFF: $rel"
                $script:issues++
                break
            }
        }
        # Compiler artifact folders are forbidden anywhere in the tree, not only
        # at the root (embedded packages and nested csproj builds generate them).
        if ($rel -match "(^|/)obj/") {
            Write-Host "FORBIDDEN PATH IN DIFF: $rel"
            $script:issues++
        }
    }
}

if ($issues -eq 0) {
    Write-Host "check-unity-meta: clean"
    exit 0
}
Write-Host "check-unity-meta: $issues issue(s) found"
exit 1
