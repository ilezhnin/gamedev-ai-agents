[CmdletBinding()]
param(
    [switch] $Quiet
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "kit-common.ps1")

$failures = 0
$checks = 0

function Report {
    param([bool] $Ok, [string] $Name, [string] $Detail = "")
    $script:checks++
    if ($Ok) {
        if (-not $Quiet) { Write-Host "PASS $Name" }
    }
    else {
        $script:failures++
        $suffix = if ($Detail) { " - $Detail" } else { "" }
        Write-Host "FAIL $Name$suffix"
    }
}

function Test-IsAscii {
    param([string] $Path)
    $bytes = [System.IO.File]::ReadAllBytes($Path)
    foreach ($b in $bytes) { if ($b -gt 127) { return $false } }
    return $true
}

function Get-GitCommandPath {
    $gitCommand = Get-Command git -ErrorAction SilentlyContinue
    if ($gitCommand) { return $gitCommand.Source }

    $candidatePaths = @(
        "C:\Program Files\Git\cmd\git.exe",
        "C:\Program Files\Git\bin\git.exe",
        "C:\Program Files (x86)\Git\cmd\git.exe"
    )
    foreach ($candidate in $candidatePaths) {
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }

    return ""
}

function Get-GitText {
    param([string[]] $Arguments)
    if ([string]::IsNullOrWhiteSpace($script:GitCommandPath)) { return "" }
    $output = & $script:GitCommandPath @Arguments 2>$null
    if ($LASTEXITCODE -ne 0) { return "" }
    return (($output | Out-String).Trim())
}

function Get-LocalGitConfigValue {
    param([string] $Key)
    $configPath = Join-Path $script:KitRoot ".git\config"
    if (-not (Test-Path -LiteralPath $configPath)) { return "" }

    $section = ""
    foreach ($line in Get-Content -LiteralPath $configPath) {
        if ($line -match '^\s*\[([^\]]+)\]\s*$') {
            $section = $matches[1]
            continue
        }

        if ($section -eq "user" -and $line -match '^\s*([A-Za-z0-9._-]+)\s*=\s*(.*)\s*$') {
            if ($matches[1] -eq $Key) { return $matches[2].Trim() }
        }
    }

    return ""
}

function Test-IsFallbackGitIdentity {
    param([string] $Identity)
    if ([string]::IsNullOrWhiteSpace($Identity)) { return $true }
    return ($Identity -match "(?i)<root@" -or
        $Identity -match "(?i)\.localdomain>" -or
        $Identity -match "(?i)<[^>]+@DESKTOP-[^>]+>")
}

$script:GitCommandPath = Get-GitCommandPath
$hasGitDirectory = Test-Path -LiteralPath (Join-Path $script:KitRoot ".git")
$gitCliAvailable = (-not [string]::IsNullOrWhiteSpace($script:GitCommandPath)) -and ((Get-GitText -Arguments @("--version")) -match "^git version")

if ($hasGitDirectory) {
    $isCi = [bool]($env:CI -or $env:GITHUB_ACTIONS)
    if ($isCi) {
        Report $true "git: local commit identity config check skipped in CI"
    }
    else {
        if ($gitCliAvailable) {
            $userName = Get-GitText -Arguments @("-C", $script:KitRoot, "config", "--get", "user.name")
            $userEmail = Get-GitText -Arguments @("-C", $script:KitRoot, "config", "--get", "user.email")
        }
        else {
            $userName = Get-LocalGitConfigValue -Key "name"
            $userEmail = Get-LocalGitConfigValue -Key "email"
        }

        $configured = (-not [string]::IsNullOrWhiteSpace($userName)) -and (-not [string]::IsNullOrWhiteSpace($userEmail))
        Report $configured "git: user.name and user.email are configured" "run git config user.name and git config user.email before committing"

        if ($gitCliAvailable) {
            $authorIdent = Get-GitText -Arguments @("-C", $script:KitRoot, "var", "GIT_AUTHOR_IDENT")
            $committerIdent = Get-GitText -Arguments @("-C", $script:KitRoot, "var", "GIT_COMMITTER_IDENT")
        }
        else {
            $authorIdent = "$userName <$userEmail>"
            $committerIdent = $authorIdent
        }

        $fallback = (Test-IsFallbackGitIdentity -Identity $authorIdent) -or (Test-IsFallbackGitIdentity -Identity $committerIdent)
        Report (-not $fallback) "git: effective author and committer identity are not fallback values" "author $authorIdent; committer $committerIdent"
    }

    if ($gitCliAvailable) {
        $recentCommits = @(Get-GitText -Arguments @("-C", $script:KitRoot, "log", "-25", "--format=%h %an <%ae> | %cn <%ce>") -split "`n")
        $badRecentCommits = @($recentCommits | Where-Object { Test-IsFallbackGitIdentity -Identity $_ })
        Report ($badRecentCommits.Count -eq 0) "git: recent commits do not use fallback identities" (($badRecentCommits | Select-Object -First 3) -join "; ")
    }
    else {
        Report $true "git: recent commit identity scan skipped because git CLI is unavailable"
    }
}
else {
    Report $true "git: identity checks skipped outside a git worktree"
}

$skillDirs = Get-ChildItem -LiteralPath $script:PluginSkillsRoot -Directory

# 1-3: per-skill structure.
foreach ($dir in $skillDirs) {
    $skillMd = Join-Path $dir.FullName "SKILL.md"
    if (-not (Test-Path -LiteralPath $skillMd)) {
        Report $false "skill $($dir.Name): SKILL.md exists"
        continue
    }
    $text = Get-Content -LiteralPath $skillMd -Raw

    $nameOk = $text -match "(?m)^name:\s*(\S+)\s*$" -and $matches[1] -eq $dir.Name
    Report $nameOk "skill $($dir.Name): frontmatter name matches folder"

    $descOk = $text -match "(?m)^description:\s*\S+"
    Report $descOk "skill $($dir.Name): description present"

    $yamlPath = Join-Path $dir.FullName "agents\openai.yaml"
    if (Test-Path -LiteralPath $yamlPath) {
        $yaml = Get-Content -LiteralPath $yamlPath -Raw
        $yamlOk = ($yaml -match "display_name:") -and ($yaml -match "short_description:") -and ($yaml -match [regex]::Escape("`$" + $dir.Name))
        Report $yamlOk "skill $($dir.Name): openai.yaml complete and references `$$($dir.Name)"
    }
    else {
        Report $false "skill $($dir.Name): agents/openai.yaml exists"
    }

    # SKILL.md stays procedural; detail belongs in references/ (budget from AGENTS.md).
    $lineCount = ($text -split "`n").Count
    Report ($lineCount -le 130) "skill $($dir.Name): SKILL.md within the 130-line budget" "$lineCount lines"

    # References mentioned must exist; files present must be mentioned.
    $mentioned = @()
    foreach ($m in [regex]::Matches($text, "references/([A-Za-z0-9._-]+\.[A-Za-z0-9]+)")) {
        $mentioned += $m.Groups[1].Value
    }
    $mentioned = $mentioned | Sort-Object -Unique
    $refDir = Join-Path $dir.FullName "references"
    $present = @()
    if (Test-Path -LiteralPath $refDir) {
        $present = @(Get-ChildItem -LiteralPath $refDir -File | ForEach-Object { $_.Name }) | Sort-Object
    }
    $missingRefs = @($mentioned | Where-Object { $present -notcontains $_ })
    $orphanRefs = @($present | Where-Object { $mentioned -notcontains $_ })
    Report ($missingRefs.Count -eq 0) "skill $($dir.Name): mentioned references exist" ($missingRefs -join ", ")
    Report ($orphanRefs.Count -eq 0) "skill $($dir.Name): no orphan reference files" ($orphanRefs -join ", ")
}

# 4: plugin + marketplace manifests.
$pluginJsonPath = Join-Path $script:KitRoot "plugins\codex-unity-agent-kit\.codex-plugin\plugin.json"
try {
    $pluginJson = Get-Content -LiteralPath $pluginJsonPath -Raw | ConvertFrom-Json
    $skillsPath = Join-Path (Split-Path -Parent (Split-Path -Parent $pluginJsonPath)) ($pluginJson.skills -replace "/", "\")
    Report (Test-Path -LiteralPath $skillsPath) "plugin.json: skills path resolves" $pluginJson.skills
}
catch {
    Report $false "plugin.json parses" $_.Exception.Message
}

$marketplacePath = Join-Path $script:KitRoot ".agents\plugins\marketplace.json"
try {
    $marketplace = Get-Content -LiteralPath $marketplacePath -Raw | ConvertFrom-Json
    $pluginPath = Join-Path $script:KitRoot ($marketplace.plugins[0].source.path -replace "/", "\")
    Report (Test-Path -LiteralPath $pluginPath) "marketplace.json: plugin source path resolves" $marketplace.plugins[0].source.path
}
catch {
    Report $false "marketplace.json parses" $_.Exception.Message
}

# 5: skill sets match disk.
$allSets = $script:UnitySkills + $script:BackendSkills + $script:SharedSkills
$onDisk = @($skillDirs | ForEach-Object { $_.Name })
$notOnDisk = @($allSets | Where-Object { $onDisk -notcontains $_ })
$notInSets = @($onDisk | Where-Object { $allSets -notcontains $_ })
Report ($notOnDisk.Count -eq 0) "skill sets: every declared skill exists on disk" ($notOnDisk -join ", ")
Report ($notInSets.Count -eq 0) "skill sets: every skill on disk is declared in a set" ($notInSets -join ", ")

# 6: canon files parse and renderers produce valid output for every role/stack.
try {
    $roles = (Get-KitCanon -Name "roles").roles
    Report ($roles.Count -ge 12) "canon: roles.json parses with expected role count" "found $($roles.Count)"
    foreach ($role in $roles) {
        $fieldsOk = $role.name -and $role.description -and ($role.stack -in @("unity", "backend", "shared")) -and ($role.reasoning -in @("minimal", "low", "medium", "high", "xhigh")) -and $role.instructions.Count -gt 0
        Report $fieldsOk "canon: role $($role.name) has valid fields"
        $toml = ConvertTo-CodexAgentToml -Role $role
        $md = ConvertTo-ClaudeAgentMd -Role $role
        Report (($toml -match "developer_instructions") -and ($md -match "^---") -and ($md -match "(?m)^effort: (low|medium|high|xhigh|max)$")) "canon: role $($role.name) renders to both platforms"
    }
}
catch {
    Report $false "canon: roles.json parses" $_.Exception.Message
}

try {
    $permissions = Get-KitCanon -Name "permissions"
    $rulesText = ConvertTo-CodexRules -Permissions $permissions
    Report ($rulesText -match "prefix_rule\(") "canon: permissions render to Codex rules"
    $hooksCanon = Get-KitCanon -Name "hooks"
    foreach ($stack in @("unity", "backend")) {
        $settings = ConvertTo-ClaudeSettingsJson -Permissions $permissions -Hooks $hooksCanon -Stack $stack
        $parsed = $settings | ConvertFrom-Json
        Report ($null -ne $parsed.permissions) "canon: Claude settings render valid JSON for $stack"
    }
    $codexHooks = ConvertTo-CodexHooksJson -Hooks $hooksCanon -Stack "unity"
    Report ($null -ne ($codexHooks | ConvertFrom-Json).hooks) "canon: Codex hooks render valid JSON for unity"
    # Every hook command must point at a script the payload actually ships.
    foreach ($hook in $hooksCanon.hooks) {
        foreach ($command in @($hook.command, $hook.commandPwsh)) {
            if ($command -match "-File\s+(\S+)") {
                $hookTarget = $matches[1]
                $shipped = Test-Path -LiteralPath (Join-Path $script:KitRoot ("upm\Kit~\" + ($hookTarget -replace "/", "\")))
                Report $shipped "canon: hook target $hookTarget is shipped in the payload"
            }
        }
    }
    $agRoles = ConvertTo-AntigravityRolesRule -Roles $roles
    $agPerms = ConvertTo-AntigravityPermissionsRule -Permissions $permissions
    $agAuto = ConvertTo-AntigravityAutomationRule -Hooks $hooksCanon -Stack "unity"
    Report (($agRoles -match "trigger: model_decision") -and ($agPerms -match "trigger: always_on") -and ($agAuto -match "check-unity-meta")) "canon: Antigravity rules render for roles, permissions, and automation"
}
catch {
    Report $false "canon: permissions/hooks parse and render" $_.Exception.Message
}

# 7: platform adapters must NOT be stored in the kit - they are rendered at install
# time. Template .claude may carry only the static CLAUDE.md pointer; the rendered
# parts (agents, settings.json, the skills mirror) stay forbidden.
foreach ($forbidden in @(
        "global\agents", "global\rules",
        "templates\unity-project\.codex\agents", "templates\unity-project\.codex\rules", "templates\unity-project\.codex\hooks.json", "templates\unity-project\.claude\agents", "templates\unity-project\.claude\settings.json", "templates\unity-project\.claude\skills", "templates\unity-project\.agents\rules",
        "templates\csharp-aspnet-project\.codex\agents", "templates\csharp-aspnet-project\.codex\rules", "templates\csharp-aspnet-project\.claude\agents", "templates\csharp-aspnet-project\.claude\settings.json", "templates\csharp-aspnet-project\.claude\skills", "templates\csharp-aspnet-project\.agents\rules"
    )) {
    Report (-not (Test-Path -LiteralPath (Join-Path $script:KitRoot $forbidden))) "rendered-only: $forbidden is not stored in the kit"
}

# 8: ASCII policy - the kit is English-only, no exceptions.
$nonAscii = @()
foreach ($root in @("templates", "plugins", "upm", "scripts")) {
    foreach ($file in Get-ChildItem -LiteralPath (Join-Path $script:KitRoot $root) -Recurse -File) {
        if (-not (Test-IsAscii -Path $file.FullName)) { $nonAscii += $file.FullName.Substring($script:KitRoot.Length + 1) }
    }
}
Report ($nonAscii.Count -eq 0) "ascii: templates/, plugins/, upm/, and scripts/ are ASCII" ($nonAscii -join ", ")

# 8b: docs must reference paths that exist. Inline-code path references in the
# contributor docs are checked against disk; for glob references the directory
# prefix before the first wildcard must exist. This catches contracts that
# survive refactors only on paper (e.g. a renamed source-of-truth directory).
foreach ($docName in @("AGENTS.md", "README.md", "README.ru.md")) {
    $docPath = Join-Path $script:KitRoot $docName
    if (-not (Test-Path -LiteralPath $docPath)) { continue }
    $docText = Get-Content -LiteralPath $docPath -Raw
    $badPaths = @()
    foreach ($m in [regex]::Matches($docText, "``([A-Za-z0-9._][^``\r\n]*)``")) {
        $token = $m.Groups[1].Value.Trim()
        if ($token -notmatch "^(scripts|global|templates|plugins|upm)[/\\]") { continue }
        if ($token -match "[<>:|?]") { continue }
        if ($token -match "\.\.\.") { continue }
        $probe = $token
        $wildcard = $probe.IndexOf("*")
        if ($wildcard -ge 0) {
            $probe = Split-Path -Parent $probe.Substring(0, $wildcard)
            if (-not $probe) { continue }
        }
        $probe = $probe.TrimEnd("/", "\") -replace "/", "\"
        if (-not (Test-Path -LiteralPath (Join-Path $script:KitRoot $probe))) { $badPaths += $token }
    }
    $badPaths = $badPaths | Sort-Object -Unique
    Report (@($badPaths).Count -eq 0) "docs: every kit path referenced in $docName exists" ($badPaths -join ", ")
}

# 8c: the RU README mirror must keep structural parity with the EN original.
$readmeEn = Get-Content -LiteralPath (Join-Path $script:KitRoot "README.md") -Raw
$readmeRu = Get-Content -LiteralPath (Join-Path $script:KitRoot "README.ru.md") -Raw
$enHeadings = [regex]::Matches($readmeEn, "(?m)^#{1,4} ").Count
$ruHeadings = [regex]::Matches($readmeRu, "(?m)^#{1,4} ").Count
$enRows = [regex]::Matches($readmeEn, "(?m)^\|").Count
$ruRows = [regex]::Matches($readmeRu, "(?m)^\|").Count
Report ($enHeadings -eq $ruHeadings -and $enRows -eq $ruRows) "docs: README.ru.md mirrors README.md structure" "EN $enHeadings headings/$enRows table rows, RU $ruHeadings/$ruRows"

# 8d: the changelog must document the current version.
$changelog = Get-Content -LiteralPath (Join-Path $script:KitRoot "CHANGELOG.md") -Raw
Report ($changelog -match [regex]::Escape("## " + (Get-KitVersion))) "docs: CHANGELOG.md has an entry for kit $(Get-KitVersion)"

# 9: duplication guard.
Report (-not (Test-Path -LiteralPath (Join-Path $script:KitRoot "templates\unity-project\.agents\skills"))) "duplication: unity template does not embed skill copies"

# 10: UPM package - manifest parses, name and version stay in lock-step with the kit.
$upmPackageJsonPath = Join-Path $script:KitRoot "upm\package.json"
try {
    $upmPackage = Get-Content -LiteralPath $upmPackageJsonPath -Raw | ConvertFrom-Json
    Report ($upmPackage.name -eq "com.ilezhnin.gamedev-agent-kit") "upm: package name is com.ilezhnin.gamedev-agent-kit" $upmPackage.name
    Report ($upmPackage.version -eq (Get-KitVersion)) "upm: package.json version matches VERSION" "package $($upmPackage.version), kit $(Get-KitVersion)"
}
catch {
    Report $false "upm: package.json parses" $_.Exception.Message
}

# 11: UPM payload - upm/Kit~ must match a fresh render (no drift, no hand edits).
$payloadRoot = Join-Path $script:KitRoot "upm\Kit~"
if (-not (Test-Path -LiteralPath $payloadRoot)) {
    Report $false "upm: Kit~ payload exists" "run scripts\render-upm-payload.ps1"
}
else {
    $tempRender = Join-Path ([System.IO.Path]::GetTempPath()) ("kit-payload-" + [Guid]::NewGuid().ToString("N"))
    try {
        & (Join-Path $PSScriptRoot "render-upm-payload.ps1") -OutDir $tempRender *> $null
        if (-not (Test-Path -LiteralPath $tempRender)) { throw "render-upm-payload.ps1 produced no output" }

        function Get-TreeHashes {
            param([string] $Root)
            $map = @{}
            $rootFull = (Get-Item -LiteralPath $Root).FullName
            foreach ($file in Get-ChildItem -LiteralPath $rootFull -Force -Recurse -File) {
                $rel = $file.FullName.Substring($rootFull.Length).TrimStart("\", "/") -replace "\\", "/"
                $map[$rel] = Get-FileSha256 -Path $file.FullName
            }
            return $map
        }

        $committed = Get-TreeHashes -Root $payloadRoot
        $fresh = Get-TreeHashes -Root $tempRender
        $driftDetails = @()
        foreach ($key in $fresh.Keys) {
            if (-not $committed.ContainsKey($key)) { $driftDetails += "missing: $key" }
            elseif ($committed[$key] -ne $fresh[$key]) { $driftDetails += "differs: $key" }
        }
        foreach ($key in $committed.Keys) {
            if (-not $fresh.ContainsKey($key)) { $driftDetails += "extra: $key" }
        }
        Report ($driftDetails.Count -eq 0) "upm: Kit~ payload matches a fresh render" (($driftDetails | Select-Object -First 5) -join ", ")
    }
    catch {
        Report $false "upm: payload drift check runs" $_.Exception.Message
    }
    finally {
        Remove-Item -LiteralPath $tempRender -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Write-Host ""
Write-Host "validate-kit: $checks checks, $failures failed (kit $(Get-KitVersion))"
if ($failures -gt 0) { exit 1 }
exit 0
