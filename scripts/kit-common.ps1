# Shared helpers for Codex Unity Agent Kit scripts. Dot-source from sibling scripts.
# Compatible with Windows PowerShell 5.1 and pwsh 7. ASCII only.

$script:KitRoot = Split-Path -Parent $PSScriptRoot
$script:PluginSkillsRoot = Join-Path $script:KitRoot "plugins\codex-unity-agent-kit\skills"

$script:SharedSkills = @("planning", "crossworking", "arch-audit", "create-mr", "grill-me", "learn")
$script:UnitySkills = @("unity-orient", "unity-implement", "unity-review", "unity-validate", "unity-debug", "unity-mcp", "unity-merge", "unity-build", "unity-upgrade", "unity-profile", "unity-tests", "gdd", "game-pipeline", "asset-pipeline")
$script:BackendSkills = @("backend-orient", "backend-implement", "backend-review", "backend-validate", "backend-debug", "backend-tests")

function Stop-KitWithError {
    param([Parameter(Mandatory = $true)] [string] $Message)
    Write-Host "ERROR: $Message" -ForegroundColor Red
    exit 1
}

function Invoke-KitNativeQuiet {
    # Runs a native command with stderr suppressed. Windows PowerShell 5.1 turns
    # redirected native stderr into terminating error records under EAP=Stop, so
    # the redirect has to happen with EAP temporarily relaxed.
    param([Parameter(Mandatory = $true)] [scriptblock] $Command)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try { return (& $Command 2>$null) }
    finally { $ErrorActionPreference = $prev }
}

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
        Stop-KitWithError "Target does not exist: $TargetProject"
    }
    $item = Get-Item -LiteralPath $TargetProject
    if (-not $item.PSIsContainer) {
        Stop-KitWithError "Target is a file, not a directory: $TargetProject"
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
    if ($Force -and $Update) {
        Stop-KitWithError "-Force and -Update are mutually exclusive: -Update refreshes unmodified kit files, -Force overwrites everything including local edits."
    }
    $old = Read-KitManifest -Path $ManifestPath
    if ($Update -and -not $old) {
        Stop-KitWithError "-Update requires a previous install (manifest not found at $ManifestPath). Run a plain install first."
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
            # Carry the previous kit hash forward: the local edit stays recognized
            # as a local edit, and reverting it back to the old kit content makes
            # the file updatable again.
            if ($null -ne $oldHash) { $Ctx.New[$key] = $oldHash }
            Write-Host "KEEP (locally modified) $key"
            $Ctx.Preserved++
        }
        return
    }

    # Plain install never touches an existing file, so the manifest must keep the
    # hash it already had. Recording the new payload hash for a file that was not
    # copied would make every future -Update misread it as locally modified.
    if ($Ctx.Old -and $Ctx.Old.files.ContainsKey($key)) { $Ctx.New[$key] = $Ctx.Old.files[$key] }
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
            Stop-KitWithError "Bundled skill missing from kit: $name (expected at $source)"
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
    $lines += "effort: $(ConvertTo-ClaudeEffort -Reasoning $Role.reasoning)"
    if ($Role.readonly) { $lines += "tools: Read, Grep, Glob" }
    $lines += "---", ""
    foreach ($instruction in $Role.instructions) { $lines += $instruction }
    return ($lines -join "`n") + "`n"
}

function ConvertTo-ClaudeEffort {
    param([Parameter(Mandatory = $true)] [string] $Reasoning)
    if ($Reasoning -eq "minimal") { return "low" }
    if ($Reasoning -eq "xhigh") { return "max" }
    return $Reasoning
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

function ConvertTo-KitJson {
    # Deterministic JSON writer: 2-space indent, LF newlines, insertion key order.
    # ConvertTo-Json formats differently across PowerShell editions (5.1 vs 7),
    # which made rendered payload bytes depend on the machine that rendered them;
    # every rendered JSON artifact must go through this writer instead.
    param($Value, [int] $Depth = 0)
    $pad = "  " * $Depth
    $childPad = "  " * ($Depth + 1)
    if ($Value -is [System.Collections.IDictionary]) {
        if ($Value.Count -eq 0) { return "{}" }
        $items = foreach ($key in $Value.Keys) {
            $childPad + '"' + $key + '": ' + (ConvertTo-KitJson -Value $Value[$key] -Depth ($Depth + 1))
        }
        return "{`n" + ($items -join ",`n") + "`n$pad}"
    }
    if ($Value -is [bool]) { if ($Value) { return "true" } else { return "false" } }
    if ($Value -is [string]) {
        $escaped = $Value.Replace("\", "\\").Replace('"', '\"').Replace("`r", "\r").Replace("`n", "\n").Replace("`t", "\t")
        return '"' + $escaped + '"'
    }
    if ($Value -is [System.Collections.IEnumerable]) {
        $array = @($Value)
        if ($array.Count -eq 0) { return "[]" }
        $items = foreach ($item in $array) {
            $childPad + (ConvertTo-KitJson -Value $item -Depth ($Depth + 1))
        }
        return "[`n" + ($items -join ",`n") + "`n$pad]"
    }
    return '"' + [string]$Value + '"'
}

function Test-KitHookPlatform {
    # Hooks without a 'platforms' field render on every platform adapter.
    param([Parameter(Mandatory = $true)] $Hook, [Parameter(Mandatory = $true)] [string] $Platform)
    if (-not $Hook.platforms) { return $true }
    return [bool]($Hook.platforms -contains $Platform)
}

function ConvertTo-CodexHooksJson {
    param([Parameter(Mandatory = $true)] $Hooks, [Parameter(Mandatory = $true)] [string] $Stack)
    $events = [ordered]@{}
    foreach ($hook in $Hooks.hooks) {
        if (-not ($hook.stacks -contains $Stack)) { continue }
        if (-not (Test-KitHookPlatform -Hook $hook -Platform "codex")) { continue }
        if (-not $events.Contains($hook.event)) { $events[$hook.event] = @() }
        $entry = [ordered]@{}
        if ($hook.codexMatcher) { $entry["matcher"] = $hook.codexMatcher }
        $codexCommand = $hook.commandPwsh
        if ($hook.commandCodex) { $codexCommand = $hook.commandCodex }
        $entry["hooks"] = @([ordered]@{ type = "command"; command = $codexCommand; commandWindows = $hook.command })
        $events[$hook.event] += , $entry
    }
    if ($events.Count -eq 0) { return $null }
    return (ConvertTo-KitJson -Value ([ordered]@{ hooks = $events })) + "`n"
}

function ConvertTo-GeminiSettingsJson {
    param([Parameter(Mandatory = $true)] $Hooks, [Parameter(Mandatory = $true)] [string] $Stack)
    $settings = [ordered]@{
        telemetry = [ordered]@{
            enabled    = $true
            target     = "local"
            outfile    = ".agents/usage/gemini-telemetry.log"
            logPrompts = $false
        }
    }
    $events = [ordered]@{}
    foreach ($hook in $Hooks.hooks) {
        if (-not ($hook.stacks -contains $Stack)) { continue }
        if (-not (Test-KitHookPlatform -Hook $hook -Platform "gemini")) { continue }
        $eventName = $hook.event
        if ($eventName -eq "Stop") { $eventName = "AfterAgent" }
        elseif ($eventName -eq "PostToolUse") { $eventName = "AfterTool" }
        if (-not $events.Contains($eventName)) { $events[$eventName] = @() }
        $entry = [ordered]@{}
        if ($hook.geminiMatcher) { $entry["matcher"] = $hook.geminiMatcher }
        $geminiCommand = $hook.command
        if ($hook.commandGemini) { $geminiCommand = $hook.commandGemini }
        $entry["hooks"] = @([ordered]@{
                type        = "command"
                name        = $hook.name
                command     = $geminiCommand
                description = "Rendered from global/canon/hooks.json."
            })
        $events[$eventName] += , $entry
    }
    if ($events.Count -gt 0) { $settings["hooks"] = $events }
    return (ConvertTo-KitJson -Value $settings) + "`n"
}

function ConvertTo-ClaudeSettingsJson {
    param(
        [Parameter(Mandatory = $true)] $Permissions,
        [Parameter(Mandatory = $true)] $Hooks,
        [Parameter(Mandatory = $true)] [string] $Stack
    )
    $allow = @()
    $deny = @()
    $ask = @()
    foreach ($rule in $Permissions.rules) {
        $entry = "Bash(" + ($rule.pattern -join " ") + ":*)"
        if ($rule.decision -eq "allow") { $allow += $entry }
        elseif ($rule.decision -eq "forbidden") { $deny += $entry }
        else { $ask += $entry }
    }
    $permissionLists = [ordered]@{ allow = $allow; deny = $deny }
    if ($ask.Count -gt 0) { $permissionLists["ask"] = $ask }
    $settings = [ordered]@{ permissions = $permissionLists }
    $events = [ordered]@{}
    foreach ($hook in $Hooks.hooks) {
        if (-not ($hook.stacks -contains $Stack)) { continue }
        if (-not (Test-KitHookPlatform -Hook $hook -Platform "claude")) { continue }
        if (-not $events.Contains($hook.event)) { $events[$hook.event] = @() }
        $entry = [ordered]@{}
        # Lifecycle events like Stop take no matcher; omit the key entirely.
        if ($hook.claudeMatcher) { $entry["matcher"] = $hook.claudeMatcher }
        $entry["hooks"] = @([ordered]@{ type = "command"; command = $hook.command })
        $events[$hook.event] += , $entry
    }
    if ($events.Count -gt 0) { $settings["hooks"] = $events }
    return (ConvertTo-KitJson -Value $settings) + "`n"
}

function ConvertTo-AntigravityRolesRule {
    # Antigravity has no static subagent format; personas are delivered as a rules file
    # for its dynamic orchestration (official codelab pattern).
    param([Parameter(Mandatory = $true)] $Roles)
    $lines = @("---", "trigger: model_decision", "description: Agent role definitions for delegated and multi-agent work (crossworking team shape)", "---", "")
    $lines += "# Agent Roles (rendered from kit canon)"
    $lines += ""
    $lines += "When orchestrating subagents or adopting a persona for a delegated task, use these role contracts. Prefer the most specialized role for each job; broader-profile roles (planner, context-builder, producer, architect, oracle, researcher) coordinate and never write production code."
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
    $matched = @($Hooks.hooks | Where-Object { ($_.stacks -contains $Stack) -and (Test-KitHookPlatform -Hook $_ -Platform "antigravity") })
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
    # Renders platform adapter layers for one stack from the canon.
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
    Install-KitRendered -Ctx $Ctx -Content (ConvertTo-GeminiSettingsJson -Hooks $hooks -Stack $Stack) -RelDest ".gemini\settings.json" -Cmdlet $Cmdlet

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

function Install-KitUnityContent {
    # The single definition of a Unity install's content set. Used by both
    # install-unity-project-template.ps1 and render-upm-payload.ps1 so the
    # script-install and UPM-install paths cannot diverge.
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSShouldProcess", "")]
    param(
        [Parameter(Mandatory = $true)] [hashtable] $Ctx,
        [Parameter(Mandatory = $true)] $Cmdlet
    )
    Install-KitTree -Ctx $Ctx -SourceDir (Join-Path $script:KitRoot "templates\unity-project") -RelDestPrefix "" -Cmdlet $Cmdlet
    Install-KitSkills -Ctx $Ctx -SkillNames ($script:UnitySkills + $script:SharedSkills) -Cmdlet $Cmdlet -MirrorClaude
    Install-KitPlatformAdapters -Ctx $Ctx -Stack "unity" -Cmdlet $Cmdlet
    Install-KitFile -Ctx $Ctx -Source (Join-Path $script:KitRoot "scripts\check-unity-meta.ps1") -RelDest ".agents\scripts\check-unity-meta.ps1" -Cmdlet $Cmdlet
    Install-KitUsageReporter -Ctx $Ctx -Cmdlet $Cmdlet
}

function Install-KitUsageReporter {
    # Ships the local usage/cost reporter hook target and its
    # bundled price snapshot. Stack-agnostic: used by both content sets.
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSShouldProcess", "")]
    param(
        [Parameter(Mandatory = $true)] [hashtable] $Ctx,
        [Parameter(Mandatory = $true)] $Cmdlet
    )
    Install-KitFile -Ctx $Ctx -Source (Join-Path $script:KitRoot "scripts\usage-report.ps1") -RelDest ".agents\scripts\usage-report.ps1" -Cmdlet $Cmdlet
    Install-KitFile -Ctx $Ctx -Source (Join-Path $script:KitRoot "scripts\usage-prices.json") -RelDest ".agents\scripts\usage-prices.json" -Cmdlet $Cmdlet
    Install-KitFile -Ctx $Ctx -Source (Join-Path $script:KitRoot "scripts\usage-common.ps1") -RelDest ".agents\scripts\usage-common.ps1" -Cmdlet $Cmdlet
    Install-KitFile -Ctx $Ctx -Source (Join-Path $script:KitRoot "scripts\usage-stats.ps1") -RelDest ".agents\scripts\usage-stats.ps1" -Cmdlet $Cmdlet
}

function Install-KitBackendContent {
    # The single definition of a backend install's content set.
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSShouldProcess", "")]
    param(
        [Parameter(Mandatory = $true)] [hashtable] $Ctx,
        [Parameter(Mandatory = $true)] $Cmdlet
    )
    Install-KitTree -Ctx $Ctx -SourceDir (Join-Path $script:KitRoot "templates\csharp-aspnet-project") -RelDestPrefix "" -Cmdlet $Cmdlet
    Install-KitSkills -Ctx $Ctx -SkillNames ($script:BackendSkills + $script:SharedSkills) -Cmdlet $Cmdlet -MirrorClaude
    Install-KitPlatformAdapters -Ctx $Ctx -Stack "backend" -Cmdlet $Cmdlet
    Install-KitUsageReporter -Ctx $Ctx -Cmdlet $Cmdlet
}

function Uninstall-KitManifestTree {
    # Removes every manifest-tracked kit file under TargetRoot, keeping locally
    # modified files unless -Force, then removes the manifest and now-empty
    # directories. Returns $true when a manifest was found and processed.
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSShouldProcess", "")]
    param(
        [Parameter(Mandatory = $true)] [string] $TargetRoot,
        [Parameter(Mandatory = $true)] [string] $ManifestPath,
        [switch] $Force,
        [Parameter(Mandatory = $true)] $Cmdlet
    )
    $manifest = Read-KitManifest -Path $ManifestPath
    if (-not $manifest) { return $false }

    $removed = 0
    $kept = 0
    $missing = 0
    $dirs = New-Object System.Collections.Generic.HashSet[string]

    foreach ($key in $manifest.files.Keys) {
        $path = Join-Path $TargetRoot ($key -replace "/", "\")
        if (-not (Test-Path -LiteralPath $path)) { $missing++; continue }
        $hash = Get-FileSha256 -Path $path
        if ($hash -eq $manifest.files[$key] -or $Force) {
            if ($Cmdlet.ShouldProcess($path, "Remove kit file")) {
                Remove-Item -LiteralPath $path -Force
            }
            Write-Host "REMOVE $key"
            $removed++
            $dir = Split-Path -Parent $path
            while ($dir -and $dir.Length -gt $TargetRoot.Length) {
                [void]$dirs.Add($dir)
                $dir = Split-Path -Parent $dir
            }
        }
        else {
            Write-Host "KEEP (locally modified) $key"
            $kept++
        }
    }

    if ($Cmdlet.ShouldProcess($ManifestPath, "Remove kit manifest")) {
        Remove-Item -LiteralPath $ManifestPath -Force -ErrorAction SilentlyContinue
    }

    # Clean up now-empty directories, deepest first.
    foreach ($dir in ($dirs | Sort-Object { $_.Length } -Descending)) {
        if ((Test-Path -LiteralPath $dir) -and -not (Get-ChildItem -LiteralPath $dir -Force)) {
            if ($Cmdlet.ShouldProcess($dir, "Remove empty directory")) {
                Remove-Item -LiteralPath $dir -Force
            }
        }
    }

    Write-Host "Summary for ${TargetRoot}: removed $removed, kept (modified) $kept, already missing $missing"
    if ($kept -gt 0) {
        Write-Warning "Locally modified kit files were kept. Re-run with -Force to delete them too."
    }
    return $true
}

# --- Portable installs: git-exclude the kit ---------------------------------
# A portable install keeps every kit file out of version control by listing the
# manifest-tracked paths in the containing repository's .git/info/exclude - a
# per-clone ignore file that is itself never committed. .gitignore is untouched.
# The C# UPM installer (upm/Editor/KitGitExclude.cs) writes the same block with
# the same markers, so either installer can refresh or remove it.

$script:GitExcludeBegin = "# >>> gamedev-agent-kit >>>"
$script:GitExcludeEnd = "# <<< gamedev-agent-kit <<<"

function Get-KitGitExcludeInfo {
    # Resolves where exclude entries for a target directory must go: the exclude
    # file of the containing repository (worktree-aware via --git-path) and the
    # target's path prefix relative to the repository root, because the project
    # may live in a subdirectory of the repo. $null when git is unavailable or
    # the target is not inside a work tree.
    param([Parameter(Mandatory = $true)] [string] $TargetRoot)
    $inside = Invoke-KitNativeQuiet { git -C $TargetRoot rev-parse --is-inside-work-tree }
    if ("$inside".Trim() -ne "true") { return $null }
    $excludeRel = "$(Invoke-KitNativeQuiet { git -C $TargetRoot rev-parse --git-path info/exclude })".Trim()
    $repoRoot = "$(Invoke-KitNativeQuiet { git -C $TargetRoot rev-parse --show-toplevel })".Trim()
    if (-not $excludeRel -or -not $repoRoot) { return $null }
    $excludePath = if ([System.IO.Path]::IsPathRooted($excludeRel)) { $excludeRel } else { [System.IO.Path]::GetFullPath((Join-Path $TargetRoot $excludeRel)) }
    $repoRootFull = ([System.IO.Path]::GetFullPath($repoRoot) -replace "\\", "/").TrimEnd("/")
    $targetFull = ([System.IO.Path]::GetFullPath($TargetRoot) -replace "\\", "/").TrimEnd("/")
    if (-not $targetFull.StartsWith($repoRootFull, [System.StringComparison]::OrdinalIgnoreCase)) { return $null }
    $prefix = $targetFull.Substring($repoRootFull.Length).Trim("/")
    if ($prefix) { $prefix += "/" }
    return @{ ExcludePath = $excludePath; Prefix = $prefix }
}

function Merge-KitGitExcludeContent {
    # Returns the exclude file content with the kit block replaced by $Block
    # (or dropped when $Block is empty). Non-kit content is preserved verbatim.
    param(
        [AllowEmptyString()] [string] $Existing,
        [AllowEmptyString()] [string] $Block
    )
    $pattern = "(?s)" + [regex]::Escape($script:GitExcludeBegin) + ".*?" + [regex]::Escape($script:GitExcludeEnd) + "(\r?\n)?"
    $stripped = ([regex]::Replace($Existing, $pattern, "")).TrimEnd("`r", "`n")
    if (-not $Block) {
        if ($stripped) { return $stripped + "`n" }
        return ""
    }
    if ($stripped) { return $stripped + "`n`n" + $Block + "`n" }
    return $Block + "`n"
}

function Test-KitGitExclude {
    # True when the target's repository already carries a kit exclude block -
    # used to keep refreshing it on updates even without an explicit -Portable.
    param([Parameter(Mandatory = $true)] [string] $TargetRoot)
    $info = Get-KitGitExcludeInfo -TargetRoot $TargetRoot
    if (-not $info -or -not (Test-Path -LiteralPath $info.ExcludePath)) { return $false }
    return ((Get-Content -LiteralPath $info.ExcludePath -Raw) -like ("*" + $script:GitExcludeBegin + "*"))
}

function Write-KitGitExclude {
    # Writes (or refreshes) the kit exclude block from the freshly built
    # manifest file set. ShouldProcess is delegated via -Cmdlet.
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSShouldProcess", "")]
    param(
        [Parameter(Mandatory = $true)] [hashtable] $Ctx,
        [Parameter(Mandatory = $true)] $Cmdlet
    )
    $info = Get-KitGitExcludeInfo -TargetRoot $Ctx.Target
    if (-not $info) {
        Write-Warning "Portable: target is not inside a git work tree (or git is unavailable) - no exclude entries written."
        return
    }
    $keys = @(@($Ctx.New.Keys) + ".agents/kit-manifest.json" | Sort-Object -Unique)
    $lines = @($script:GitExcludeBegin)
    $lines += "# Every kit-installed file, mirrored from .agents/kit-manifest.json."
    $lines += "# Managed by the kit installers: refreshed on install/update, removed on uninstall."
    foreach ($key in $keys) { $lines += "/" + $info.Prefix + $key }
    # .agents/plans/.gitignore re-includes itself ("!.gitignore"), and per-directory
    # ignore files override info/exclude entries. Excluding the whole transient plans
    # directory wins: git cannot re-include files under an excluded directory.
    $lines += "/" + $info.Prefix + ".agents/plans/"
    $lines += $script:GitExcludeEnd
    $existing = ""
    if (Test-Path -LiteralPath $info.ExcludePath) { $existing = Get-Content -LiteralPath $info.ExcludePath -Raw }
    $merged = Merge-KitGitExcludeContent -Existing $existing -Block ($lines -join "`n")
    if ($Cmdlet.ShouldProcess($info.ExcludePath, "Write kit exclude block ($($keys.Count) entries)")) {
        $dir = Split-Path -Parent $info.ExcludePath
        if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
        [System.IO.File]::WriteAllText($info.ExcludePath, $merged, (New-Object System.Text.UTF8Encoding $false))
    }
    Write-Host "PORTABLE $($keys.Count) kit paths excluded via $($info.ExcludePath)"
}

function Remove-KitGitExclude {
    # Removes the kit exclude block; other exclude content stays untouched.
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSShouldProcess", "")]
    param(
        [Parameter(Mandatory = $true)] [string] $TargetRoot,
        [Parameter(Mandatory = $true)] $Cmdlet
    )
    $info = Get-KitGitExcludeInfo -TargetRoot $TargetRoot
    if (-not $info -or -not (Test-Path -LiteralPath $info.ExcludePath)) { return }
    $existing = Get-Content -LiteralPath $info.ExcludePath -Raw
    if ($existing -notlike ("*" + $script:GitExcludeBegin + "*")) { return }
    $merged = Merge-KitGitExcludeContent -Existing $existing -Block ""
    if ($Cmdlet.ShouldProcess($info.ExcludePath, "Remove kit exclude block")) {
        [System.IO.File]::WriteAllText($info.ExcludePath, $merged, (New-Object System.Text.UTF8Encoding $false))
    }
    Write-Host "PORTABLE kit exclude block removed from $($info.ExcludePath)"
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
    # Sweep files the kit no longer ships whenever a previous install exists -
    # not only on -Update. A -Force refresh would otherwise orphan them forever:
    # left on disk and dropped from the rewritten manifest.
    if ($Ctx.Old) {
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
