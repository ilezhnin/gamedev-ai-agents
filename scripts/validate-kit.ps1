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

    # References mentioned must exist; files present must be mentioned.
    $mentioned = @()
    foreach ($m in [regex]::Matches($text, "references/([A-Za-z0-9._-]+\.md)")) {
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

# 6: agent TOML duplicates are byte-identical.
foreach ($pair in @(
        @{ Template = "templates\unity-project\.codex\agents" },
        @{ Template = "templates\csharp-aspnet-project\.codex\agents" }
    )) {
    $templateDir = Join-Path $script:KitRoot $pair.Template
    foreach ($file in Get-ChildItem -LiteralPath $templateDir -Filter "*.toml" -File) {
        $globalFile = Join-Path (Join-Path $script:KitRoot "global\agents") $file.Name
        if (-not (Test-Path -LiteralPath $globalFile)) {
            Report $false "agents: $($file.Name) exists in global/agents"
            continue
        }
        $same = (Get-FileSha256 -Path $file.FullName) -eq (Get-FileSha256 -Path $globalFile)
        Report $same "agents: $($pair.Template)\$($file.Name) identical to global copy"
    }
}

# 7: rules identical ignoring the first comment line.
$ruleBodies = @()
foreach ($rulePath in @("global\rules\default.rules", "templates\unity-project\.codex\rules\default.rules", "templates\csharp-aspnet-project\.codex\rules\default.rules")) {
    $full = Join-Path $script:KitRoot $rulePath
    $lines = Get-Content -LiteralPath $full
    if ($lines.Count -gt 0 -and $lines[0] -match "^#") { $lines = $lines[1..($lines.Count - 1)] }
    $ruleBodies += , @{ Path = $rulePath; Body = ($lines -join "`n") }
}
$rulesOk = ($ruleBodies[1].Body -eq $ruleBodies[0].Body) -and ($ruleBodies[2].Body -eq $ruleBodies[0].Body)
Report $rulesOk "rules: template rules match global rules (ignoring header comment)"

# 8: ASCII policy - the kit is English-only, no exceptions.
$asciiAllowlist = @()
$nonAscii = @()
foreach ($root in @("templates", "plugins")) {
    foreach ($file in Get-ChildItem -LiteralPath (Join-Path $script:KitRoot $root) -Recurse -File) {
        if ($asciiAllowlist -contains $file.FullName) { continue }
        if (-not (Test-IsAscii -Path $file.FullName)) { $nonAscii += $file.FullName.Substring($script:KitRoot.Length + 1) }
    }
}
Report ($nonAscii.Count -eq 0) "ascii: templates/ and plugins/ are ASCII (allowlisted exceptions aside)" ($nonAscii -join ", ")

# 9: duplication guard.
Report (-not (Test-Path -LiteralPath (Join-Path $script:KitRoot "templates\unity-project\.agents\skills"))) "duplication: unity template does not embed skill copies"

Write-Host ""
Write-Host "validate-kit: $checks checks, $failures failed (kit $(Get-KitVersion))"
if ($failures -gt 0) { exit 1 }
exit 0
