# Environment health check for the Codex Unity Agent Kit.
[CmdletBinding()]
param(
    [string] $TargetProject
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "kit-common.ps1")

$failed = $false

function Say {
    param([string] $Level, [string] $Message, [string] $Fix = "")
    Write-Host "$Level $Message"
    if ($Fix) { Write-Host "     fix: $Fix" }
    if ($Level -eq "FAIL") { $script:failed = $true }
}

# Tooling.
if (Get-Command git -ErrorAction SilentlyContinue) { Say "PASS" "git available" }
else { Say "FAIL" "git not found" "install Git for Windows and ensure it is on PATH" }

if (Get-Command gh -ErrorAction SilentlyContinue) {
    Invoke-KitNativeQuiet { gh auth status } | Out-Null
    if ($LASTEXITCODE -eq 0) { Say "PASS" "gh authenticated" }
    else { Say "WARN" "gh present but not authenticated (create-mr will be blocked)" "gh auth login" }
}
else { Say "WARN" "gh (GitHub CLI) not found - create-mr cannot open PRs" "winget install GitHub.cli" }

if (Get-Command dotnet -ErrorAction SilentlyContinue) {
    $sdk = Invoke-KitNativeQuiet { dotnet --version }
    Say "PASS" "dotnet SDK $sdk"
}
else { Say "WARN" "dotnet SDK not found - backend validation unavailable" "winget install Microsoft.DotNet.SDK.8" }

if ($env:UNITY_EDITOR) {
    if (Test-Path -LiteralPath $env:UNITY_EDITOR) { Say "PASS" "UNITY_EDITOR set: $($env:UNITY_EDITOR)" }
    else { Say "WARN" "UNITY_EDITOR points to a missing file: $($env:UNITY_EDITOR)" "set UNITY_EDITOR to the Unity.exe of the project's editor version" }
}
else {
    Say "WARN" "UNITY_EDITOR not set - batchmode validation needs it" "`$env:UNITY_EDITOR = 'C:\Program Files\Unity\Hub\Editor\<version>\Editor\Unity.exe'"
}

if (Get-Command wsl.exe -ErrorAction SilentlyContinue) {
    Say "PASS" "WSL present (use install-global-profile.ps1 -InstallWslSkills for the WSL Codex home)"
}

# Target project checks.
if ($TargetProject) {
    if (-not (Test-Path -LiteralPath $TargetProject)) {
        Say "FAIL" "target project not found: $TargetProject"
    }
    else {
        $target = (Resolve-Path -LiteralPath $TargetProject).Path

        $manifest = Read-KitManifest -Path (Join-Path $target ".agents\kit-manifest.json")
        if ($manifest) {
            $kitVersion = Get-KitVersion
            if ($manifest.kitVersion -eq $kitVersion) { Say "PASS" "kit install is current ($kitVersion)" }
            else { Say "WARN" "kit install is $($manifest.kitVersion), kit source is $kitVersion" "re-run the project installer with -Update" }

            # Layer drift: compare every manifest-tracked file against disk.
            $driftMissing = 0
            $driftModified = 0
            foreach ($key in $manifest.files.Keys) {
                $path = Join-Path $target ($key -replace "/", "\")
                if (-not (Test-Path -LiteralPath $path)) { $driftMissing++ }
                elseif ((Get-FileSha256 -Path $path) -ne $manifest.files[$key]) { $driftModified++ }
            }
            if ($driftMissing -eq 0 -and $driftModified -eq 0) {
                Say "PASS" "all $($manifest.files.Count) manifest-tracked kit files present and unmodified"
            }
            else {
                Say "WARN" "kit files drifted from the manifest: $driftModified modified, $driftMissing missing" "re-run the project installer with -Update (local edits are preserved)"
            }
        }

        # Platform layer sync: Codex reads .agents/skills, Claude Code reads .claude/skills.
        $agentsSkills = Join-Path $target ".agents\skills"
        $claudeSkills = Join-Path $target ".claude\skills"
        if ((Test-Path -LiteralPath $agentsSkills) -and (Test-Path -LiteralPath $claudeSkills)) {
            $a = @(Get-ChildItem -LiteralPath $agentsSkills -Directory | ForEach-Object { $_.Name }) | Sort-Object
            $c = @(Get-ChildItem -LiteralPath $claudeSkills -Directory | ForEach-Object { $_.Name }) | Sort-Object
            if (($a -join ",") -eq ($c -join ",")) { Say "PASS" "Codex and Claude skill layers are in sync ($($a.Count) skills)" }
            else { Say "WARN" "Codex (.agents/skills) and Claude (.claude/skills) skill sets differ" "re-run the project installer with -Update" }
        }
        elseif (Test-Path -LiteralPath $agentsSkills) {
            Say "WARN" "Claude Code layer missing (.claude/skills not found)" "re-run the project installer with -Update to render both platform layers"
        }
        elseif ($manifest) {
            Say "WARN" "kit manifest exists but .agents/skills is missing" "re-run the project installer with -Update"
        }
        else {
            Say "WARN" "kit not installed in target (no manifest, no .agents/skills)" "run scripts\install-unity-project-template.ps1 or install-csharp-aspnet-project-template.ps1"
        }

        $versionFile = Join-Path $target "ProjectSettings\ProjectVersion.txt"
        if (Test-Path -LiteralPath $versionFile) {
            $line = (Get-Content -LiteralPath $versionFile | Select-Object -First 1)
            if ($line -match "m_EditorVersion:\s*(\S+)") {
                $unityVersion = $matches[1]
                $hubPath = "C:\Program Files\Unity\Hub\Editor\$unityVersion\Editor\Unity.exe"
                if (Test-Path -LiteralPath $hubPath) { Say "PASS" "Unity $unityVersion installed (Hub)" }
                else { Say "WARN" "Unity $unityVersion not found under the default Hub path" "install it via Unity Hub, or set UNITY_EDITOR manually" }
            }

            if (Get-Command git -ErrorAction SilentlyContinue) {
                Invoke-KitNativeQuiet { git -C $target config merge.unityyamlmerge.driver } | Out-Null
                if ($LASTEXITCODE -eq 0) { Say "PASS" "UnityYAMLMerge merge driver configured" }
                else { Say "WARN" "UnityYAMLMerge merge driver not configured - scene/prefab conflicts will be manual" "see `$unity-merge skill (references/unityyamlmerge-setup.md)" }
            }
        }

        $globalJson = Join-Path $target "global.json"
        if ((Test-Path -LiteralPath $globalJson) -and (Get-Command dotnet -ErrorAction SilentlyContinue)) {
            try {
                $wanted = (Get-Content -LiteralPath $globalJson -Raw | ConvertFrom-Json).sdk.version
                $actual = Invoke-KitNativeQuiet { dotnet --version }
                if ($wanted -and $actual -and -not $actual.StartsWith(($wanted -split "\.")[0])) {
                    Say "WARN" "dotnet SDK $actual does not match global.json ($wanted)" "install the pinned SDK: winget install Microsoft.DotNet.SDK.$(($wanted -split '\.')[0])"
                }
                else { Say "PASS" "dotnet SDK compatible with global.json" }
            }
            catch { Say "WARN" "global.json present but unreadable: $($_.Exception.Message)" }
        }
    }
}

Write-Host ""
if ($failed) { Write-Host "doctor: problems found"; exit 1 }
Write-Host "doctor: environment usable (WARNs above are optional improvements)"
exit 0
