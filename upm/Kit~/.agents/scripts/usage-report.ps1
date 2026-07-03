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

$script:LiteLlmUrl = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json"
$script:RefreshAfterDays = 7      # cache older than this triggers a background refresh
$script:StaleWarnDays = 14        # cache older than this adds a staleness warning
$script:SnapshotWarnDays = 30     # snapshot-only data older than this adds a warning
$script:AttemptCooldownHours = 6  # minimum spacing between refresh attempts
$script:SeenRequestIdCap = 1500   # dedup window for usage repeated across content-block entries

$script:Inv = [System.Globalization.CultureInfo]::InvariantCulture

function Read-JsonFile {
    param([string] $Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    try { return (Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json) }
    catch { return $null }
}

function Write-JsonAtomic {
    param([string] $Path, $Value)
    $dir = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    $temp = $Path + "." + [Guid]::NewGuid().ToString("N").Substring(0, 8) + ".tmp"
    $json = $Value | ConvertTo-Json -Depth 10
    [System.IO.File]::WriteAllText($temp, $json, (New-Object System.Text.UTF8Encoding $false))
    Move-Item -LiteralPath $temp -Destination $Path -Force
}

function Get-UsageDir {
    param([string] $Root)
    $dir = Join-Path $Root ".agents\usage"
    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
    $gitignore = Join-Path $dir ".gitignore"
    if (-not (Test-Path -LiteralPath $gitignore)) {
        # Self-ignoring runtime directory: nothing under .agents/usage/ is committed.
        [System.IO.File]::WriteAllText($gitignore, "*`n", (New-Object System.Text.UTF8Encoding $false))
    }
    return $dir
}

function ConvertTo-UtcDate {
    param([string] $Text)
    if ([string]::IsNullOrWhiteSpace($Text)) { return $null }
    try {
        return [DateTime]::Parse($Text, $script:Inv, [System.Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
    }
    catch { return $null }
}

function Format-Tokens {
    param([long] $Value)
    if ($Value -ge 1000000) { return ($Value / 1000000.0).ToString("0.0", $script:Inv) + "M" }
    if ($Value -ge 1000) { return ($Value / 1000.0).ToString("0.0", $script:Inv) + "k" }
    return $Value.ToString($script:Inv)
}

function Format-Duration {
    param([double] $Seconds)
    if ($Seconds -lt 0) { $Seconds = 0 }
    $t = [TimeSpan]::FromSeconds($Seconds)
    if ($t.TotalHours -ge 1) { return ("{0}h{1:00}m" -f [int][Math]::Floor($t.TotalHours), $t.Minutes) }
    if ($t.TotalMinutes -ge 1) { return ("{0}m{1:00}s" -f $t.Minutes, $t.Seconds) }
    return ("{0}s" -f [int][Math]::Ceiling($t.TotalSeconds))
}

function Format-Money {
    param([double] $Value)
    if ($Value -gt 0 -and $Value -lt 0.01) { return "<0.01" }
    return $Value.ToString("0.00", $script:Inv)
}

function New-TokenBucket {
    return @{ calls = 0; in = [long]0; out = [long]0; cacheRead = [long]0; cache5m = [long]0; cache1h = [long]0 }
}

function Add-UsageToBucket {
    param([hashtable] $Bucket, $Usage)
    $Bucket.calls++
    if ($Usage.input_tokens) { $Bucket.in += [long]$Usage.input_tokens }
    if ($Usage.output_tokens) { $Bucket.out += [long]$Usage.output_tokens }
    if ($Usage.cache_read_input_tokens) { $Bucket.cacheRead += [long]$Usage.cache_read_input_tokens }
    $breakdown = $null
    if ($Usage.PSObject.Properties["cache_creation"]) { $breakdown = $Usage.cache_creation }
    if ($breakdown -and ($breakdown.PSObject.Properties["ephemeral_5m_input_tokens"] -or $breakdown.PSObject.Properties["ephemeral_1h_input_tokens"])) {
        if ($breakdown.ephemeral_5m_input_tokens) { $Bucket.cache5m += [long]$breakdown.ephemeral_5m_input_tokens }
        if ($breakdown.ephemeral_1h_input_tokens) { $Bucket.cache1h += [long]$breakdown.ephemeral_1h_input_tokens }
    }
    elseif ($Usage.cache_creation_input_tokens) {
        # No TTL breakdown available: count as 5-minute writes (the cheaper
        # rate), so the estimate errs low rather than inventing a premium.
        $Bucket.cache5m += [long]$Usage.cache_creation_input_tokens
    }
}

function Get-PriceTable {
    # Merges price sources into one lookup: bundled snapshot (shipped next to
    # this script) as the base, the refreshed LiteLLM cache on top, and
    # time-limited overrides (promo pricing) above both while they last.
    # Returns a hashtable: models, sourceLabel, warnings (already formatted).
    param([string] $ScriptDir, [string] $UsageDir)
    $now = [DateTime]::UtcNow
    $warnings = @()
    $models = @{}

    $snapshot = Read-JsonFile -Path (Join-Path $ScriptDir "usage-prices.json")
    $snapshotDate = $null
    if ($snapshot -and $snapshot.models) {
        $snapshotDate = ConvertTo-UtcDate -Text $snapshot.snapshot_date
        foreach ($prop in $snapshot.models.PSObject.Properties) { $models[$prop.Name] = $prop.Value }
    }

    $cache = Read-JsonFile -Path (Join-Path $UsageDir "prices.cache.json")
    $cacheDate = $null
    if ($cache -and $cache.models) {
        $cacheDate = ConvertTo-UtcDate -Text $cache.fetched_at
        foreach ($prop in $cache.models.PSObject.Properties) { $models[$prop.Name] = $prop.Value }
    }

    if ($snapshot -and $snapshot.overrides) {
        foreach ($override in $snapshot.overrides) {
            $until = ConvertTo-UtcDate -Text $override.until
            if ($until -and $now.Date -le $until.Date -and $override.prices) {
                $models[$override.model] = $override.prices
            }
        }
    }

    $meta = Read-JsonFile -Path (Join-Path $UsageDir "prices.meta.json")
    $lastAttempt = $null
    $lastSuccess = $null
    $lastError = $null
    if ($meta) {
        $lastAttempt = ConvertTo-UtcDate -Text $meta.lastAttemptUtc
        $lastSuccess = ConvertTo-UtcDate -Text $meta.lastSuccessUtc
        if ($meta.lastError) { $lastError = [string]$meta.lastError }
    }

    if ($cacheDate) {
        $sourceLabel = "litellm " + $cacheDate.ToString("yyyy-MM-dd", $script:Inv)
        $ageDays = ($now - $cacheDate).TotalDays
        if ($lastError -and $lastAttempt -and (-not $lastSuccess -or $lastAttempt -gt $lastSuccess)) {
            $warnings += ("! price refresh FAILED at " + $lastAttempt.ToString("yyyy-MM-dd HH:mm", $script:Inv) + " UTC - using prices from " + $cacheDate.ToString("yyyy-MM-dd", $script:Inv) + "; estimates may be outdated")
        }
        elseif ($ageDays -gt $script:StaleWarnDays) {
            $warnings += ("! price data is " + [int]$ageDays + " days old (refresh pending); estimates may be outdated")
        }
    }
    else {
        $label = "bundled snapshot"
        if ($snapshotDate) { $label += " " + $snapshotDate.ToString("yyyy-MM-dd", $script:Inv) }
        $sourceLabel = $label
        if ($lastError) {
            $warnings += ("! price refresh FAILED - using the " + $label + "; estimates may be outdated")
        }
        elseif ($snapshotDate -and ($now - $snapshotDate).TotalDays -gt $script:SnapshotWarnDays) {
            $warnings += ("! using the " + $label + " (no successful price refresh yet); estimates may be outdated")
        }
    }

    return @{
        models      = $models
        sourceLabel = $sourceLabel
        warnings    = $warnings
        cacheDate   = $cacheDate
        lastAttempt = $lastAttempt
    }
}

function Get-ModelPrice {
    param([hashtable] $Models, [string] $Model)
    if ([string]::IsNullOrWhiteSpace($Model)) { return $null }
    if ($Models.ContainsKey($Model)) { return $Models[$Model] }
    # Dated snapshot ids (claude-haiku-4-5-20251001) fall back to the alias.
    $stripped = $Model -replace "[-@]\d{8}$", ""
    if ($stripped -ne $Model -and $Models.ContainsKey($stripped)) { return $Models[$stripped] }
    return $null
}

function Get-BucketCost {
    # Prices are USD per million tokens. cache_write_1h falls back to
    # 1.6 x cache_write_5m (the 2.0/1.25 multiplier ratio) when a source
    # lacks the 1h rate.
    param($Price, [hashtable] $Bucket)
    $w5 = 0.0
    if ($Price.PSObject.Properties["cache_write_5m"] -and $null -ne $Price.cache_write_5m) { $w5 = [double]$Price.cache_write_5m }
    $w1 = $w5 * 1.6
    if ($Price.PSObject.Properties["cache_write_1h"] -and $null -ne $Price.cache_write_1h) { $w1 = [double]$Price.cache_write_1h }
    $cr = 0.0
    if ($Price.PSObject.Properties["cache_read"] -and $null -ne $Price.cache_read) { $cr = [double]$Price.cache_read }
    $total = ($Bucket.in * [double]$Price.in) + ($Bucket.out * [double]$Price.out) +
    ($Bucket.cacheRead * $cr) + ($Bucket.cache5m * $w5) + ($Bucket.cache1h * $w1)
    return $total / 1000000.0
}

function Update-PriceCache {
    # Background mode: fetch the LiteLLM community price feed and distill the
    # first-party Claude entries into a small local cache. Every outcome is
    # recorded in prices.meta.json so the reporter can tell the user when the
    # data could not be refreshed.
    param([string] $UsageDir)
    $metaPath = Join-Path $UsageDir "prices.meta.json"
    $meta = Read-JsonFile -Path $metaPath
    $lastSuccess = $null
    if ($meta -and $meta.lastSuccessUtc) { $lastSuccess = [string]$meta.lastSuccessUtc }
    $attempt = [DateTime]::UtcNow.ToString("o")
    try {
        try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}
        $response = Invoke-WebRequest -Uri $script:LiteLlmUrl -UseBasicParsing -TimeoutSec 90
        # The feed contains top-level keys that differ only by case, which
        # breaks ConvertFrom-Json on Windows PowerShell 5.1 (case-insensitive
        # property tables). Parse into case-sensitive dictionaries instead.
        $data = $null
        if ($PSVersionTable.PSVersion.Major -ge 6) {
            $data = $response.Content | ConvertFrom-Json -AsHashtable
        }
        else {
            Add-Type -AssemblyName System.Web.Extensions
            $serializer = New-Object System.Web.Script.Serialization.JavaScriptSerializer
            $serializer.MaxJsonLength = [int]::MaxValue
            $serializer.RecursionLimit = 1000
            $data = $serializer.DeserializeObject($response.Content)
        }
        $models = [ordered]@{}
        foreach ($key in @($data.Keys)) {
            if ($key -notmatch "^claude-[A-Za-z0-9.-]+$") { continue }
            $entry = $data[$key]
            if (-not $entry -or -not $entry.ContainsKey("input_cost_per_token") -or -not $entry.ContainsKey("output_cost_per_token")) { continue }
            $inCost = $entry["input_cost_per_token"]
            $outCost = $entry["output_cost_per_token"]
            if (-not $inCost -or -not $outCost) { continue }
            $inPerM = [Math]::Round([double]$inCost * 1000000, 4)
            $outPerM = [Math]::Round([double]$outCost * 1000000, 4)
            if ($inPerM -le 0 -or $outPerM -le 0 -or $outPerM -lt $inPerM) { continue }
            $price = [ordered]@{ "in" = $inPerM; "out" = $outPerM }
            if ($entry.ContainsKey("cache_read_input_token_cost") -and $entry["cache_read_input_token_cost"]) {
                $price["cache_read"] = [Math]::Round([double]$entry["cache_read_input_token_cost"] * 1000000, 4)
            }
            if ($entry.ContainsKey("cache_creation_input_token_cost") -and $entry["cache_creation_input_token_cost"]) {
                $price["cache_write_5m"] = [Math]::Round([double]$entry["cache_creation_input_token_cost"] * 1000000, 4)
            }
            if ($entry.ContainsKey("cache_creation_input_token_cost_above_1hr") -and $entry["cache_creation_input_token_cost_above_1hr"]) {
                $price["cache_write_1h"] = [Math]::Round([double]$entry["cache_creation_input_token_cost_above_1hr"] * 1000000, 4)
            }
            $models[$key] = $price
        }
        if ($models.Count -lt 5) { throw ("feed sanity check failed: only " + $models.Count + " claude models extracted") }
        Write-JsonAtomic -Path (Join-Path $UsageDir "prices.cache.json") -Value ([ordered]@{
                fetched_at = [DateTime]::UtcNow.ToString("o")
                source     = "litellm"
                models     = $models
            })
        Write-JsonAtomic -Path $metaPath -Value ([ordered]@{
                lastAttemptUtc = $attempt
                lastSuccessUtc = [DateTime]::UtcNow.ToString("o")
                lastError      = $null
            })
    }
    catch {
        Write-JsonAtomic -Path $metaPath -Value ([ordered]@{
                lastAttemptUtc = $attempt
                lastSuccessUtc = $lastSuccess
                lastError      = $_.Exception.Message
            })
    }
}

function Start-PriceRefreshIfDue {
    param([hashtable] $Prices, [string] $UsageDir, [string] $Root)
    $now = [DateTime]::UtcNow
    $needRefresh = $true
    if ($Prices.cacheDate -and ($now - $Prices.cacheDate).TotalDays -le $script:RefreshAfterDays) { $needRefresh = $false }
    if (-not $needRefresh) { return }
    if ($Prices.lastAttempt -and ($now - $Prices.lastAttempt).TotalHours -lt $script:AttemptCooldownHours) { return }
    # Stamp the attempt before launching so overlapping Stop events do not
    # spawn duplicate refreshers; the child rewrites the meta with the result.
    $metaPath = Join-Path $UsageDir "prices.meta.json"
    $meta = Read-JsonFile -Path $metaPath
    $lastSuccess = $null
    $lastError = $null
    if ($meta) {
        if ($meta.lastSuccessUtc) { $lastSuccess = [string]$meta.lastSuccessUtc }
        if ($meta.lastError) { $lastError = [string]$meta.lastError }
    }
    Write-JsonAtomic -Path $metaPath -Value ([ordered]@{
            lastAttemptUtc = $now.ToString("o")
            lastSuccessUtc = $lastSuccess
            lastError      = $lastError
        })
    $exe = "powershell"
    try { $exe = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName } catch {}
    $scriptPath = $PSCommandPath
    Start-Process -FilePath $exe -WindowStyle Hidden -ArgumentList @(
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ('"' + $scriptPath + '"'),
        "-RefreshPrices", "-ProjectRoot", ('"' + $Root + '"')
    ) | Out-Null
}

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
        [System.Collections.Generic.List[object]] $Intervals
    )
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
    $intervals = New-Object "System.Collections.Generic.List[object]"

    Read-TranscriptUsage -Path $transcript -State $state -Seen $seen -SeenOrder $seenOrder -Scope "main" -TurnBuckets $turnBuckets -Intervals $intervals

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
            Read-TranscriptUsage -Path $file.FullName -State $state -Seen $seen -SeenOrder $seenOrder -Scope $agentType -TurnBuckets $turnBuckets -Intervals $intervals
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
    Start-PriceRefreshIfDue -Prices $prices -UsageDir $usageDir -Root $root

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
