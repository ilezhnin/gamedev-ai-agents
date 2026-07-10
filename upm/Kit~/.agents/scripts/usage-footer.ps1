# Renders a visible usage footer for agent final responses.
#
# The lifecycle hook collects usage into .agents/usage/. For an exact Codex
# session this script also reads a live, replay-aware rollout snapshot, because
# some clients hide hook output or invoke the footer before the Stop hook.
#
# Compatible with Windows PowerShell 5.1 and pwsh 7. ASCII only.

[CmdletBinding()]
param(
    [ValidateSet("Brief", "Full")]
    # Retained for caller compatibility. Both modes render one operator line;
    # detailed diagnostics remain in .agents/usage reports and views.
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
    Write-Output "Usage: unavailable"
    Write-Verbose $Reason
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

function Resolve-ReportPath {
    param([string] $UsageDir, [string] $ResolvedPlatform, [string] $RequestedSessionId)
    if (-not (Test-Path -LiteralPath $UsageDir)) { return $null }
    if ($ResolvedPlatform -eq "auto" -or [string]::IsNullOrWhiteSpace($RequestedSessionId)) { return $null }
    $platformSafe = ConvertTo-UsageSafeName -Value $ResolvedPlatform
    $sessionSafe = ConvertTo-UsageSafeName -Value $RequestedSessionId
    $sessionPath = Join-Path $UsageDir ("last-report-" + $platformSafe + "-" + $sessionSafe + ".md")
    if (Test-Path -LiteralPath $sessionPath) { return $sessionPath }
    return $null
}

function Get-CodexFooterTotals {
    param([object[]] $Rows, [hashtable] $PriceModels)
    $totals = @{}
    foreach ($row in @($Rows)) {
        $key = [string]$row.model + "|" + [string]$row.effort
        if (-not $totals.ContainsKey($key)) {
            $totals[$key] = [pscustomobject]@{
                model  = [string]$row.model
                effort = [string]$row.effort
                bucket = New-TokenBucket
            }
        }
        Add-TokenBucket -Target $totals[$key].bucket -Source $row.bucket
    }
    $result = @()
    foreach ($key in ($totals.Keys | Sort-Object)) {
        $item = $totals[$key]
        $price = Get-ModelPrice -Models $PriceModels -Model $item.model
        $cost = $null
        if ($price) { $cost = Get-BucketCost -Price $price -Bucket $item.bucket }
        $result += , [pscustomobject]@{
            model  = $item.model
            effort = $item.effort
            bucket = $item.bucket
            cost   = $cost
        }
    }
    return $result
}

function Get-UsageIdentitySummary {
    param([object[]] $Rows)
    $byModel = @{}
    foreach ($row in @($Rows)) {
        $model = [string]$row.model
        $effort = [string]$row.effort
        if ([string]::IsNullOrWhiteSpace($model)) { $model = "unknown" }
        if ([string]::IsNullOrWhiteSpace($effort)) { $effort = "unspecified" }
        if (-not $byModel.ContainsKey($model)) { $byModel[$model] = @{} }
        $byModel[$model][$effort] = $true
    }
    $identities = @($byModel.Keys | Sort-Object | ForEach-Object {
            $model = $_
            $model + " [" + (($byModel[$model].Keys | Sort-Object) -join "/") + "]"
        })
    if ($identities.Count -eq 0) { return "unknown" }
    if ($identities.Count -le 2) { return ($identities -join ", ") }
    return (($identities | Select-Object -First 2) -join ", ") + " +" + ($identities.Count - 2)
}

function Write-CompactUsage {
    param(
        [string] $Identity,
        [string] $Cost,
        [long] $InputTokens,
        [long] $OutputTokens,
        [long] $Calls
    )
    $costText = if ($Cost -eq "n/a") { "n/a" } else { "~" + $Cost }
    Write-Output ("Usage: " + $Identity + " | session " + $costText + " | " +
        (Format-Tokens -Value $InputTokens) + " in / " + (Format-Tokens -Value $OutputTokens) +
        " out | " + $Calls.ToString("N0", $script:Inv) + " calls")
}

function Write-CodexLiveFooter {
    param($Snapshot, [hashtable] $Prices)
    $totals = @(Get-CodexFooterTotals -Rows $Snapshot.rows -PriceModels $Prices.models)
    $sessionCost = 0.0
    $costComplete = $true
    $sessionBucket = New-TokenBucket
    foreach ($row in $totals) {
        Add-TokenBucket -Target $sessionBucket -Source $row.bucket
        if ($null -eq $row.cost) { $costComplete = $false }
        else { $sessionCost += [double]$row.cost }
    }
    $costText = if ($costComplete) { "$" + (Format-Money -Value $sessionCost) } else { "n/a" }
    Write-CompactUsage -Identity (Get-UsageIdentitySummary -Rows $totals) -Cost $costText `
        -InputTokens $sessionBucket.in -OutputTokens $sessionBucket.out -Calls $sessionBucket.calls
}

function Resolve-UsageV2CurrentSession {
    param([string] $UsageDir, [string] $ResolvedPlatform, [string] $RequestedSessionId)
    $path = Join-Path (Join-Path (Join-Path $UsageDir "v2") "views") "current-session.json"
    $view = Read-JsonFile -Path $path
    if (-not $view -or [int](Get-UsageV2EventProperty -Object $view -Name "v" -Default 0) -ne 2) { return $null }
    $viewPlatform = ([string](Get-UsageV2EventProperty -Object $view -Name "platform" -Default "")).ToLowerInvariant()
    if ($viewPlatform -ne $ResolvedPlatform.ToLowerInvariant()) { return $null }
    $viewSession = [string](Get-UsageV2EventProperty -Object $view -Name "sessionId" -Default "")
    if ($viewSession -eq $RequestedSessionId) { return $view }
    foreach ($alias in @((Get-UsageV2EventProperty -Object $view -Name "aliases" -Default @()))) {
        if ([string]$alias -eq $RequestedSessionId) { return $view }
    }
    return $null
}

function Format-UsageV2Cost {
    param($Value, [bool] $Complete = $true)
    if ($null -eq $Value -or -not $Complete) { return "n/a" }
    return "$" + (Format-Money -Value ([double]$Value))
}

function Write-UsageV2Footer {
    param($View)
    $totals = Get-UsageV2EventProperty -Object $View -Name "totals" -Default $null
    $sessionCost = Get-UsageV2EventProperty -Object $totals -Name "estimatedCostUsd" -Default $null
    $complete = [bool](Get-UsageV2EventProperty -Object $totals -Name "costComplete" -Default $true)
    $rows = @((Get-UsageV2EventProperty -Object $totals -Name "models" -Default @()) | ForEach-Object {
            [pscustomobject]@{
                model  = [string](Get-UsageV2EventProperty -Object $_ -Name "model" -Default "unknown")
                effort = [string](Get-UsageV2EventProperty -Object $_ -Name "effort" -Default "unspecified")
            }
        })
    $calls = 0L
    $inputTokens = 0L
    $outputTokens = 0L
    foreach ($row in @((Get-UsageV2EventProperty -Object $totals -Name "models" -Default @()))) {
        $calls += [long](Get-UsageV2EventNumber -Object $row -Name "calls" -Default 0.0)
        $inputTokens += [long](Get-UsageV2EventNumber -Object $row -Name "inputTokens" -Default 0.0)
        $outputTokens += [long](Get-UsageV2EventNumber -Object $row -Name "outputTokens" -Default 0.0)
    }
    Write-CompactUsage -Identity (Get-UsageIdentitySummary -Rows $rows) `
        -Cost (Format-UsageV2Cost -Value $sessionCost -Complete $complete) `
        -InputTokens $inputTokens -OutputTokens $outputTokens -Calls $calls
}

function Convert-FooterPathForHost {
    param([string] $Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return $Path }
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
    if ($resolvedPlatform -eq "auto") {
        Write-Unavailable "platform not detected; pass -Platform codex, -Platform claude, or -Platform gemini"
        exit 0
    }
    if ([string]::IsNullOrWhiteSpace($resolvedSessionId)) {
        Write-Unavailable ("exact " + $resolvedPlatform + " session id is required; pass -SessionId explicitly (WSL does not forward CODEX_THREAD_ID to powershell.exe)")
        exit 0
    }

    if ($resolvedPlatform -eq "codex") {
        $scriptDir = Split-Path -Parent $PSCommandPath
        $prices = Get-PriceTable -ScriptDir $scriptDir -UsageDir $usageDir
        $snapshot = Get-CodexSessionUsage -SessionId $resolvedSessionId -PriceModels $prices.models
        if ($snapshot.status -eq "ok" -and @($snapshot.rows).Count -gt 0) {
            Write-CodexLiveFooter -Snapshot $snapshot -Prices $prices
            exit 0
        }
        if ($snapshot.status -eq "partial") {
            Write-Unavailable ("Codex rollout lineage is incomplete for session " + $resolvedSessionId + "; refusing a partial estimate")
            exit 0
        }
    }
    $v2Session = Resolve-UsageV2CurrentSession -UsageDir $usageDir -ResolvedPlatform $resolvedPlatform -RequestedSessionId $resolvedSessionId
    if ($v2Session) {
        Write-UsageV2Footer -View $v2Session
        exit 0
    }
    $lastReport = Resolve-ReportPath -UsageDir $usageDir -ResolvedPlatform $resolvedPlatform -RequestedSessionId $resolvedSessionId
    if (-not $lastReport -or -not (Test-Path -LiteralPath $lastReport)) {
        Write-Unavailable ("no " + $resolvedPlatform + " usage report for session " + $resolvedSessionId + " yet; finish one hooked turn in this session")
        exit 0
    }

    $lines = [System.IO.File]::ReadAllLines($lastReport)
    $lastTurn = @(Get-ReportSection -Lines $lines -Heading "Last turn")
    if ($lastTurn.Count -eq 0) {
        Write-Unavailable "last-report.md has no Last turn section"
        exit 0
    }

    $summary = ConvertTo-BriefSummary -Line $lastTurn[0]
    Write-Output ("Usage: " + $summary)
    exit 0
}
catch {
    Write-Unavailable $_.Exception.Message
    exit 0
}
