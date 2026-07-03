# Persistent usage statistics aggregator.
#
# Reads .agents/usage/history.jsonl, optionally scans Codex rollout files, and
# writes stats-summary.json plus usage-stats.md for the Unity package UI.
#
# Compatible with Windows PowerShell 5.1 and pwsh 7. ASCII only.

[CmdletBinding()]
param(
    [string] $ProjectRoot = (Get-Location).Path,
    [switch] $NoCodexScan,
    [switch] $Quiet
)

$ErrorActionPreference = "Stop"

. (Join-Path (Split-Path -Parent $PSCommandPath) "usage-common.ps1")

function Get-PropValue {
    param($Object, [string] $Name, $Default = $null)
    if (-not $Object) { return $Default }
    if ($Object.PSObject.Properties[$Name]) { return $Object.PSObject.Properties[$Name].Value }
    return $Default
}

function Get-LongValue {
    param($Object, [string] $Name)
    $value = Get-PropValue -Object $Object -Name $Name -Default 0
    if ($null -eq $value) { return [long]0 }
    return [long]$value
}

function Get-DoubleValue {
    param($Object, [string] $Name)
    $value = Get-PropValue -Object $Object -Name $Name -Default 0.0
    if ($null -eq $value) { return [double]0.0 }
    return [double]$value
}

function Get-UsageConfig {
    param([string] $UsageDir)
    $retentionDays = 90
    $codexScanEnabled = $true
    $config = Read-JsonFile -Path (Join-Path $UsageDir "usage-config.json")
    if ($config) {
        if ($config.PSObject.Properties["retentionDays"] -and $config.retentionDays) { $retentionDays = [int]$config.retentionDays }
        if ($config.PSObject.Properties["codexScanEnabled"]) { $codexScanEnabled = [bool]$config.codexScanEnabled }
    }
    if ($retentionDays -lt 30) { $retentionDays = 30 }
    if ($retentionDays -gt 365) { $retentionDays = 365 }
    return @{ retentionDays = $retentionDays; codexScanEnabled = $codexScanEnabled }
}

function Read-HistoryRecords {
    param([string] $Path, [int] $RetentionDays)
    $result = @{
        records       = @()
        invalid       = 0
        unknown       = 0
        rawLines      = @()
        lineCount     = 0
        hasExpired    = $false
        firstRecord   = $null
        lastByPlatform = @{}
    }
    if (-not (Test-Path -LiteralPath $Path)) { return $result }

    $rawLines = @([System.IO.File]::ReadAllLines($Path))
    $result.rawLines = $rawLines
    $result.lineCount = $rawLines.Count
    $cutoff = [DateTime]::UtcNow.AddDays(-1 * $RetentionDays)

    foreach ($line in $rawLines) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        $record = $null
        try { $record = $line | ConvertFrom-Json } catch { $result.invalid = [int]$result.invalid + 1; continue }
        if (-not $record -or -not $record.PSObject.Properties["v"] -or [int]$record.v -ne 1) {
            $result.unknown = [int]$result.unknown + 1
            continue
        }
        $ts = ConvertTo-UtcDate -Text (Get-PropValue -Object $record -Name "ts" -Default $null)
        if (-not $ts) {
            $result.invalid = [int]$result.invalid + 1
            continue
        }
        if ($ts -lt $cutoff) { $result.hasExpired = $true }
        if (-not $result.firstRecord -or $ts -lt $result.firstRecord) { $result.firstRecord = $ts }
        $platform = [string](Get-PropValue -Object $record -Name "platform" -Default "unknown")
        if (-not $result.lastByPlatform.ContainsKey($platform) -or $ts -gt $result.lastByPlatform[$platform]) {
            $result.lastByPlatform[$platform] = $ts
        }
        $result.records += , @{ record = $record; ts = $ts; line = $line }
    }
    return $result
}

function Invoke-HistoryPrune {
    param([string] $Path, [hashtable] $History, [int] $RetentionDays)
    if (-not $History.hasExpired -or -not (Test-Path -LiteralPath $Path)) { return }

    $cutoff = [DateTime]::UtcNow.AddDays(-1 * $RetentionDays)
    $kept = New-Object "System.Collections.Generic.List[string]"
    foreach ($line in $History.rawLines) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        $drop = $false
        $record = $null
        try { $record = $line | ConvertFrom-Json } catch { $record = $null }
        if ($record -and $record.PSObject.Properties["v"] -and [int]$record.v -eq 1) {
            $ts = ConvertTo-UtcDate -Text (Get-PropValue -Object $record -Name "ts" -Default $null)
            if ($ts -and $ts -lt $cutoff) { $drop = $true }
        }
        if (-not $drop) { [void]$kept.Add($line) }
    }

    $current = @([System.IO.File]::ReadAllLines($Path))
    for ($i = [int]$History.lineCount; $i -lt $current.Count; $i++) {
        [void]$kept.Add($current[$i])
    }

    $temp = $Path + "." + [Guid]::NewGuid().ToString("N").Substring(0, 8) + ".tmp"
    $text = ""
    if ($kept.Count -gt 0) { $text = ($kept -join "`n") + "`n" }
    [System.IO.File]::WriteAllText($temp, $text, (New-Object System.Text.UTF8Encoding $false))
    Move-Item -LiteralPath $temp -Destination $Path -Force
}

function New-MetricAccumulator {
    return @{
        requests          = [long]0
        userMessages      = [long]0
        assistantMessages = [long]0
        tokensIn          = [long]0
        tokensOut         = [long]0
        cacheRead         = [long]0
        cacheWrite        = [long]0
        estCost           = [double]0.0
        costComplete      = $true
        wallSeconds       = [double]0.0
    }
}

function Add-RowToAccumulator {
    param([hashtable] $Accumulator, $Row)
    $Accumulator.requests += Get-LongValue -Object $Row -Name "calls"
    $Accumulator.tokensIn += Get-LongValue -Object $Row -Name "in"
    $Accumulator.tokensOut += Get-LongValue -Object $Row -Name "out"
    $Accumulator.cacheRead += Get-LongValue -Object $Row -Name "cacheRead"
    $Accumulator.cacheWrite += (Get-LongValue -Object $Row -Name "cache5m") + (Get-LongValue -Object $Row -Name "cache1h")
    $cost = Get-PropValue -Object $Row -Name "estCost" -Default $null
    if ($null -eq $cost) { $Accumulator.costComplete = $false }
    else { $Accumulator.estCost += [double]$cost }
}

function ConvertTo-TotalsObject {
    param([hashtable] $Accumulator)
    $ratio = 0.0
    $denom = [double]($Accumulator.tokensIn + $Accumulator.cacheRead)
    if ($denom -gt 0) { $ratio = [double]$Accumulator.cacheRead / $denom }
    return [ordered]@{
        requests          = [long]$Accumulator.requests
        userMessages      = [long]$Accumulator.userMessages
        assistantMessages = [long]$Accumulator.assistantMessages
        tokensIn          = [long]$Accumulator.tokensIn
        tokensOut         = [long]$Accumulator.tokensOut
        cacheRead         = [long]$Accumulator.cacheRead
        cacheWrite        = [long]$Accumulator.cacheWrite
        estCost           = [double]$Accumulator.estCost
        costComplete      = [bool]$Accumulator.costComplete
        wallSeconds       = [double]$Accumulator.wallSeconds
        cacheHitRatio     = [double]$ratio
    }
}

function New-WindowSummary {
    param([object[]] $Records, [double] $WindowDays, [DateTime] $NowUtc, $FirstRecordUtc)

    $cutoff = $NowUtc.AddDays(-1 * $WindowDays)
    $windowRecords = @($Records | Where-Object { $_.ts -ge $cutoff })
    $coveredDays = 0.0
    if ($FirstRecordUtc) {
        $daysSinceFirst = ($NowUtc - $FirstRecordUtc).TotalDays
        if ($daysSinceFirst -lt 0) { $daysSinceFirst = 0 }
        $coveredDays = [Math]::Min($WindowDays, $daysSinceFirst)
    }

    $totals = New-MetricAccumulator
    $perPlatform = @{}
    foreach ($platformName in @("claude", "codex")) { $perPlatform[$platformName] = New-MetricAccumulator }
    $models = @{}
    $roles = @{}

    foreach ($item in $windowRecords) {
        $record = $item.record
        $platform = [string](Get-PropValue -Object $record -Name "platform" -Default "unknown")
        if (-not $perPlatform.ContainsKey($platform)) { $perPlatform[$platform] = New-MetricAccumulator }
        $userMessages = Get-LongValue -Object $record -Name "userMessages"
        $assistantMessages = Get-LongValue -Object $record -Name "assistantMessages"
        $wallSeconds = Get-DoubleValue -Object $record -Name "wallSeconds"
        $totals.userMessages += $userMessages
        $totals.assistantMessages += $assistantMessages
        $totals.wallSeconds += $wallSeconds
        $perPlatform[$platform].userMessages += $userMessages
        $perPlatform[$platform].assistantMessages += $assistantMessages
        $perPlatform[$platform].wallSeconds += $wallSeconds

        $seenRoleKeys = New-Object "System.Collections.Generic.HashSet[string]"
        foreach ($row in @($record.rows)) {
            $model = [string](Get-PropValue -Object $row -Name "model" -Default "unknown")
            $scope = [string](Get-PropValue -Object $row -Name "scope" -Default "main")
            $modelKey = $platform + "|" + $model
            $roleKey = $platform + "|" + $scope
            if (-not $models.ContainsKey($modelKey)) {
                $models[$modelKey] = @{
                    platform    = $platform
                    model       = $model
                    acc         = New-MetricAccumulator
                    costPriced  = $true
                }
            }
            if (-not $roles.ContainsKey($roleKey)) {
                $roles[$roleKey] = @{
                    platform    = $platform
                    scope       = $scope
                    runs        = [long]0
                    tokensIn    = [long]0
                    tokensOut   = [long]0
                    estCost     = [double]0.0
                    lastUsedUtc = $item.ts
                }
            }

            Add-RowToAccumulator -Accumulator $totals -Row $row
            Add-RowToAccumulator -Accumulator $perPlatform[$platform] -Row $row
            Add-RowToAccumulator -Accumulator $models[$modelKey].acc -Row $row
            if (-not $models[$modelKey].acc.costComplete) { $models[$modelKey].costPriced = $false }

            $roles[$roleKey].tokensIn += Get-LongValue -Object $row -Name "in"
            $roles[$roleKey].tokensOut += Get-LongValue -Object $row -Name "out"
            $roleCost = Get-PropValue -Object $row -Name "estCost" -Default $null
            if ($null -ne $roleCost) { $roles[$roleKey].estCost += [double]$roleCost }
            if ($item.ts -gt $roles[$roleKey].lastUsedUtc) { $roles[$roleKey].lastUsedUtc = $item.ts }
            [void]$seenRoleKeys.Add($roleKey)
        }
        foreach ($roleKey in $seenRoleKeys) { $roles[$roleKey].runs += 1 }
    }

    $tokensPerDay = 0.0
    $costPerDay = 0.0
    if ($coveredDays -gt 0) {
        $tokensPerDay = [double]($totals.tokensIn + $totals.tokensOut) / $coveredDays
        $costPerDay = [double]$totals.estCost / $coveredDays
    }
    $costPerActiveHour = 0.0
    if ($totals.wallSeconds -ge 60) { $costPerActiveHour = [double]$totals.estCost / ($totals.wallSeconds / 3600.0) }

    $totalModelTokens = [double]($totals.tokensIn + $totals.tokensOut)
    $totalModelRequests = [double]$totals.requests
    $totalPricedCost = [double]$totals.estCost

    $modelObjects = @()
    foreach ($key in ($models.Keys | Sort-Object)) {
        $modelInfo = $models[$key]
        $acc = $modelInfo.acc
        $tokenShare = 0.0
        $requestShare = 0.0
        $costShare = 0.0
        if ($totalModelTokens -gt 0) { $tokenShare = 100.0 * [double]($acc.tokensIn + $acc.tokensOut) / $totalModelTokens }
        if ($totalModelRequests -gt 0) { $requestShare = 100.0 * [double]$acc.requests / $totalModelRequests }
        if ($modelInfo.costPriced -and $totalPricedCost -gt 0) { $costShare = 100.0 * [double]$acc.estCost / $totalPricedCost }
        $modelObjects += , ([ordered]@{
                model           = $modelInfo.model
                platform        = $modelInfo.platform
                requests        = [long]$acc.requests
                tokensIn        = [long]$acc.tokensIn
                tokensOut       = [long]$acc.tokensOut
                estCost         = [double]$acc.estCost
                costPriced      = [bool]$modelInfo.costPriced
                costSharePct    = [Math]::Round($costShare, 1)
                tokenSharePct   = [Math]::Round($tokenShare, 1)
                requestSharePct = [Math]::Round($requestShare, 1)
            })
    }

    $roleObjects = @()
    foreach ($key in ($roles.Keys | Sort-Object)) {
        $role = $roles[$key]
        $roleObjects += , ([ordered]@{
                scope       = $role.scope
                platform    = $role.platform
                runs        = [long]$role.runs
                tokensIn    = [long]$role.tokensIn
                tokensOut   = [long]$role.tokensOut
                estCost     = [double]$role.estCost
                lastUsedUtc = $role.lastUsedUtc.ToUniversalTime().ToString("o", $script:Inv)
            })
    }

    $platformObjects = @()
    foreach ($platformName in ($perPlatform.Keys | Sort-Object)) {
        $acc = $perPlatform[$platformName]
        $platformObjects += , ([ordered]@{
                platform          = $platformName
                requests          = [long]$acc.requests
                userMessages      = [long]$acc.userMessages
                assistantMessages = [long]$acc.assistantMessages
                tokensIn          = [long]$acc.tokensIn
                tokensOut         = [long]$acc.tokensOut
                cacheRead         = [long]$acc.cacheRead
                cacheWrite        = [long]$acc.cacheWrite
                estCost           = [double]$acc.estCost
                costComplete      = [bool]$acc.costComplete
            })
    }

    return [ordered]@{
        coveredDays = [double]$coveredDays
        totals      = ConvertTo-TotalsObject -Accumulator $totals
        burn        = [ordered]@{
            tokensPerDay      = [double]$tokensPerDay
            costPerDay        = [double]$costPerDay
            costPerActiveHour = [double]$costPerActiveHour
        }
        perPlatform = $platformObjects
        models      = $modelObjects
        roles       = $roleObjects
    }
}

function Write-StatsMarkdown {
    param([string] $Path, $Summary)
    $lines = @("# Usage statistics", "")
    $lines += ("Generated: " + $Summary.generatedUtc)
    $lines += ("Retention: " + $Summary.retentionDays + " day(s)")
    if ($Summary.firstRecordUtc) { $lines += ("First record: " + $Summary.firstRecordUtc) }
    $lines += ""

    if ($Summary.warnings -and $Summary.warnings.Count -gt 0) {
        $lines += "## Warnings"
        foreach ($warning in $Summary.warnings) { $lines += ("- " + $warning) }
        $lines += ""
    }

    $lines += "## Platforms"
    foreach ($platform in $Summary.platforms) {
        $last = "n/a"
        if ($platform.lastActivityUtc) { $last = $platform.lastActivityUtc }
        $lines += ("    " + $platform.platform.PadRight(12) + $platform.status.PadRight(16) + $last)
    }
    $lines += ""

    foreach ($name in @("24h", "7d", "30d")) {
        $window = $Summary.windows[$name]
        $totals = $window.totals
        $burn = $window.burn
        $costSuffix = ""
        if (-not $totals.costComplete) { $costSuffix = "+" }
        $lines += ("## " + $name)
        $lines += ("    requests " + $totals.requests + " | messages " + ($totals.userMessages + $totals.assistantMessages) + " | in " + (Format-Tokens -Value $totals.tokensIn) + " | out " + (Format-Tokens -Value $totals.tokensOut) + " | cacheR " + (Format-Tokens -Value $totals.cacheRead) + " | cacheW " + (Format-Tokens -Value $totals.cacheWrite) + " | est $" + (Format-Money -Value $totals.estCost) + $costSuffix)
        $lines += ("    burn " + (Format-Tokens -Value ([long]$burn.tokensPerDay)) + "/day | $" + (Format-Money -Value $burn.costPerDay) + "/day over " + $window.coveredDays.ToString("0.0", $script:Inv) + "d | $" + (Format-Money -Value $burn.costPerActiveHour) + "/active hour")
        $lines += "    per platform:"
        foreach ($platform in $window.perPlatform) {
            $pSuffix = ""
            if (-not $platform.costComplete) { $pSuffix = "+" }
            $lines += ("      " + $platform.platform.PadRight(10) + "req " + ([string]$platform.requests).PadRight(6) + "msg " + ([string]($platform.userMessages + $platform.assistantMessages)).PadRight(6) + "in " + (Format-Tokens -Value $platform.tokensIn).PadRight(9) + "out " + (Format-Tokens -Value $platform.tokensOut).PadRight(9) + "cacheR " + (Format-Tokens -Value $platform.cacheRead).PadRight(9) + "cacheW " + (Format-Tokens -Value $platform.cacheWrite).PadRight(9) + "$" + (Format-Money -Value $platform.estCost) + $pSuffix)
        }
        if ($window.models.Count -gt 0) {
            $lines += "    models:"
            foreach ($model in $window.models) {
                $costText = "$" + (Format-Money -Value $model.estCost)
                if (-not $model.costPriced) { $costText = "n/a cost" }
                $lines += ("      " + ($model.platform + "/" + $model.model).PadRight(34) + ([string]$model.costSharePct).PadLeft(5) + "% cost | " + ([string]$model.tokenSharePct).PadLeft(5) + "% tokens | " + ([string]$model.requestSharePct).PadLeft(5) + "% calls | " + $costText)
            }
        }
        if ($window.roles.Count -gt 0) {
            $lines += "    roles:"
            foreach ($role in @($window.roles | Sort-Object -Property @{ Expression = { $_.estCost }; Descending = $true } | Select-Object -First 10)) {
                $lines += ("      " + ($role.platform + "/" + $role.scope).PadRight(28) + "runs " + ([string]$role.runs).PadRight(5) + "tokens " + (Format-Tokens -Value ([long]($role.tokensIn + $role.tokensOut))).PadRight(9) + "est $" + (Format-Money -Value $role.estCost).PadRight(8) + "last " + $role.lastUsedUtc)
            }
        }
        $lines += ""
    }

    $text = ($lines -join "`n") + "`n"
    [System.IO.File]::WriteAllText($Path, $text, (New-Object System.Text.UTF8Encoding $false))
}

function Invoke-UsageStats {
    $agentsDir = Join-Path $ProjectRoot ".agents"
    if (-not (Test-Path -LiteralPath $agentsDir)) {
        [Console]::Error.WriteLine("usage-stats: .agents directory not found under " + $ProjectRoot)
        exit 1
    }

    $scriptDir = Split-Path -Parent $PSCommandPath
    $usageDir = Get-UsageDir -Root $ProjectRoot
    $config = Get-UsageConfig -UsageDir $usageDir
    $warnings = @()
    $codexStatus = "disabled"
    if ($config.codexScanEnabled -and -not $NoCodexScan) {
        $scan = Get-CodexRolloutRecords -ProjectRoot $ProjectRoot -UsageDir $usageDir -ScriptDir $scriptDir -RetentionDays $config.retentionDays
        $codexStatus = [string]$scan.status
        foreach ($warning in $scan.warnings) { $warnings += $warning }
    }
    elseif ($config.codexScanEnabled) {
        $codexStatus = "no-data"
    }

    $historyPath = Join-Path $usageDir "history.jsonl"
    $history = Read-HistoryRecords -Path $historyPath -RetentionDays $config.retentionDays
    if ($history.hasExpired) {
        Invoke-HistoryPrune -Path $historyPath -History $history -RetentionDays $config.retentionDays
        $history = Read-HistoryRecords -Path $historyPath -RetentionDays $config.retentionDays
    }

    if ($history.invalid -gt 0) { $warnings += ("skipped " + $history.invalid + " invalid history line(s)") }
    if ($history.unknown -gt 0) { $warnings += ("skipped " + $history.unknown + " history record(s) with unknown schema") }

    $unpriced = New-Object "System.Collections.Generic.HashSet[string]"
    foreach ($item in $history.records) {
        foreach ($row in @($item.record.rows)) {
            if ($null -eq (Get-PropValue -Object $row -Name "estCost" -Default $null)) {
                [void]$unpriced.Add(([string](Get-PropValue -Object $item.record -Name "platform" -Default "unknown")) + "/" + ([string](Get-PropValue -Object $row -Name "model" -Default "unknown")))
            }
        }
    }
    if ($unpriced.Count -gt 0) { $warnings += ("unpriced models excluded from cost: " + (($unpriced | Sort-Object) -join ", ")) }

    $now = [DateTime]::UtcNow
    $firstRecordUtc = $null
    if ($history.firstRecord) { $firstRecordUtc = $history.firstRecord.ToUniversalTime().ToString("o", $script:Inv) }

    $claudeLast = $null
    $codexLast = $null
    if ($history.lastByPlatform.ContainsKey("claude")) { $claudeLast = $history.lastByPlatform["claude"].ToUniversalTime().ToString("o", $script:Inv) }
    if ($history.lastByPlatform.ContainsKey("codex")) { $codexLast = $history.lastByPlatform["codex"].ToUniversalTime().ToString("o", $script:Inv) }
    $claudeStatus = "no-data"
    if ($claudeLast) { $claudeStatus = "ok" }
    if ($codexLast -and $codexStatus -ne "disabled" -and $codexStatus -ne "format-unknown") { $codexStatus = "ok" }

    $summary = [ordered]@{
        v              = 1
        generatedUtc   = $now.ToString("o", $script:Inv)
        retentionDays  = [int]$config.retentionDays
        firstRecordUtc = $firstRecordUtc
        platforms      = @(
            [ordered]@{ platform = "claude"; status = $claudeStatus; lastActivityUtc = $claudeLast },
            [ordered]@{ platform = "codex"; status = $codexStatus; lastActivityUtc = $codexLast },
            [ordered]@{ platform = "antigravity"; status = "unsupported"; lastActivityUtc = $null }
        )
        windows        = [ordered]@{
            "24h" = New-WindowSummary -Records $history.records -WindowDays 1 -NowUtc $now -FirstRecordUtc $history.firstRecord
            "7d"  = New-WindowSummary -Records $history.records -WindowDays 7 -NowUtc $now -FirstRecordUtc $history.firstRecord
            "30d" = New-WindowSummary -Records $history.records -WindowDays 30 -NowUtc $now -FirstRecordUtc $history.firstRecord
        }
        warnings       = $warnings
    }

    Write-JsonAtomic -Path (Join-Path $usageDir "stats-summary.json") -Value $summary
    Write-StatsMarkdown -Path (Join-Path $usageDir "usage-stats.md") -Summary $summary
    if (-not $Quiet) {
        Write-Output ("usage-stats: wrote " + (Join-Path $usageDir "stats-summary.json"))
    }
}

try {
    Invoke-UsageStats
    exit 0
}
catch {
    if (-not $Quiet) {
        [Console]::Error.WriteLine("usage-stats: " + $_.Exception.Message)
    }
    exit 0
}
