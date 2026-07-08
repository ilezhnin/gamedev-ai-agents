# Renders a visible usage footer for agent final responses.
#
# The lifecycle hook still collects usage into .agents/usage/. Some clients do
# not render hook systemMessage output, so agents call this script before the
# final response and paste the result into the response body.
#
# Compatible with Windows PowerShell 5.1 and pwsh 7. ASCII only.

[CmdletBinding()]
param(
    [ValidateSet("Brief", "Full")]
    [string] $Mode = "Brief",
    [string] $ProjectRoot = (Get-Location).Path,
    [ValidateSet("auto", "codex", "claude", "gemini")]
    [string] $Platform = "auto",
    [string] $SessionId
)

$ErrorActionPreference = "Stop"

. (Join-Path (Split-Path -Parent $PSCommandPath) "usage-common.ps1")

function Get-ReportSection {
    param([string[]] $Lines, [string] $Heading)
    $result = New-Object "System.Collections.Generic.List[string]"
    $inSection = $false
    foreach ($line in $Lines) {
        if ($line -match "^##\s+") {
            if ($inSection) { break }
            if ($line.Trim() -eq ("## " + $Heading)) {
                $inSection = $true
            }
            continue
        }
        if (-not $inSection) { continue }
        $trimmed = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($trimmed)) { continue }
        [void]$result.Add($trimmed)
    }
    return @($result)
}

function Get-ReportScalar {
    param([string[]] $Lines, [string] $Name)
    foreach ($line in $Lines) {
        if ($line.StartsWith($Name + ":", [System.StringComparison]::Ordinal)) {
            return $line.Substring($Name.Length + 1).Trim()
        }
    }
    return ""
}

function ConvertTo-BriefSummary {
    param([string] $Line)
    if ([string]::IsNullOrWhiteSpace($Line)) { return "" }
    $text = $Line.Trim()
    if ($text.StartsWith("Usage ", [System.StringComparison]::Ordinal)) {
        $text = $text.Substring(6)
    }
    elseif ($text.StartsWith("Usage:", [System.StringComparison]::Ordinal)) {
        $text = $text.Substring(6).Trim()
    }
    return $text
}

function Write-Unavailable {
    param([string] $Reason)
    Write-Output ("Usage: unavailable - " + $Reason)
}

function ConvertTo-UsageReportSafeName {
    param([string] $Value)
    if ([string]::IsNullOrWhiteSpace($Value)) { return "unknown" }
    $safe = [regex]::Replace($Value, "[^A-Za-z0-9._-]", "_")
    if ($safe.Length -gt 80) { $safe = $safe.Substring(0, 80) }
    return $safe
}

function Get-UsageV2Property {
    param($Object, [string] $Name, $Default = $null)
    if (-not $Object) { return $Default }
    if ($Object.PSObject.Properties[$Name]) { return $Object.PSObject.Properties[$Name].Value }
    return $Default
}

function Get-UsageV2Number {
    param($Object, [string] $Name, [double] $Default = 0.0)
    $value = Get-UsageV2Property -Object $Object -Name $Name -Default $Default
    if ($null -eq $value) { return $Default }
    try { return [double]$value } catch { return $Default }
}

function Format-UsageV2Cost {
    param($Value, [bool] $Complete = $true)
    if ($null -eq $Value) { return "?" }
    $text = Format-Money -Value ([double]$Value)
    if (-not $Complete) { $text += "+" }
    return $text
}

function Resolve-UsageV2CurrentSession {
    param([string] $UsageDir, [string] $ResolvedPlatform, [string] $RequestedSessionId)
    $path = Join-Path (Join-Path (Join-Path $UsageDir "v2") "views") "current-session.json"
    $view = Read-JsonFile -Path $path
    if (-not $view) { return $null }
    if ([int](Get-UsageV2Property -Object $view -Name "v" -Default 0) -ne 2) { return $null }

    $viewPlatform = ([string](Get-UsageV2Property -Object $view -Name "platform" -Default "")).ToLowerInvariant()
    if ($ResolvedPlatform -ne "auto" -and $viewPlatform -ne $ResolvedPlatform.ToLowerInvariant()) { return $null }

    if (-not [string]::IsNullOrWhiteSpace($RequestedSessionId)) {
        $viewSession = [string](Get-UsageV2Property -Object $view -Name "sessionId" -Default "")
        if ($viewSession -eq $RequestedSessionId) { return $view }
        foreach ($alias in @((Get-UsageV2Property -Object $view -Name "aliases" -Default @()))) {
            if ([string]$alias -eq $RequestedSessionId) { return $view }
        }
        return $null
    }

    return $view
}

function New-UsageV2TurnSummary {
    param($View)
    $platformName = [string](Get-UsageV2Property -Object $View -Name "platform" -Default "unknown")
    $lastTurn = Get-UsageV2Property -Object $View -Name "lastTurn" -Default $null
    $totals = Get-UsageV2Property -Object $View -Name "totals" -Default $null
    $duration = Get-UsageV2Number -Object $lastTurn -Name "durationSeconds" -Default 0.0
    $turnCost = Get-UsageV2Property -Object $lastTurn -Name "estimatedCostUsd" -Default $null
    $sessionCost = Get-UsageV2Property -Object $totals -Name "estimatedCostUsd" -Default $null
    $complete = [bool](Get-UsageV2Property -Object $totals -Name "costComplete" -Default $true)
    $turns = [int](Get-UsageV2Number -Object $totals -Name "turns" -Default 0.0)
    return ($platformName + ": turn " + (Format-Duration -Seconds $duration) + " | est $" + (Format-UsageV2Cost -Value $turnCost) + " | session $" + (Format-UsageV2Cost -Value $sessionCost -Complete $complete) + " (" + $turns + " turn(s))")
}

function Write-UsageV2Rows {
    param($Rows, [bool] $IncludeScope)
    $list = @($Rows)
    if ($list.Count -eq 0) { return }
    if ($IncludeScope) {
        Write-Output ("    " + "model".PadRight(26) + "agent".PadRight(24) + "calls".PadRight(7) + "input".PadRight(9) + "output".PadRight(9) + "cacheW".PadRight(9) + "cacheR".PadRight(9) + "est$")
    }
    else {
        Write-Output ("    " + "model".PadRight(26) + "calls".PadRight(7) + "input".PadRight(9) + "output".PadRight(9) + "cacheW".PadRight(9) + "cacheR".PadRight(9) + "est$")
    }
    foreach ($row in $list) {
        $model = [string](Get-UsageV2Property -Object $row -Name "model" -Default "unknown")
        $scope = [string](Get-UsageV2Property -Object $row -Name "scope" -Default "main")
        $calls = [int](Get-UsageV2Number -Object $row -Name "calls" -Default 0.0)
        $inputTokens = [long](Get-UsageV2Number -Object $row -Name "inputTokens" -Default 0.0)
        $outputTokens = [long](Get-UsageV2Number -Object $row -Name "outputTokens" -Default 0.0)
        $cacheWriteTokens = [long](Get-UsageV2Number -Object $row -Name "cacheWriteTokens" -Default 0.0)
        $cacheReadTokens = [long](Get-UsageV2Number -Object $row -Name "cacheReadTokens" -Default 0.0)
        $cost = Get-UsageV2Property -Object $row -Name "estimatedCostUsd" -Default $null
        $costText = Format-UsageV2Cost -Value $cost
        if ($IncludeScope) {
            Write-Output ("    " + $model.PadRight(26) + $scope.PadRight(24) + ([string]$calls).PadRight(7) +
                (Format-Tokens -Value $inputTokens).PadRight(9) + (Format-Tokens -Value $outputTokens).PadRight(9) +
                (Format-Tokens -Value $cacheWriteTokens).PadRight(9) + (Format-Tokens -Value $cacheReadTokens).PadRight(9) + $costText)
        }
        else {
            Write-Output ("    " + $model.PadRight(26) + ([string]$calls).PadRight(7) +
                (Format-Tokens -Value $inputTokens).PadRight(9) + (Format-Tokens -Value $outputTokens).PadRight(9) +
                (Format-Tokens -Value $cacheWriteTokens).PadRight(9) + (Format-Tokens -Value $cacheReadTokens).PadRight(9) + $costText)
        }
    }
}

function Write-UsageV2Agents {
    param($Rows)
    $list = @($Rows)
    if ($list.Count -eq 0) { return }
    Write-Output "  agents:"
    foreach ($row in $list) {
        $role = [string](Get-UsageV2Property -Object $row -Name "role" -Default "unknown")
        $runs = [int](Get-UsageV2Number -Object $row -Name "runs" -Default 0.0)
        $tokensIn = [long](Get-UsageV2Number -Object $row -Name "tokensIn" -Default 0.0)
        $tokensOut = [long](Get-UsageV2Number -Object $row -Name "tokensOut" -Default 0.0)
        $cost = Get-UsageV2Property -Object $row -Name "estCost" -Default $null
        Write-Output ("    " + $role.PadRight(24) + "runs " + ([string]$runs).PadRight(5) + "tokens " + (Format-Tokens -Value ($tokensIn + $tokensOut)).PadRight(9) + "est $" + (Format-UsageV2Cost -Value $cost))
    }
}

function Write-UsageV2Tools {
    param($Rows)
    $list = @($Rows)
    if ($list.Count -eq 0) { return }
    Write-Output "  tools:"
    foreach ($row in $list) {
        $kind = [string](Get-UsageV2Property -Object $row -Name "kind" -Default "tool")
        $name = [string](Get-UsageV2Property -Object $row -Name "name" -Default "unknown")
        $calls = [int](Get-UsageV2Number -Object $row -Name "calls" -Default 0.0)
        $failures = [int](Get-UsageV2Number -Object $row -Name "failures" -Default 0.0)
        Write-Output ("    " + ($kind + "/" + $name).PadRight(28) + "calls " + ([string]$calls).PadRight(5) + "fail " + $failures)
    }
}

function Write-UsageV2Footer {
    param($View, [string] $Mode)
    $generated = [string](Get-UsageV2Property -Object $View -Name "generatedUtc" -Default "")
    $generatedText = ""
    $generatedUtc = ConvertTo-UtcDate -Text $generated
    if ($generatedUtc) { $generatedText = $generatedUtc.ToString("yyyy-MM-dd HH:mm", $script:Inv) + " UTC" }
    $summary = New-UsageV2TurnSummary -View $View
    if ($Mode -eq "Brief") {
        $suffix = ""
        if ($generatedText) { $suffix = " | recorded " + $generatedText }
        Write-Output ("Usage: current session - " + $summary + $suffix)
        return
    }

    $platformName = [string](Get-UsageV2Property -Object $View -Name "platform" -Default "")
    $session = [string](Get-UsageV2Property -Object $View -Name "sessionId" -Default "")
    $priceSource = [string](Get-UsageV2Property -Object $View -Name "priceSource" -Default "")
    $lastTurn = Get-UsageV2Property -Object $View -Name "lastTurn" -Default $null
    $totals = Get-UsageV2Property -Object $View -Name "totals" -Default $null

    Write-Output "Usage:"
    if ($platformName) { Write-Output ("  platform: " + $platformName) }
    if ($session) { Write-Output ("  session: " + $session) }
    if ($generatedText) { Write-Output ("  recorded: " + $generatedText) }
    Write-Output "  source: v2 current-session"
    Write-Output "  note: final-response tokens are counted by the next lifecycle hook report."
    Write-Output "  last turn:"
    Write-Output ("    " + $summary)
    Write-UsageV2Rows -Rows (Get-UsageV2Property -Object $lastTurn -Name "rows" -Default @()) -IncludeScope $true
    Write-Output "  session totals:"
    Write-UsageV2Rows -Rows (Get-UsageV2Property -Object $totals -Name "models" -Default @()) -IncludeScope $false
    Write-UsageV2Agents -Rows (Get-UsageV2Property -Object $totals -Name "agents" -Default @())
    Write-UsageV2Tools -Rows (Get-UsageV2Property -Object $totals -Name "tools" -Default @())
    if ($priceSource) { Write-Output ("  prices: " + $priceSource + " | API-equivalent estimate, not billing") }
    foreach ($warning in @((Get-UsageV2Property -Object $View -Name "warnings" -Default @()))) {
        if (-not [string]::IsNullOrWhiteSpace([string]$warning)) { Write-Output ("  warning: " + [string]$warning) }
    }
}

function Resolve-FooterPlatform {
    param([string] $Requested)
    if ($Requested -ne "auto") { return $Requested }
    if ($env:CODEX_SHELL -or $env:CODEX_THREAD_ID -or $env:CODEX_INTERNAL_ORIGINATOR_OVERRIDE) { return "codex" }
    foreach ($name in @("CLAUDECODE", "CLAUDE_CODE", "CLAUDE_SESSION_ID", "ANTHROPIC_SESSION_ID")) {
        if (-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) { return "claude" }
    }
    if ($env:GEMINI_CLI -or $env:GEMINI_SESSION_ID) { return "gemini" }
    return "auto"
}

function Resolve-FooterSessionId {
    param([string] $Requested, [string] $ResolvedPlatform)
    if (-not [string]::IsNullOrWhiteSpace($Requested)) { return $Requested }
    if ($ResolvedPlatform -eq "codex" -and -not [string]::IsNullOrWhiteSpace($env:CODEX_THREAD_ID)) { return $env:CODEX_THREAD_ID }
    if ($ResolvedPlatform -eq "claude") {
        foreach ($name in @("CLAUDE_SESSION_ID", "ANTHROPIC_SESSION_ID")) {
            $value = [Environment]::GetEnvironmentVariable($name)
            if (-not [string]::IsNullOrWhiteSpace($value)) { return $value }
        }
    }
    if ($ResolvedPlatform -eq "gemini" -and -not [string]::IsNullOrWhiteSpace($env:GEMINI_SESSION_ID)) { return $env:GEMINI_SESSION_ID }
    return ""
}

function Get-ReportPlatform {
    param([string[]] $Lines)
    $explicit = Get-ReportScalar -Lines $Lines -Name "Platform"
    if ($explicit) { return $explicit.ToLowerInvariant() }
    $lastTurn = @(Get-ReportSection -Lines $Lines -Heading "Last turn")
    if ($lastTurn.Count -gt 0) {
        $first = $lastTurn[0].Trim()
        if ($first -match "^Usage\s+([A-Za-z0-9_-]+):") { return $matches[1].ToLowerInvariant() }
    }
    return ""
}

function Resolve-ReportPath {
    param([string] $UsageDir, [string] $ResolvedPlatform, [string] $RequestedSessionId)
    if (-not (Test-Path -LiteralPath $UsageDir)) { return $null }
    if ($ResolvedPlatform -ne "auto") {
        $platformSafe = ConvertTo-UsageReportSafeName -Value $ResolvedPlatform
        if (-not [string]::IsNullOrWhiteSpace($RequestedSessionId)) {
            $sessionSafe = ConvertTo-UsageReportSafeName -Value $RequestedSessionId
            $sessionPath = Join-Path $UsageDir ("last-report-" + $platformSafe + "-" + $sessionSafe + ".md")
            if (Test-Path -LiteralPath $sessionPath) { return $sessionPath }
            return $null
        }
        $platformPath = Join-Path $UsageDir ("last-report-" + $platformSafe + ".md")
        if (Test-Path -LiteralPath $platformPath) { return $platformPath }
    }

    $legacyPath = Join-Path $UsageDir "last-report.md"
    if (-not (Test-Path -LiteralPath $legacyPath)) { return $null }
    if ($ResolvedPlatform -eq "auto") { return $legacyPath }
    $legacyLines = [System.IO.File]::ReadAllLines($legacyPath)
    $legacyPlatform = Get-ReportPlatform -Lines $legacyLines
    if ($legacyPlatform -eq $ResolvedPlatform) { return $legacyPath }
    return $null
}

function Convert-FooterPathForHost {
    param([string] $Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return $Path }
    if (Test-Path -LiteralPath $Path) { return $Path }
    if ([System.IO.Path]::DirectorySeparatorChar -eq "\" -and $Path -match "^/mnt/([A-Za-z])/(.*)$") {
        $drive = $matches[1].ToUpperInvariant()
        $rest = $matches[2] -replace "/", "\"
        $candidate = $drive + ":\" + $rest
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    return $Path
}

try {
    $root = Convert-FooterPathForHost -Path $ProjectRoot
    if (-not $root -or -not (Test-Path -LiteralPath $root)) { $root = (Get-Location).Path }
    $usageDir = Join-Path $root ".agents\usage"
    $resolvedPlatform = Resolve-FooterPlatform -Requested $Platform
    $resolvedSessionId = Resolve-FooterSessionId -Requested $SessionId -ResolvedPlatform $resolvedPlatform
    $v2Session = Resolve-UsageV2CurrentSession -UsageDir $usageDir -ResolvedPlatform $resolvedPlatform -RequestedSessionId $resolvedSessionId
    if ($v2Session) {
        Write-UsageV2Footer -View $v2Session -Mode $Mode
        exit 0
    }

    $lastReport = Resolve-ReportPath -UsageDir $usageDir -ResolvedPlatform $resolvedPlatform -RequestedSessionId $resolvedSessionId
    if (-not $lastReport -or -not (Test-Path -LiteralPath $lastReport)) {
        if ($resolvedPlatform -eq "auto") {
            Write-Unavailable "platform not detected; pass -Platform codex, -Platform claude, or -Platform gemini"
        }
        elseif (-not [string]::IsNullOrWhiteSpace($resolvedSessionId)) {
            Write-Unavailable ("no " + $resolvedPlatform + " usage report for session " + $resolvedSessionId + " yet; finish one hooked turn in this session")
        }
        else {
            Write-Unavailable ("no " + $resolvedPlatform + " usage report yet; finish one hooked " + $resolvedPlatform + " turn after installing or updating the kit")
        }
        exit 0
    }

    $lines = [System.IO.File]::ReadAllLines($lastReport)
    $lastTurn = @(Get-ReportSection -Lines $lines -Heading "Last turn")
    if ($lastTurn.Count -eq 0) {
        Write-Unavailable "last-report.md has no Last turn section"
        exit 0
    }

    $session = Get-ReportScalar -Lines $lines -Name "Session"
    $reportPlatform = Get-ReportPlatform -Lines $lines
    $generated = Get-ReportScalar -Lines $lines -Name "Generated"
    $summary = ConvertTo-BriefSummary -Line $lastTurn[0]

    if ($Mode -eq "Brief") {
        $suffix = ""
        if ($generated) { $suffix = " | recorded " + $generated }
        Write-Output ("Usage: latest recorded - " + $summary + $suffix)
        exit 0
    }

    Write-Output "Usage:"
    if ($reportPlatform) { Write-Output ("  platform: " + $reportPlatform) }
    if ($session) { Write-Output ("  session: " + $session) }
    if ($generated) { Write-Output ("  recorded: " + $generated) }
    Write-Output "  note: final-response tokens are counted by the next lifecycle hook report."
    Write-Output "  last turn:"
    foreach ($line in $lastTurn) {
        if ($line.StartsWith("Usage ", [System.StringComparison]::Ordinal) -or $line.StartsWith("Usage:", [System.StringComparison]::Ordinal)) {
            Write-Output ("    " + (ConvertTo-BriefSummary -Line $line))
        }
        else {
            Write-Output ("    " + $line)
        }
    }

    $sessionTotals = @(Get-ReportSection -Lines $lines -Heading "Session totals")
    if ($sessionTotals.Count -gt 0) {
        Write-Output "  session totals:"
        foreach ($line in $sessionTotals) { Write-Output ("    " + $line) }
    }
    exit 0
}
catch {
    Write-Unavailable $_.Exception.Message
    exit 0
}
