[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [switch] $InstallAgentsMd,
    [switch] $InstallSkills,
    [switch] $InstallWslSkills,
    [string] $WslCodexHome,
    [switch] $Force,
    [switch] $Update
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "kit-common.ps1")

$globalRoot = Join-Path $script:KitRoot "global"

if ($env:CODEX_HOME) {
    if (-not [System.IO.Path]::IsPathRooted($env:CODEX_HOME)) {
        Write-Error "CODEX_HOME must be an absolute path, got: $($env:CODEX_HOME)"
        exit 1
    }
    $codexHome = $env:CODEX_HOME
}
else {
    $codexHome = Join-Path $HOME ".codex"
}

New-Item -ItemType Directory -Force -Path $codexHome | Out-Null
$ctx = New-InstallContext -TargetRoot $codexHome -ManifestPath (Join-Path $codexHome "kit-manifest.json") -Force:$Force -Update:$Update

Install-KitFile -Ctx $ctx -Source (Join-Path $globalRoot "unity-codex.config.toml") -RelDest "unity-codex.config.toml" -Cmdlet $PSCmdlet
Install-KitTree -Ctx $ctx -SourceDir (Join-Path $globalRoot "agents") -RelDestPrefix "agents" -Cmdlet $PSCmdlet
Install-KitTree -Ctx $ctx -SourceDir (Join-Path $globalRoot "rules") -RelDestPrefix "rules" -Cmdlet $PSCmdlet

if ($InstallAgentsMd) {
    $agentsDest = Join-Path $codexHome "AGENTS.md"
    if (Test-Path -LiteralPath $agentsDest) {
        $existingHash = Get-FileSha256 -Path $agentsDest
        $incomingHash = Get-FileSha256 -Path (Join-Path $globalRoot "AGENTS.md")
        if ($existingHash -ne $incomingHash) {
            $backup = Join-Path $codexHome ("AGENTS.md.bak-" + [DateTime]::Now.ToString("yyyyMMdd-HHmmss"))
            if ($PSCmdlet.ShouldProcess($backup, "Back up existing global AGENTS.md")) {
                Copy-Item -LiteralPath $agentsDest -Destination $backup -Force
            }
            Write-Host "BACKUP existing AGENTS.md -> $backup"
        }
    }
    Install-KitFile -Ctx $ctx -Source (Join-Path $globalRoot "AGENTS.md") -RelDest "AGENTS.md" -Cmdlet $PSCmdlet
}
else {
    Install-KitFile -Ctx $ctx -Source (Join-Path $globalRoot "AGENTS.md") -RelDest "AGENTS.unity-template.md" -Cmdlet $PSCmdlet
    Write-Host "NOTE: AGENTS.unity-template.md is INERT - Codex only reads $codexHome\AGENTS.md."
    Write-Host "NOTE: Re-run with -InstallAgentsMd to activate it (your existing AGENTS.md is backed up first)."
}

if ($InstallSkills) {
    $allSkills = $script:UnitySkills + $script:BackendSkills + $script:SharedSkills
    foreach ($name in $allSkills) {
        if (-not (Test-Path -LiteralPath (Join-Path $script:PluginSkillsRoot $name))) {
            Write-Error "Bundled skill missing from kit: $name"
            exit 1
        }
    }
    # CODEX_HOME/skills is manifest-tracked; ~/.agents/skills (the documented user-scope
    # location) lives outside CODEX_HOME, so it gets a plain copy with the same semantics.
    foreach ($name in $allSkills) {
        Install-KitTree -Ctx $ctx -SourceDir (Join-Path $script:PluginSkillsRoot $name) -RelDestPrefix (Join-Path "skills" $name) -Cmdlet $PSCmdlet
    }
    $agentsSkillsHome = Join-Path $HOME ".agents\skills"
    foreach ($name in $allSkills) {
        $dest = Join-Path $agentsSkillsHome $name
        if ((Test-Path -LiteralPath $dest) -and -not $Force -and -not $Update) {
            Write-Host "SKIP existing $dest"
            continue
        }
        if ($PSCmdlet.ShouldProcess($dest, "Copy skill")) {
            New-Item -ItemType Directory -Force -Path $dest | Out-Null
            Copy-Item -Path (Join-Path (Join-Path $script:PluginSkillsRoot $name) "*") -Destination $dest -Recurse -Force
        }
        Write-Host "COPY $dest"
    }
    Write-Host "Skills installed to $agentsSkillsHome and $(Join-Path $codexHome 'skills')"
}

function ConvertTo-WslPath {
    param([Parameter(Mandatory = $true)] [string] $WindowsPath)
    $resolvedPath = (Resolve-Path -LiteralPath $WindowsPath).Path
    if ($resolvedPath -match "^([A-Za-z]):\\(.*)$") {
        $drive = $matches[1].ToLowerInvariant()
        $tail = $matches[2] -replace "\\", "/"
        return "/mnt/$drive/$tail"
    }
    $converted = & wsl.exe wslpath -a -u $resolvedPath
    if ($LASTEXITCODE -ne 0 -or -not $converted) {
        throw "Could not convert path to WSL path: $WindowsPath"
    }
    return ([string]::Join("", @($converted))).Trim()
}

function ConvertTo-ShSingleQuotedValue {
    param([Parameter(Mandatory = $true)] [string] $Value)
    return $Value -replace "'", "'\''"
}

if ($InstallWslSkills) {
    if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
        Write-Error "wsl.exe was not found. Install WSL or run without -InstallWslSkills."
        exit 1
    }

    if (-not $WslCodexHome) {
        # Single-quoted PowerShell string keeps $HOME literal for the WSL shell on both PS 5.1 and 7.
        $homeResult = & wsl.exe sh -lc 'printf %s "$HOME"'
        $homeText = ([string]::Join("", @($homeResult))).Trim()
        if ($LASTEXITCODE -ne 0 -or -not $homeText) {
            throw "Could not determine WSL home. Pass -WslCodexHome explicitly."
        }
        $WslCodexHome = "$homeText/.codex"
    }

    $wslSkillsSrc = ConvertTo-WslPath -WindowsPath $script:PluginSkillsRoot
    $wslGlobalSrc = ConvertTo-WslPath -WindowsPath $globalRoot
    $wslHomeRoot = ($WslCodexHome.TrimEnd("/")) -replace "/\.codex$", ""
    $forceValue = if ($Force -or $Update) { "1" } else { "0" }

    $script = @'
set -e
skills_src='__SKILLS_SRC__'
global_src='__GLOBAL_SRC__'
codex_home='__CODEX_HOME__'
home_root='__HOME_ROOT__'
force='__FORCE__'
copy_skill_set() {
  dest_root="$1"
  mkdir -p "$dest_root"
  for skill in "$skills_src"/*; do
    [ -d "$skill" ] || continue
    name="$(basename "$skill")"
    target="$dest_root/$name"
    if [ -e "$target" ] && [ "$force" != "1" ]; then
      echo "SKIP existing $target"
      continue
    fi
    mkdir -p "$target"
    cp -R "$skill"/. "$target"/
    echo "COPY $target"
  done
}
copy_skill_set "$home_root/.agents/skills"
copy_skill_set "$codex_home/skills"
mkdir -p "$codex_home/agents" "$codex_home/rules"
cp "$global_src/unity-codex.config.toml" "$codex_home/unity-codex.config.toml"
cp "$global_src"/agents/*.toml "$codex_home/agents/"
cp "$global_src"/rules/*.rules "$codex_home/rules/"
echo "COPY $codex_home/unity-codex.config.toml (+agents, +rules)"
'@

    $script = $script.Replace("__SKILLS_SRC__", (ConvertTo-ShSingleQuotedValue -Value $wslSkillsSrc))
    $script = $script.Replace("__GLOBAL_SRC__", (ConvertTo-ShSingleQuotedValue -Value $wslGlobalSrc))
    $script = $script.Replace("__CODEX_HOME__", (ConvertTo-ShSingleQuotedValue -Value $WslCodexHome))
    $script = $script.Replace("__HOME_ROOT__", (ConvertTo-ShSingleQuotedValue -Value $wslHomeRoot))
    $script = $script.Replace("__FORCE__", $forceValue)
    $script = $script -replace "`r", ""

    $tempScript = Join-Path $env:TEMP ("codex-install-wsl-" + [Guid]::NewGuid().ToString("N") + ".sh")
    try {
        $utf8NoBom = New-Object System.Text.UTF8Encoding $false
        [System.IO.File]::WriteAllText($tempScript, $script, $utf8NoBom)
        $wslScriptPath = ConvertTo-WslPath -WindowsPath $tempScript
        if ($PSCmdlet.ShouldProcess($WslCodexHome, "Install kit profile into WSL")) {
            & wsl.exe sh $wslScriptPath
            if ($LASTEXITCODE -ne 0) {
                throw "WSL installation failed with exit code $LASTEXITCODE."
            }
        }
    }
    finally {
        if (Test-Path -LiteralPath $tempScript) {
            Remove-Item -LiteralPath $tempScript -Force
        }
    }
    Write-Host "WSL profile installed under $WslCodexHome (skills also in $wslHomeRoot/.agents/skills)"
}

Complete-KitInstall -Ctx $ctx -Cmdlet $PSCmdlet
Write-Host "Global Unity Codex profile installed under $codexHome"
Write-Host "Run Codex with: codex --profile unity-codex"
