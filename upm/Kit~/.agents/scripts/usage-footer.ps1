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
    [string] $ProjectRoot = (Get-Location).Path
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
    $lastReport = Join-Path $usageDir "last-report.md"
    if (-not (Test-Path -LiteralPath $lastReport)) {
        Write-Unavailable "no .agents/usage/last-report.md yet; finish one hooked turn after installing or updating the kit"
        exit 0
    }

    $lines = [System.IO.File]::ReadAllLines($lastReport)
    $lastTurn = @(Get-ReportSection -Lines $lines -Heading "Last turn")
    if ($lastTurn.Count -eq 0) {
        Write-Unavailable "last-report.md has no Last turn section"
        exit 0
    }

    $session = Get-ReportScalar -Lines $lines -Name "Session"
    $generated = Get-ReportScalar -Lines $lines -Name "Generated"
    $summary = ConvertTo-BriefSummary -Line $lastTurn[0]

    if ($Mode -eq "Brief") {
        $suffix = ""
        if ($generated) { $suffix = " | recorded " + $generated }
        Write-Output ("Usage: latest recorded - " + $summary + $suffix)
        exit 0
    }

    Write-Output "Usage:"
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
