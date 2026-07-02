# Shared helpers for Codex Unity Agent Kit scripts. Dot-source from sibling scripts.
# Compatible with Windows PowerShell 5.1 and pwsh 7. ASCII only.

$script:KitRoot = Split-Path -Parent $PSScriptRoot
$script:PluginSkillsRoot = Join-Path $script:KitRoot "plugins\codex-unity-agent-kit\skills"

$script:SharedSkills = @("planning", "crossworking", "arch-audit", "create-mr", "grill-me", "learn")
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
    # ShouldProcess is delegated to the calling script's $PSCmdlet via -Cmdlet.
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSShouldProcess", "")]
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
        [string] $RelSkillsRoot = ".agents\skills",
        # Mirror each skill into .claude/skills so Claude Code discovers them natively.
        [switch] $MirrorClaude
    )
    foreach ($name in $SkillNames) {
        $source = Join-Path $script:PluginSkillsRoot $name
        if (-not (Test-Path -LiteralPath $source)) {
            Write-Error "Bundled skill missing from kit: $name (expected at $source)"
            exit 1
        }
        Install-KitTree -Ctx $Ctx -SourceDir $source -RelDestPrefix (Join-Path $RelSkillsRoot $name) -Cmdlet $Cmdlet
        if ($MirrorClaude) {
            Install-KitTree -Ctx $Ctx -SourceDir $source -RelDestPrefix (Join-Path ".claude\skills" $name) -Cmdlet $Cmdlet
        }
    }
}

# --- Canon loading and platform renderers -----------------------------------
# The canon (global/canon/*.json) is the single source of truth; .codex/ and
# .claude/ adapters are rendered from it at install time and never hand-edited.

function Get-KitCanon {
    param([Parameter(Mandatory = $true)] [ValidateSet("roles", "permissions", "hooks")] [string] $Name)
    $path = Join-Path $script:KitRoot "global\canon\$Name.json"
    return Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
}

function ConvertTo-CodexAgentToml {
    param([Parameter(Mandatory = $true)] $Role)
    $lines = @()
    $lines += "name = `"$($Role.name)`""
    $lines += "description = `"$($Role.description)`""
    if ($Role.readonly) { $lines += 'sandbox_mode = "read-only"' }
    $lines += "model_reasoning_effort = `"$($Role.reasoning)`""
    $lines += 'developer_instructions = """'
    foreach ($instruction in $Role.instructions) { $lines += $instruction }
    $lines += '"""'
    $nicknames = ($Role.nicknames | ForEach-Object { '"' + $_ + '"' }) -join ", "
    $lines += "nickname_candidates = [$nicknames]"
    return ($lines -join "`n") + "`n"
}

function ConvertTo-ClaudeAgentMd {
    param([Parameter(Mandatory = $true)] $Role)
    # Quote the description: unquoted colons are invalid YAML scalars.
    $escapedDescription = $Role.description -replace '"', '\"'
    $lines = @("---", "name: $($Role.name)", "description: `"$escapedDescription`"")
    if ($Role.readonly) { $lines += "tools: Read, Grep, Glob" }
    $lines += "---", ""
    foreach ($instruction in $Role.instructions) { $lines += $instruction }
    return ($lines -join "`n") + "`n"
}

function ConvertTo-CodexRules {
    param([Parameter(Mandatory = $true)] $Permissions)
    $lines = @("# Rendered from global/canon/permissions.json - do not edit by hand.", "")
    foreach ($rule in $Permissions.rules) {
        $pattern = ($rule.pattern | ForEach-Object { '"' + $_ + '"' }) -join ", "
        $examples = ($rule.examples | ForEach-Object { '"' + $_ + '"' }) -join ", "
        $lines += "prefix_rule("
        $lines += "    pattern = [$pattern],"
        $lines += "    decision = `"$($rule.decision)`","
        $lines += "    justification = `"$($rule.justification)`","
        $lines += "    match = [$examples],"
        $lines += ")"
        $lines += ""
    }
    return ($lines -join "`n")
}

function ConvertTo-CodexHooksJson {
    param([Parameter(Mandatory = $true)] $Hooks, [Parameter(Mandatory = $true)] [string] $Stack)
    $events = [ordered]@{}
    foreach ($hook in $Hooks.hooks) {
        if (-not ($hook.stacks -contains $Stack)) { continue }
        if (-not $events.Contains($hook.event)) { $events[$hook.event] = @() }
        $events[$hook.event] += , ([ordered]@{
                matcher = $hook.codexMatcher
                hooks   = @([ordered]@{ type = "command"; command = $hook.commandPwsh; commandWindows = $hook.command })
            })
    }
    if ($events.Count -eq 0) { return $null }
    return ([ordered]@{ hooks = $events } | ConvertTo-Json -Depth 10) + "`n"
}

function ConvertTo-ClaudeSettingsJson {
    param(
        [Parameter(Mandatory = $true)] $Permissions,
        [Parameter(Mandatory = $true)] $Hooks,
        [Parameter(Mandatory = $true)] [string] $Stack
    )
    $allow = @()
    $deny = @()
    foreach ($rule in $Permissions.rules) {
        $entry = "Bash(" + ($rule.pattern -join " ") + ":*)"
        if ($rule.decision -eq "allow") { $allow += $entry }
        elseif ($rule.decision -eq "forbidden") { $deny += $entry }
    }
    $settings = [ordered]@{ permissions = [ordered]@{ allow = $allow; deny = $deny } }
    $events = [ordered]@{}
    foreach ($hook in $Hooks.hooks) {
        if (-not ($hook.stacks -contains $Stack)) { continue }
        if (-not $events.Contains($hook.event)) { $events[$hook.event] = @() }
        $events[$hook.event] += , ([ordered]@{
                matcher = $hook.claudeMatcher
                hooks   = @([ordered]@{ type = "command"; command = $hook.command })
            })
    }
    if ($events.Count -gt 0) { $settings["hooks"] = $events }
    return ($settings | ConvertTo-Json -Depth 10) + "`n"
}

function ConvertTo-AntigravityRolesRule {
    # Antigravity has no static subagent format; personas are delivered as a rules file
    # for its dynamic orchestration (official codelab pattern).
    param([Parameter(Mandatory = $true)] $Roles)
    $lines = @("---", "trigger: model_decision", "description: Agent role definitions for delegated and multi-agent work (crossworking team shape)", "---", "")
    $lines += "# Agent Roles (rendered from kit canon)"
    $lines += ""
    $lines += "When orchestrating subagents or adopting a persona for a delegated task, use these role contracts. Prefer the most specialized role for each job; broader-profile roles (planner, oracle, researcher) coordinate and never write production code."
    foreach ($role in $Roles) {
        $lines += ""
        $lines += "## $($role.name)"
        $lines += ""
        $lines += $role.description
        if ($role.readonly) { $lines += "Read-only role: inspects and reports, never edits files." }
        $lines += ""
        foreach ($instruction in $role.instructions) { $lines += "- $instruction" }
    }
    return ($lines -join "`n") + "`n"
}

function ConvertTo-AntigravityPermissionsRule {
    param([Parameter(Mandatory = $true)] $Permissions)
    $lines = @("---", "trigger: always_on", "---", "")
    $lines += "# Command Permissions (rendered from kit canon)"
    $lines += ""
    foreach ($rule in $Permissions.rules) {
        $prefix = $rule.pattern -join " "
        if ($rule.decision -eq "allow") {
            $lines += "- Safe without asking: ``$prefix`` - $($rule.justification)"
        }
        elseif ($rule.decision -eq "forbidden") {
            $lines += "- Forbidden without an explicit user request: ``$prefix`` - $($rule.justification)"
        }
        else {
            $lines += "- Ask before running: ``$prefix`` - $($rule.justification)"
        }
    }
    $lines += ""
    $lines += "Antigravity's IDE terminal Allow/Deny lists are GUI-only; mirror these entries there manually when configuring the workspace."
    return ($lines -join "`n") + "`n"
}

function ConvertTo-AntigravityAutomationRule {
    # Hooks are behavioral here: Antigravity's file hook protocol is CLI-verified but
    # IDE-uncertain, so the kit delivers the same automation as an always-on rule.
    param([Parameter(Mandatory = $true)] $Hooks, [Parameter(Mandatory = $true)] [string] $Stack)
    $matched = @($Hooks.hooks | Where-Object { $_.stacks -contains $Stack })
    if ($matched.Count -eq 0) { return $null }
    $lines = @("---", "trigger: always_on", "---", "")
    $lines += "# Post-Edit Automation (rendered from kit canon)"
    foreach ($hook in $matched) {
        $lines += ""
        $lines += "After creating, editing, moving, or deleting project files in this task, run:"
        $lines += ""
        $lines += '```'
        $lines += $hook.command
        $lines += '```'
        $lines += ""
        $lines += "Fix every reported issue before finishing the task. Do not skip this check."
    }
    return ($lines -join "`n") + "`n"
}

function Install-KitRendered {
    # Routes rendered string content through the same manifest/update semantics as file copies.
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSShouldProcess", "")]
    param(
        [Parameter(Mandatory = $true)] [hashtable] $Ctx,
        [Parameter(Mandatory = $true)] [string] $Content,
        [Parameter(Mandatory = $true)] [string] $RelDest,
        [Parameter(Mandatory = $true)] $Cmdlet
    )
    $temp = Join-Path ([System.IO.Path]::GetTempPath()) ("kit-render-" + [Guid]::NewGuid().ToString("N"))
    try {
        [System.IO.File]::WriteAllText($temp, $Content, (New-Object System.Text.UTF8Encoding $false))
        Install-KitFile -Ctx $Ctx -Source $temp -RelDest $RelDest -Cmdlet $Cmdlet
    }
    finally {
        Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
    }
}

function Install-KitPlatformAdapters {
    # Renders the Codex and Claude Code adapter layers for one stack from the canon.
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSShouldProcess", "")]
    param(
        [Parameter(Mandatory = $true)] [hashtable] $Ctx,
        [Parameter(Mandatory = $true)] [ValidateSet("unity", "backend")] [string] $Stack,
        [Parameter(Mandatory = $true)] $Cmdlet
    )
    $roles = (Get-KitCanon -Name "roles").roles | Where-Object { $_.stack -eq $Stack -or $_.stack -eq "shared" }
    $permissions = Get-KitCanon -Name "permissions"
    $hooks = Get-KitCanon -Name "hooks"

    foreach ($role in $roles) {
        Install-KitRendered -Ctx $Ctx -Content (ConvertTo-CodexAgentToml -Role $role) -RelDest ".codex\agents\$($role.name).toml" -Cmdlet $Cmdlet
        Install-KitRendered -Ctx $Ctx -Content (ConvertTo-ClaudeAgentMd -Role $role) -RelDest ".claude\agents\$($role.name).md" -Cmdlet $Cmdlet
    }

    Install-KitRendered -Ctx $Ctx -Content (ConvertTo-CodexRules -Permissions $permissions) -RelDest ".codex\rules\default.rules" -Cmdlet $Cmdlet
    Install-KitRendered -Ctx $Ctx -Content (ConvertTo-ClaudeSettingsJson -Permissions $permissions -Hooks $hooks -Stack $Stack) -RelDest ".claude\settings.json" -Cmdlet $Cmdlet

    $codexHooks = ConvertTo-CodexHooksJson -Hooks $hooks -Stack $Stack
    if ($codexHooks) {
        Install-KitRendered -Ctx $Ctx -Content $codexHooks -RelDest ".codex\hooks.json" -Cmdlet $Cmdlet
    }

    # Antigravity layer: AGENTS.md and .agents/skills are read natively (no adapter
    # needed); roles, permissions, and automation are delivered as rules files.
    Install-KitRendered -Ctx $Ctx -Content (ConvertTo-AntigravityRolesRule -Roles $roles) -RelDest ".agents\rules\kit-agent-roles.md" -Cmdlet $Cmdlet
    Install-KitRendered -Ctx $Ctx -Content (ConvertTo-AntigravityPermissionsRule -Permissions $permissions) -RelDest ".agents\rules\kit-permissions.md" -Cmdlet $Cmdlet
    $agAutomation = ConvertTo-AntigravityAutomationRule -Hooks $hooks -Stack $Stack
    if ($agAutomation) {
        Install-KitRendered -Ctx $Ctx -Content $agAutomation -RelDest ".agents\rules\kit-automation.md" -Cmdlet $Cmdlet
    }
}

function Complete-KitInstall {
    # ShouldProcess is delegated to the calling script's $PSCmdlet via -Cmdlet.
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSShouldProcess", "")]
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
