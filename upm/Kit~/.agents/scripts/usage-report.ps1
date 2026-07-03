# Usage and cost reporter for Claude Code sessions.
#
# Default mode runs as a Claude Code Stop hook: it reads the hook JSON from
# stdin, incrementally parses the local session transcripts (main agent plus
# every subagent under <session-dir>/subagents/), aggregates token usage per
# model and per agent role, prices it as an API-equivalent estimate, and
# returns a compact report through the hook systemMessage channel. Everything
# comes from files already on disk: zero extra LLM tokens, zero API calls.
#
# -RefreshPrices mode runs detached in the background: it downloads current
# prices from the LiteLLM community feed into .agents/usage/prices.cache.json.
# The report explicitly warns when price data could not be refreshed, so stale
# estimates are never presented as current.
#
# Transcript facts this parser relies on (verified against Claude Code 2.x):
# - assistant entries carry message.model, message.usage (with a per-TTL
#   cache_creation breakdown), timestamp, and requestId;
# - one API call is written as several entries (one per content block) that
#   repeat the same usage, so usage is counted once per requestId;
# - subagent transcripts live in <session-dir>/subagents/agent-*.jsonl with a
#   sibling agent-*.meta.json holding agentType.
# The format is internal to Claude Code; every read below is defensive and
# the hook never fails the turn - on any error it exits 0 silently.
#
# Compatible with Windows PowerShell 5.1 and pwsh 7. ASCII only.
# Runtime artifacts live in .agents/usage/ (self-gitignored).

[CmdletBinding()]
param(
    [switch] $RefreshPrices,
    [string] $ProjectRoot
)

$ErrorActionPreference = "Stop"

. (Join-Path (Split-Path -Parent $PSCommandPath) "usage-common.ps1")

$script:SeenRequestIdCap = 1500   # dedup window for usage repeated across content-block entries

function Read-ReportState {
    param([string] $Path)
    $state = @{
        files   = @{}
        seen    = New-Object "System.Collections.Generic.List[string]"
        session = @{ models = @{}; turns = 0 }
    }
    $loaded = Read-JsonFile -Path $Path
    if (-not $loaded) { return $state }
    if ($loaded.files) {
        foreach ($prop in $loaded.files.PSObject.Properties) { $state.files[$prop.Name] = [int]$prop.Value }
    }
    if ($loaded.seen) {
        foreach ($id in $loaded.seen) { [void]$state.seen.Add([string]$id) }
    }
    if ($loaded.session) {
        if ($loaded.session.turns) { $state.session.turns = [int]$loaded.session.turns }
        if ($loaded.session.models) {
            foreach ($prop in $loaded.session.models.PSObject.Properties) {
                $bucket = New-TokenBucket
                foreach ($field in @("calls", "in", "out", "cacheRead", "cache5m", "cache1h")) {
                    if ($prop.Value.PSObject.Properties[$field]) { $bucket[$field] = [long]$prop.Value.$field }
                }
                $state.session.models[$prop.Name] = $bucket
            }
        }
    }
    return $state
}

function Read-TranscriptUsage {
    # Incrementally reads one transcript .jsonl: only lines past the stored
    # offset are considered, usage is deduplicated by requestId, and the
    # interval of new activity is captured for wall-time and parallelism.
    param(
        [string] $Path,
        [hashtable] $State,
        [System.Collections.Generic.HashSet[string]] $Seen,
        [System.Collections.Generic.List[string]] $SeenOrder,
        [string] $Scope,
        [hashtable] $TurnBuckets,
        [hashtable] $MessageCounts,
        [System.Collections.Generic.List[object]] $Intervals
    )
    if (-not $MessageCounts.ContainsKey("userMessages")) { $MessageCounts["userMessages"] = 0 }
    if (-not $MessageCounts.ContainsKey("assistantMessages")) { $MessageCounts["assistantMessages"] = 0 }
    $lines = [System.IO.File]::ReadAllLines($Path)
    $offset = 0
    if ($State.files.ContainsKey($Path)) { $offset = [int]$State.files[$Path] }
    if ($offset -gt $lines.Count) { $offset = 0 }
    $minTs = $null
    $maxTs = $null
    for ($i = $offset; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]
        # Cheap timestamp extraction first; full JSON parsing only for lines
        # that can actually carry usage.
        $tsMatch = [regex]::Match($line, '"timestamp"\s*:\s*"([^"]+)"')
        if ($tsMatch.Success) {
            $ts = ConvertTo-UtcDate -Text $tsMatch.Groups[1].Value
            if ($ts) {
                if (-not $minTs -or $ts -lt $minTs) { $minTs = $ts }
                if (-not $maxTs -or $ts -gt $maxTs) { $maxTs = $ts }
            }
        }
        if ($Scope -eq "main" -and $line.IndexOf('"user"') -ge 0) {
            $userEntry = $null
            try { $userEntry = $line | ConvertFrom-Json } catch { $userEntry = $null }
            if ($userEntry -and $userEntry.type -eq "user") {
                $isMeta = $false
                $isSidechain = $false
                if ($userEntry.PSObject.Properties["isMeta"] -and $userEntry.isMeta) { $isMeta = $true }
                if ($userEntry.PSObject.Properties["isSidechain"] -and $userEntry.isSidechain) { $isSidechain = $true }
                if (-not $isMeta -and -not $isSidechain) {
                    $content = $null
                    if ($userEntry.PSObject.Properties["content"]) {
                        $content = $userEntry.content
                    }
                    elseif ($userEntry.PSObject.Properties["message"] -and $userEntry.message -and $userEntry.message.PSObject.Properties["content"]) {
                        $content = $userEntry.message.content
                    }

                    $countUser = $false
                    if ($null -ne $content) {
                        if ($content -is [string]) {
                            if (-not $content.StartsWith("<command-", [System.StringComparison]::Ordinal)) { $countUser = $true }
                        }
                        else {
                            $hasText = $false
                            $hasToolResult = $false
                            foreach ($block in @($content)) {
                                if (-not $block -or -not $block.PSObject.Properties["type"]) { continue }
                                if ($block.type -eq "text") { $hasText = $true }
                                if ($block.type -eq "tool_result") { $hasToolResult = $true }
                            }
                            if ($hasText -and -not $hasToolResult) { $countUser = $true }
                        }
                    }

                    if ($countUser) { $MessageCounts["userMessages"] = [int]$MessageCounts["userMessages"] + 1 }
                }
            }
        }
        if ($line.IndexOf('"assistant"') -lt 0 -or $line.IndexOf('"usage"') -lt 0) { continue }
        $entry = $null
        try { $entry = $line | ConvertFrom-Json } catch { continue }
        if (-not $entry -or $entry.type -ne "assistant" -or -not $entry.message) { continue }
        $usage = $entry.message.usage
        if (-not $usage) { continue }
        $dedupId = $null
        if ($entry.PSObject.Properties["requestId"] -and $entry.requestId) { $dedupId = [string]$entry.requestId }
        elseif ($entry.message.PSObject.Properties["id"] -and $entry.message.id) { $dedupId = [string]$entry.message.id }
        if ($dedupId) {
            if ($Seen.Contains($dedupId)) { continue }
            [void]$Seen.Add($dedupId)
            [void]$SeenOrder.Add($dedupId)
        }
        $model = "unknown"
        if ($entry.message.model) { $model = [string]$entry.message.model }
        # Claude Code writes placeholder entries (model "<synthetic>", zero
        # usage) for internal events; they carry no billable tokens.
        if ($model -eq "<synthetic>") { continue }
        $key = $Scope + "|" + $model
        if (-not $TurnBuckets.ContainsKey($key)) { $TurnBuckets[$key] = New-TokenBucket }
        $MessageCounts["assistantMessages"] = [int]$MessageCounts["assistantMessages"] + 1
        Add-UsageToBucket -Bucket $TurnBuckets[$key] -Usage $usage
    }
    $State.files[$Path] = $lines.Count
    if ($minTs -and $maxTs) {
        [void]$Intervals.Add(@{ scope = $Scope; from = $minTs; to = $maxTs })
    }
}

function Invoke-UsageReport {
    $raw = [Console]::In.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($raw)) { return }
    $hook = $raw | ConvertFrom-Json
    $transcript = $null
    if ($hook.PSObject.Properties["transcript_path"]) { $transcript = [string]$hook.transcript_path }
    if (-not $transcript -or -not (Test-Path -LiteralPath $transcript)) { return }
    $root = $null
    if ($hook.PSObject.Properties["cwd"] -and $hook.cwd) { $root = [string]$hook.cwd }
    if (-not $root -or -not (Test-Path -LiteralPath $root)) { $root = (Get-Location).Path }
    $sessionId = [System.IO.Path]::GetFileNameWithoutExtension($transcript)
    if ($hook.PSObject.Properties["session_id"] -and $hook.session_id) { $sessionId = [string]$hook.session_id }

    $usageDir = Get-UsageDir -Root $root
    $scriptDir = Split-Path -Parent $PSCommandPath
    $statePath = Join-Path $usageDir ("state-" + $sessionId.Substring(0, [Math]::Min(8, $sessionId.Length)) + ".json")
    $state = Read-ReportState -Path $statePath

    $seen = New-Object "System.Collections.Generic.HashSet[string]"
    foreach ($id in $state.seen) { [void]$seen.Add($id) }
    $seenOrder = $state.seen

    $turnBuckets = @{}
    $messageCounts = @{ userMessages = 0; assistantMessages = 0 }
    $intervals = New-Object "System.Collections.Generic.List[object]"

    Read-TranscriptUsage -Path $transcript -State $state -Seen $seen -SeenOrder $seenOrder -Scope "main" -TurnBuckets $turnBuckets -MessageCounts $messageCounts -Intervals $intervals

    # Subagent transcripts: <transcript-dir>/<session-id>/subagents/**/agent-*.jsonl
    # with agent-*.meta.json carrying agentType. Workflow-spawned agents live
    # one level deeper under subagents/workflows/.
    $subagentsDir = Join-Path (Join-Path (Split-Path -Parent $transcript) $sessionId) "subagents"
    $agentRuns = 0
    if (Test-Path -LiteralPath $subagentsDir) {
        foreach ($file in Get-ChildItem -LiteralPath $subagentsDir -Recurse -File -Filter "agent-*.jsonl") {
            $agentType = "subagent"
            $meta = Read-JsonFile -Path ($file.FullName -replace "\.jsonl$", ".meta.json")
            if ($meta -and $meta.agentType) { $agentType = [string]$meta.agentType }
            $before = $intervals.Count
            Read-TranscriptUsage -Path $file.FullName -State $state -Seen $seen -SeenOrder $seenOrder -Scope $agentType -TurnBuckets $turnBuckets -MessageCounts $messageCounts -Intervals $intervals
            if ($intervals.Count -gt $before) { $agentRuns++ }
        }
    }

    if ($turnBuckets.Count -eq 0) {
        # Nothing new to report; still persist advanced offsets.
        Save-ReportState -Path $statePath -State $state -SeenOrder $seenOrder
        return
    }

    # Fold the turn into session totals (per model).
    foreach ($key in $turnBuckets.Keys) {
        $model = $key.Split("|")[1]
        if (-not $state.session.models.ContainsKey($model)) { $state.session.models[$model] = New-TokenBucket }
        $target = $state.session.models[$model]
        $source = $turnBuckets[$key]
        foreach ($field in @("calls", "in", "out", "cacheRead", "cache5m", "cache1h")) { $target[$field] += $source[$field] }
    }
    $state.session.turns = [int]$state.session.turns + 1

    $prices = Get-PriceTable -ScriptDir $scriptDir -UsageDir $usageDir
    # Pass caller $PSCommandPath because dot-sourced helpers see usage-common.ps1.
    Start-PriceRefreshIfDue -Prices $prices -UsageDir $usageDir -Root $root -ReporterScript $PSCommandPath

    $unknownModels = New-Object "System.Collections.Generic.HashSet[string]"
    $turnCost = 0.0
    $rows = @()
    foreach ($key in ($turnBuckets.Keys | Sort-Object)) {
        $parts = $key.Split("|")
        $scope = $parts[0]
        $model = $parts[1]
        $bucket = $turnBuckets[$key]
        $price = Get-ModelPrice -Models $prices.models -Model $model
        $cost = $null
        if ($price) { $cost = Get-BucketCost -Price $price -Bucket $bucket; $turnCost += $cost }
        else { [void]$unknownModels.Add($model) }
        $rows += , @{ model = $model; scope = $scope; bucket = $bucket; cost = $cost }
    }
    $sessionCost = 0.0
    $sessionCostComplete = $true
    foreach ($model in $state.session.models.Keys) {
        $price = Get-ModelPrice -Models $prices.models -Model $model
        if ($price) { $sessionCost += Get-BucketCost -Price $price -Bucket $state.session.models[$model] }
        else { $sessionCostComplete = $false; [void]$unknownModels.Add($model) }
    }

    # Wall time and parallelism from new-entry intervals.
    $wallFrom = $null
    $wallTo = $null
    $agentBusy = 0.0
    foreach ($interval in $intervals) {
        if (-not $wallFrom -or $interval.from -lt $wallFrom) { $wallFrom = $interval.from }
        if (-not $wallTo -or $interval.to -gt $wallTo) { $wallTo = $interval.to }
        if ($interval.scope -ne "main") { $agentBusy += ($interval.to - $interval.from).TotalSeconds }
    }
    $wallSeconds = 0.0
    if ($wallFrom -and $wallTo) { $wallSeconds = ($wallTo - $wallFrom).TotalSeconds }

    $lines = @()
    $header = "Usage: turn " + (Format-Duration -Seconds $wallSeconds) + " | est $" + (Format-Money -Value $turnCost)
    $sessionPart = " | session $" + (Format-Money -Value $sessionCost)
    if (-not $sessionCostComplete) { $sessionPart += "+" }
    $header += $sessionPart + " (" + $state.session.turns + " turn(s))"
    $lines += $header
    foreach ($warning in $prices.warnings) { $lines += $warning }
    if ($unknownModels.Count -gt 0) {
        $lines += ("! no price data for: " + (($unknownModels | Sort-Object) -join ", ") + " - excluded from the estimate")
    }

    $multiRow = ($rows.Count -gt 1)
    if ($multiRow) {
        $lines += ("  " + "model".PadRight(26) + "agent".PadRight(24) + "calls".PadRight(7) + "input".PadRight(9) + "output".PadRight(9) + "cacheW".PadRight(9) + "cacheR".PadRight(9) + "est$")
        foreach ($row in $rows) {
            $bucket = $row.bucket
            $costText = "?"
            if ($null -ne $row.cost) { $costText = Format-Money -Value $row.cost }
            $lines += ("  " + $row.model.PadRight(26) + $row.scope.PadRight(24) + ([string]$bucket.calls).PadRight(7) +
                (Format-Tokens -Value $bucket.in).PadRight(9) + (Format-Tokens -Value $bucket.out).PadRight(9) +
                (Format-Tokens -Value ($bucket.cache5m + $bucket.cache1h)).PadRight(9) + (Format-Tokens -Value $bucket.cacheRead).PadRight(9) + $costText)
        }
    }
    else {
        $row = $rows[0]
        $bucket = $row.bucket
        $lines += ("  " + $row.model + " (" + $row.scope + "): in " + (Format-Tokens -Value $bucket.in) + " | out " + (Format-Tokens -Value $bucket.out) +
            " | cacheW " + (Format-Tokens -Value ($bucket.cache5m + $bucket.cache1h)) + " | cacheR " + (Format-Tokens -Value $bucket.cacheRead) + " | calls " + $bucket.calls)
    }
    if ($agentRuns -gt 0 -and $wallSeconds -gt 0) {
        $parallel = ($agentBusy + $wallSeconds) / $wallSeconds
        $lines += ("  agents: " + $agentRuns + " run(s) | busy " + (Format-Duration -Seconds $agentBusy) + " | parallel x" + $parallel.ToString("0.0", $script:Inv))
    }
    $lines += ("  prices: " + $prices.sourceLabel + " | API-equivalent estimate, not billing")

    Save-ReportState -Path $statePath -State $state -SeenOrder $seenOrder
    Write-LastReport -UsageDir $usageDir -TurnLines $lines -State $state -Prices $prices -SessionId $sessionId

    $message = ($lines -join "`n")
    Write-Output (@{ systemMessage = $message } | ConvertTo-Json -Compress)
    try {
        $historyRows = @()
        foreach ($row in $rows) {
            $bucket = $row.bucket
            $historyRows += , ([ordered]@{
                    model     = $row.model
                    scope     = $row.scope
                    calls     = [int]$bucket.calls
                    in        = [long]$bucket.in
                    out       = [long]$bucket.out
                    cacheRead = [long]$bucket.cacheRead
                    cache5m   = [long]$bucket.cache5m
                    cache1h   = [long]$bucket.cache1h
                    estCost   = $row.cost
                })
        }
        $historyTs = [DateTime]::UtcNow
        if ($wallTo) { $historyTs = $wallTo }
        Add-HistoryRecord -UsageDir $usageDir -Record ([ordered]@{
                v                 = 1
                ts                = $historyTs.ToUniversalTime().ToString("o", $script:Inv)
                platform          = "claude"
                source            = "session"
                sessionId         = $sessionId
                turn              = [int]$state.session.turns
                wallSeconds       = [double]$wallSeconds
                agentRuns         = [int]$agentRuns
                userMessages      = [int]$messageCounts["userMessages"]
                assistantMessages = [int]$messageCounts["assistantMessages"]
                rows              = $historyRows
            })
    }
    catch {}
}

function Save-ReportState {
    param([string] $Path, [hashtable] $State, [System.Collections.Generic.List[string]] $SeenOrder)
    while ($SeenOrder.Count -gt $script:SeenRequestIdCap) { $SeenOrder.RemoveAt(0) }
    Write-JsonAtomic -Path $Path -Value ([ordered]@{
            updatedUtc = [DateTime]::UtcNow.ToString("o")
            files      = $State.files
            seen       = @($SeenOrder)
            session    = $State.session
        })
}

function Write-LastReport {
    param([string] $UsageDir, [string[]] $TurnLines, [hashtable] $State, [hashtable] $Prices, [string] $SessionId)
    $lines = @("# Usage report", "", "Session: " + $SessionId, "Generated: " + [DateTime]::UtcNow.ToString("yyyy-MM-dd HH:mm", $script:Inv) + " UTC", "", "## Last turn", "")
    $lines += ($TurnLines | ForEach-Object { "    " + $_ })
    $lines += @("", "## Session totals", "")
    $lines += ("    " + "model".PadRight(26) + "calls".PadRight(7) + "input".PadRight(9) + "output".PadRight(9) + "cacheW".PadRight(9) + "cacheR".PadRight(9) + "est$")
    foreach ($model in ($State.session.models.Keys | Sort-Object)) {
        $bucket = $State.session.models[$model]
        $price = Get-ModelPrice -Models $Prices.models -Model $model
        $costText = "?"
        if ($price) { $costText = Format-Money -Value (Get-BucketCost -Price $price -Bucket $bucket) }
        $lines += ("    " + $model.PadRight(26) + ([string]$bucket.calls).PadRight(7) +
            (Format-Tokens -Value $bucket.in).PadRight(9) + (Format-Tokens -Value $bucket.out).PadRight(9) +
            (Format-Tokens -Value ($bucket.cache5m + $bucket.cache1h)).PadRight(9) + (Format-Tokens -Value $bucket.cacheRead).PadRight(9) + $costText)
    }
    $text = ($lines -join "`n") + "`n"
    [System.IO.File]::WriteAllText((Join-Path $UsageDir "last-report.md"), $text, (New-Object System.Text.UTF8Encoding $false))
}

# --- Entry point -------------------------------------------------------------
# The hook must never fail the turn: any unexpected error is recorded in
# .agents/usage/last-error.txt and the script exits 0 silently.

try {
    if ($RefreshPrices) {
        if (-not $ProjectRoot) { exit 0 }
        $usageDir = Get-UsageDir -Root $ProjectRoot
        Update-PriceCache -UsageDir $usageDir
        exit 0
    }
    Invoke-UsageReport
    exit 0
}
catch {
    try {
        $root = (Get-Location).Path
        $errorPath = Join-Path $root ".agents\usage\last-error.txt"
        $dir = Split-Path -Parent $errorPath
        if (Test-Path -LiteralPath $dir) {
            [System.IO.File]::WriteAllText($errorPath, ([DateTime]::UtcNow.ToString("o") + " " + $_.Exception.Message + "`n" + $_.ScriptStackTrace + "`n"), (New-Object System.Text.UTF8Encoding $false))
        }
    }
    catch {}
    exit 0
}
