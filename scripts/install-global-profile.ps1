[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [switch] $InstallAgentsMd,
    [switch] $InstallSkills,
    [switch] $InstallClaude,
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
        Stop-KitWithError "CODEX_HOME must be an absolute path, got: $($env:CODEX_HOME)"
    }
    $codexHome = $env:CODEX_HOME
}
else {
    $codexHome = Join-Path $HOME ".codex"
}

if ($PSCmdlet.ShouldProcess($codexHome, "Ensure directory exists")) {
    New-Item -ItemType Directory -Force -Path $codexHome | Out-Null
}
$ctx = New-InstallContext -TargetRoot $codexHome -ManifestPath (Join-Path $codexHome "kit-manifest.json") -Force:$Force -Update:$Update

Install-KitFile -Ctx $ctx -Source (Join-Path $globalRoot "unity-codex.config.toml") -RelDest "unity-codex.config.toml" -Cmdlet $PSCmdlet

# Agent roles and permission rules are rendered from global/canon at install time.
$canonRoles = (Get-KitCanon -Name "roles").roles
foreach ($role in $canonRoles) {
    Install-KitRendered -Ctx $ctx -Content (ConvertTo-CodexAgentToml -Role $role) -RelDest (Join-Path "agents" "$($role.name).toml") -Cmdlet $PSCmdlet
}
Install-KitRendered -Ctx $ctx -Content (ConvertTo-CodexRules -Permissions (Get-KitCanon -Name "permissions")) -RelDest "rules\default.rules" -Cmdlet $PSCmdlet

if ($InstallAgentsMd) {
    $agentsSource = Join-Path $globalRoot "AGENTS.md"
    $agentsDest = Join-Path $codexHome "AGENTS.md"
    $differs = (Test-Path -LiteralPath $agentsDest) -and ((Get-FileSha256 -Path $agentsDest) -ne (Get-FileSha256 -Path $agentsSource))
    if ($differs) {
        # -InstallAgentsMd is an explicit activation request: back the existing
        # file up, then overwrite it even in plain mode. Without the overwrite the
        # SKIP branch would leave the old file active plus a junk backup.
        $backup = Join-Path $codexHome ("AGENTS.md.bak-" + [DateTime]::Now.ToString("yyyyMMdd-HHmmss"))
        if ($PSCmdlet.ShouldProcess($backup, "Back up existing global AGENTS.md")) {
            Copy-Item -LiteralPath $agentsDest -Destination $backup -Force
        }
        Write-Host "BACKUP existing AGENTS.md -> $backup"
        if ($PSCmdlet.ShouldProcess($agentsDest, "Activate kit AGENTS.md")) {
            Copy-Item -LiteralPath $agentsSource -Destination $agentsDest -Force
        }
        Write-Host "FORCE AGENTS.md"
        $ctx.New["AGENTS.md"] = Get-FileSha256 -Path $agentsSource
        $ctx.Refreshed++
    }
    else {
        Install-KitFile -Ctx $ctx -Source $agentsSource -RelDest "AGENTS.md" -Cmdlet $PSCmdlet
    }
}
else {
    Install-KitFile -Ctx $ctx -Source (Join-Path $globalRoot "AGENTS.md") -RelDest "AGENTS.unity-template.md" -Cmdlet $PSCmdlet
    Write-Host "NOTE: AGENTS.unity-template.md is INERT - Codex only reads $codexHome\AGENTS.md."
    Write-Host "NOTE: Re-run with -InstallAgentsMd to activate it (your existing AGENTS.md is backed up first)."
}

function New-SideInstallContext {
    # Side layers (~/.agents, ~/.claude) live outside CODEX_HOME and get their own
    # manifest so updates and uninstall honor the same hash semantics as projects.
    # First -Update after upgrading from a pre-manifest kit finds no side manifest;
    # refresh everything once (the old blind-copy behavior) and record the manifest,
    # so every later update recognizes local edits.
    param([Parameter(Mandatory = $true)] [string] $Root)
    $manifestPath = Join-Path $Root "kit-manifest.json"
    $bootstrapForce = $Update -and -not (Test-Path -LiteralPath $manifestPath)
    return New-InstallContext -TargetRoot $Root -ManifestPath $manifestPath -Force:($Force -or $bootstrapForce) -Update:($Update -and -not $bootstrapForce)
}

if ($InstallSkills) {
    $allSkills = $script:UnitySkills + $script:BackendSkills + $script:SharedSkills
    foreach ($name in $allSkills) {
        Install-KitTree -Ctx $ctx -SourceDir (Join-Path $script:PluginSkillsRoot $name) -RelDestPrefix (Join-Path "skills" $name) -Cmdlet $PSCmdlet
    }
    $agentsHome = Join-Path $HOME ".agents"
    $agentsCtx = New-SideInstallContext -Root $agentsHome
    Install-KitSkills -Ctx $agentsCtx -SkillNames $allSkills -Cmdlet $PSCmdlet -RelSkillsRoot "skills"
    Complete-KitInstall -Ctx $agentsCtx -Cmdlet $PSCmdlet
    Write-Host "Skills installed to $(Join-Path $agentsHome 'skills') and $(Join-Path $codexHome 'skills')"
}

if ($InstallClaude) {
    $claudeHome = Join-Path $HOME ".claude"
    $claudeCtx = New-SideInstallContext -Root $claudeHome
    $allSkills = $script:UnitySkills + $script:BackendSkills + $script:SharedSkills
    Install-KitSkills -Ctx $claudeCtx -SkillNames $allSkills -Cmdlet $PSCmdlet -RelSkillsRoot "skills"
    foreach ($role in (Get-KitCanon -Name "roles").roles) {
        Install-KitRendered -Ctx $claudeCtx -Content (ConvertTo-ClaudeAgentMd -Role $role) -RelDest (Join-Path "agents" "$($role.name).md") -Cmdlet $PSCmdlet
    }
    Complete-KitInstall -Ctx $claudeCtx -Cmdlet $PSCmdlet
    Write-Host "Claude Code layer installed under $claudeHome (skills + agents)."
    Write-Host "NOTE: point your ~/.claude/CLAUDE.md at the kit discipline manually if you want it global."
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
        Stop-KitWithError "wsl.exe was not found. Install WSL or run without -InstallWslSkills."
    }

    # wsl.exe emits UTF-16LE on redirected stdout; without this the captured home
    # path comes back NUL-interleaved and poisons every generated path.
    $env:WSL_UTF8 = "1"

    if (-not $WslCodexHome) {
        # Single-quoted PowerShell string keeps $HOME literal for the WSL shell on both PS 5.1 and 7.
        $homeResult = & wsl.exe sh -lc 'printf %s "$HOME"'
        $homeText = ([string]::Join("", @($homeResult))).Trim()
        if ($LASTEXITCODE -ne 0 -or -not $homeText) {
            throw "Could not determine WSL home. Pass -WslCodexHome explicitly."
        }
        $WslCodexHome = "$homeText/.codex"
    }

    # Stage the rendered profile so WSL copies canon-derived content, not stored files.
    $staging = Join-Path $env:TEMP ("codex-wsl-staging-" + [Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path (Join-Path $staging "agents"), (Join-Path $staging "rules") | Out-Null
    Copy-Item -LiteralPath (Join-Path $globalRoot "unity-codex.config.toml") -Destination (Join-Path $staging "unity-codex.config.toml")
    $utf8 = New-Object System.Text.UTF8Encoding $false
    foreach ($role in (Get-KitCanon -Name "roles").roles) {
        [System.IO.File]::WriteAllText((Join-Path (Join-Path $staging "agents") "$($role.name).toml"), (ConvertTo-CodexAgentToml -Role $role), $utf8)
    }
    [System.IO.File]::WriteAllText((Join-Path (Join-Path $staging "rules") "default.rules"), (ConvertTo-CodexRules -Permissions (Get-KitCanon -Name "permissions")), $utf8)

    $wslSkillsSrc = ConvertTo-WslPath -WindowsPath $script:PluginSkillsRoot
    $wslGlobalSrc = ConvertTo-WslPath -WindowsPath $staging
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
        if (Test-Path -LiteralPath $staging) {
            Remove-Item -LiteralPath $staging -Recurse -Force
        }
    }
    Write-Host "WSL profile installed under $WslCodexHome (skills also in $wslHomeRoot/.agents/skills)"
}

Complete-KitInstall -Ctx $ctx -Cmdlet $PSCmdlet
Write-Host "Global Unity Codex profile installed under $codexHome"
Write-Host "Run Codex with: codex --profile unity-codex"
