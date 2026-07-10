# Shared usage reporting helpers.
#
# Compatible with Windows PowerShell 5.1 and pwsh 7. ASCII only.

$ErrorActionPreference = "Stop"

$script:LiteLlmUrl = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json"
$script:RefreshAfterDays = 7      # cache older than this triggers a background refresh
$script:StaleWarnDays = 14        # cache older than this adds a staleness warning
$script:SnapshotWarnDays = 30     # snapshot-only data older than this adds a warning
$script:AttemptCooldownHours = 6  # minimum spacing between refresh attempts

$script:Inv = [System.Globalization.CultureInfo]::InvariantCulture
$script:TokenBucketFields = @(
    "calls", "in", "out", "cacheRead", "cache5m", "cache1h",
    "longCalls", "longIn", "longOut", "longCacheRead"
)

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

function ConvertTo-UsageSafeName {
    param([string] $Value)
    if ([string]::IsNullOrWhiteSpace($Value)) { return "unknown" }
    $safe = [regex]::Replace($Value, "[^A-Za-z0-9._-]", "_")
    if ($safe.Length -gt 120) { $safe = $safe.Substring(0, 120) }
    return $safe
}

function Get-UsageStatePath {
    param([string] $UsageDir, [string] $SessionId)
    return Join-Path $UsageDir ("state-" + (ConvertTo-UsageSafeName -Value $SessionId) + ".json")
}

function ConvertTo-UtcDate {
    param($Text)
    if ($null -eq $Text) { return $null }
    if ($Text -is [DateTime]) { return ([DateTime]$Text).ToUniversalTime() }
    $value = [string]$Text
    if ([string]::IsNullOrWhiteSpace($value)) { return $null }
    try {
        return [DateTime]::Parse($value, $script:Inv, [System.Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
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
    return @{
        calls        = 0
        in           = [long]0
        out          = [long]0
        cacheRead    = [long]0
        cache5m      = [long]0
        cache1h      = [long]0
        longCalls    = 0
        longIn       = [long]0
        longOut      = [long]0
        longCacheRead = [long]0
    }
}

function Copy-TokenBucket {
    param($Source)
    $bucket = New-TokenBucket
    if (-not $Source) { return $bucket }
    foreach ($field in $script:TokenBucketFields) {
        if ($Source -is [hashtable]) {
            if ($Source.ContainsKey($field)) { $bucket[$field] = [long]$Source[$field] }
        }
        elseif ($Source.PSObject.Properties[$field]) {
            $bucket[$field] = [long]$Source.$field
        }
    }
    return $bucket
}

function Add-TokenBucket {
    param([hashtable] $Target, $Source)
    if (-not $Source) { return }
    foreach ($field in $script:TokenBucketFields) {
        $value = [long]0
        if ($Source -is [hashtable]) {
            if ($Source.ContainsKey($field)) { $value = [long]$Source[$field] }
        }
        elseif ($Source.PSObject.Properties[$field]) {
            $value = [long]$Source.$field
        }
        $Target[$field] = [long]$Target[$field] + $value
    }
}

function Subtract-TokenBucket {
    param($Current, $Previous)
    $result = New-TokenBucket
    $currentBucket = Copy-TokenBucket -Source $Current
    $previousBucket = Copy-TokenBucket -Source $Previous
    foreach ($field in $script:TokenBucketFields) {
        $currentValue = [long]$currentBucket[$field]
        $previousValue = [long]$previousBucket[$field]
        $delta = $currentValue - $previousValue
        if ($delta -lt 0) { $delta = $currentValue }
        $result[$field] = $delta
    }
    return $result
}

function ConvertTo-UsageHistoryRow {
    param($Row)
    $bucket = $Row.bucket
    return [ordered]@{
        model         = $Row.model
        effort        = $Row.effort
        scope         = $Row.scope
        calls         = [int]$bucket.calls
        in            = [long]$bucket.in
        out           = [long]$bucket.out
        cacheRead     = [long]$bucket.cacheRead
        cache5m       = [long]$bucket.cache5m
        cache1h       = [long]$bucket.cache1h
        longCalls     = [int]$bucket.longCalls
        longIn        = [long]$bucket.longIn
        longOut       = [long]$bucket.longOut
        longCacheRead = [long]$bucket.longCacheRead
        estCost       = $Row.cost
    }
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

function Merge-PriceEntry {
    param($Base, $Override)
    $merged = [ordered]@{}
    if ($Base) {
        foreach ($prop in $Base.PSObject.Properties) { $merged[$prop.Name] = $prop.Value }
    }
    if ($Override) {
        foreach ($prop in $Override.PSObject.Properties) { $merged[$prop.Name] = $prop.Value }
    }
    return [pscustomobject]$merged
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
        foreach ($prop in $cache.models.PSObject.Properties) {
            $base = $null
            if ($models.ContainsKey($prop.Name)) { $base = $models[$prop.Name] }
            $models[$prop.Name] = Merge-PriceEntry -Base $base -Override $prop.Value
        }
    }

    if ($snapshot -and $snapshot.overrides) {
        foreach ($override in $snapshot.overrides) {
            $until = ConvertTo-UtcDate -Text $override.until
            if ($until -and $now.Date -le $until.Date -and $override.prices) {
                $base = $null
                if ($models.ContainsKey([string]$override.model)) { $base = $models[[string]$override.model] }
                $models[[string]$override.model] = Merge-PriceEntry -Base $base -Override $override.prices
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
        if ($snapshotDate) {
            $sourceLabel = "merged official snapshot " + $snapshotDate.ToString("yyyy-MM-dd", $script:Inv) +
            " + litellm " + $cacheDate.ToString("yyyy-MM-dd", $script:Inv)
        }
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
    # Never infer a price from an arbitrary prefix. A newer model family may
    # have materially different rates (for example gpt-5.6-sol vs gpt-5).
    return $null
}

function Get-BucketCost {
    # Prices are USD per million tokens. cache_write_1h falls back to
    # 1.6 x cache_write_5m (the 2.0/1.25 multiplier ratio) when a source
    # lacks the 1h rate.
    param($Price, [hashtable] $Bucket)
    $short = Copy-TokenBucket -Source $Bucket
    foreach ($pair in @(
            @("calls", "longCalls"), @("in", "longIn"), @("out", "longOut"),
            @("cacheRead", "longCacheRead")
        )) {
        $short[$pair[0]] = [Math]::Max([long]0, [long]$short[$pair[0]] - [long]$short[$pair[1]])
    }

    $shortW5 = 0.0
    if ($Price.PSObject.Properties["cache_write_5m"] -and $null -ne $Price.cache_write_5m) { $shortW5 = [double]$Price.cache_write_5m }
    $shortW1 = $shortW5 * 1.6
    if ($Price.PSObject.Properties["cache_write_1h"] -and $null -ne $Price.cache_write_1h) { $shortW1 = [double]$Price.cache_write_1h }
    $shortCr = 0.0
    if ($Price.PSObject.Properties["cache_read"] -and $null -ne $Price.cache_read) { $shortCr = [double]$Price.cache_read }
    $total = ($short.in * [double]$Price.in) + ($short.out * [double]$Price.out) +
    ($short.cacheRead * $shortCr) + ($short.cache5m * $shortW5) + ($short.cache1h * $shortW1)

    if ([long]$short.longCalls -gt 0) {
        if (-not $Price.PSObject.Properties["long_in"] -or -not $Price.PSObject.Properties["long_out"]) { return $null }
        $longCr = 0.0
        if ($Price.PSObject.Properties["long_cache_read"] -and $null -ne $Price.long_cache_read) { $longCr = [double]$Price.long_cache_read }
        $total += ($short.longIn * [double]$Price.long_in) + ($short.longOut * [double]$Price.long_out) +
        ($short.longCacheRead * $longCr)
    }
    return $total / 1000000.0
}

function Update-PriceCache {
    # Background mode: fetch the LiteLLM community price feed and distill the
    # first-party Claude and OpenAI entries into a small local cache. Every
    # outcome is recorded in prices.meta.json so the reporter can tell the user
    # when the data could not be refreshed.
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
            if ($key -notmatch "^(claude-|gpt-|o[0-9]|chatgpt-|gemini-)") { continue }
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
        if ($models.Count -lt 5) { throw ("feed sanity check failed: only " + $models.Count + " priced models extracted") }
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
    param([hashtable] $Prices, [string] $UsageDir, [string] $Root, [string] $ReporterScript)
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
    if ([string]::IsNullOrWhiteSpace($ReporterScript)) { return }
    Start-Process -FilePath $exe -WindowStyle Hidden -ArgumentList @(
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ('"' + $ReporterScript + '"'),
        "-RefreshPrices", "-ProjectRoot", ('"' + $Root + '"')
    ) | Out-Null
}

function Add-HistoryRecord {
    param([string] $UsageDir, $Record)
    if ([string]::IsNullOrWhiteSpace($UsageDir) -or -not $Record) { return }
    if (-not (Test-Path -LiteralPath $UsageDir)) {
        New-Item -ItemType Directory -Force -Path $UsageDir | Out-Null
    }
    $path = Join-Path $UsageDir "history.jsonl"
    $line = $Record | ConvertTo-Json -Depth 10 -Compress
    $encoding = New-Object System.Text.UTF8Encoding $false
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        try {
            [System.IO.File]::AppendAllText($path, $line + "`n", $encoding)
            return
        }
        catch [System.IO.IOException] {
            if ($attempt -ge 3) { return }
            Start-Sleep -Milliseconds 100
        }
    }
}

function Get-UsageStableHash {
    param([string] $Value, [int] $Length = 16)
    if ($null -eq $Value) { $Value = "" }
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes([string]$Value)
        $hash = $sha.ComputeHash($bytes)
    }
    finally {
        $sha.Dispose()
    }

    $builder = New-Object System.Text.StringBuilder
    foreach ($byte in $hash) { [void]$builder.Append($byte.ToString("x2", $script:Inv)) }
    $text = $builder.ToString()
    if ($Length -gt 0 -and $text.Length -gt $Length) { return $text.Substring(0, $Length) }
    return $text
}

function Get-UsageProjectId {
    param([string] $Root)
    $normalized = ConvertTo-CodexComparablePath -Path $Root
    return "prj_" + (Get-UsageStableHash -Value $normalized -Length 16)
}

function Get-UsageV2Dir {
    param([string] $UsageDir)
    if ([string]::IsNullOrWhiteSpace($UsageDir)) { return $null }
    if (-not (Test-Path -LiteralPath $UsageDir)) {
        New-Item -ItemType Directory -Force -Path $UsageDir | Out-Null
    }
    $v2 = Join-Path $UsageDir "v2"
    foreach ($child in @("events", "state", "views", "reports")) {
        $path = Join-Path $v2 $child
        if (-not (Test-Path -LiteralPath $path)) {
            New-Item -ItemType Directory -Force -Path $path | Out-Null
        }
    }
    return $v2
}

function New-UsageV2Event {
    param(
        [string] $ProjectRoot,
        [string] $Type,
        [string] $Platform,
        [string] $SessionId,
        [string] $TraceId,
        [string] $SpanId,
        [string] $IdempotencyKey,
        [hashtable] $Source,
        $Payload,
        [string] $Confidence = "high",
        $ObservedUtc
    )
    if (-not $ObservedUtc) { $ObservedUtc = [DateTime]::UtcNow }
    $ts = ConvertTo-UtcDate -Text $ObservedUtc
    if (-not $ts) { $ts = [DateTime]::UtcNow }
    if ([string]::IsNullOrWhiteSpace($SessionId)) { $SessionId = "unknown" }
    if ([string]::IsNullOrWhiteSpace($TraceId)) { $TraceId = "trc_" + (Get-UsageStableHash -Value ($SessionId + "|" + $Type + "|" + $ts.ToString("o", $script:Inv)) -Length 24) }
    if ([string]::IsNullOrWhiteSpace($SpanId)) { $SpanId = "spn_" + (Get-UsageStableHash -Value ($TraceId + "|" + $Type) -Length 24) }
    if ([string]::IsNullOrWhiteSpace($IdempotencyKey)) { $IdempotencyKey = $Platform + "|" + $SessionId + "|" + $TraceId + "|" + $SpanId + "|" + $Type }
    if (-not $Source) { $Source = @{} }
    if (-not $Payload) { $Payload = [ordered]@{} }

    return [ordered]@{
        schemaVersion  = 2
        eventId        = "evt_" + (Get-UsageStableHash -Value $IdempotencyKey -Length 24)
        idempotencyKey = $IdempotencyKey
        observedUtc    = $ts.ToUniversalTime().ToString("o", $script:Inv)
        source         = [ordered]@{
            platform   = $Platform
            adapter    = $(if ($Source.ContainsKey("adapter")) { [string]$Source.adapter } else { "hook" })
            path       = $(if ($Source.ContainsKey("path")) { [string]$Source.path } else { $null })
            offset     = $(if ($Source.ContainsKey("offset")) { $Source.offset } else { $null })
            confidence = $Confidence
        }
        project        = [ordered]@{
            projectId = Get-UsageProjectId -Root $ProjectRoot
            rootHash  = Get-UsageStableHash -Value (ConvertTo-CodexComparablePath -Path $ProjectRoot) -Length 24
        }
        sessionId      = $SessionId
        traceId        = $TraceId
        spanId         = $SpanId
        type           = $Type
        payload        = $Payload
    }
}

function Add-UsageV2Event {
    param([string] $UsageDir, $Event)
    if ([string]::IsNullOrWhiteSpace($UsageDir) -or -not $Event) { return }
    $v2 = Get-UsageV2Dir -UsageDir $UsageDir
    if ([string]::IsNullOrWhiteSpace($v2)) { return }
    $ts = ConvertTo-UtcDate -Text $Event.observedUtc
    if (-not $ts) { $ts = [DateTime]::UtcNow }
    $path = Join-Path (Join-Path $v2 "events") ($ts.ToUniversalTime().ToString("yyyy-MM-dd", $script:Inv) + ".jsonl")
    $line = $Event | ConvertTo-Json -Depth 12 -Compress
    $encoding = New-Object System.Text.UTF8Encoding $false
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        try {
            [System.IO.File]::AppendAllText($path, $line + "`n", $encoding)
            return
        }
        catch [System.IO.IOException] {
            if ($attempt -ge 3) { return }
            Start-Sleep -Milliseconds 100
        }
    }
}

function ConvertTo-UsageV2RowObject {
    param($Row)
    $bucket = $Row.bucket
    $cost = $null
    if ($null -ne $Row.cost) { $cost = [double]$Row.cost }
    return [ordered]@{
        model            = [string]$Row.model
        effort           = if ($Row.PSObject.Properties["effort"] -or ($Row -is [hashtable] -and $Row.ContainsKey("effort"))) { [string]$Row.effort } else { "unspecified" }
        scope            = [string]$Row.scope
        calls            = [int]$bucket.calls
        inputTokens      = [long]$bucket.in
        outputTokens     = [long]$bucket.out
        cacheReadTokens  = [long]$bucket.cacheRead
        cacheWriteTokens = [long]($bucket.cache5m + $bucket.cache1h)
        cache5mTokens    = [long]$bucket.cache5m
        cache1hTokens    = [long]$bucket.cache1h
        longContextCalls = [int]$bucket.longCalls
        longInputTokens  = [long]$bucket.longIn
        longOutputTokens = [long]$bucket.longOut
        longCacheReadTokens = [long]$bucket.longCacheRead
        estimatedCostUsd = $cost
    }
}

function Get-UsageV2EventProperty {
    param($Object, [string] $Name, $Default = $null)
    if (-not $Object) { return $Default }
    if ($Object.PSObject.Properties[$Name]) { return $Object.PSObject.Properties[$Name].Value }
    return $Default
}

function Get-UsageV2EventNumber {
    param($Object, [string] $Name, [double] $Default = 0.0)
    $value = Get-UsageV2EventProperty -Object $Object -Name $Name -Default $Default
    if ($null -eq $value) { return $Default }
    try { return [double]$value } catch { return $Default }
}

function Get-UsageV2Events {
    param([string] $UsageDir)
    $events = @()
    $v2 = Get-UsageV2Dir -UsageDir $UsageDir
    if ([string]::IsNullOrWhiteSpace($v2)) { return @() }
    $eventsDir = Join-Path $v2 "events"
    if (-not (Test-Path -LiteralPath $eventsDir)) { return @() }
    $seen = New-Object "System.Collections.Generic.HashSet[string]"
    foreach ($file in Get-ChildItem -LiteralPath $eventsDir -File -Filter "*.jsonl" -ErrorAction SilentlyContinue) {
        foreach ($line in [System.IO.File]::ReadAllLines($file.FullName)) {
            if ([string]::IsNullOrWhiteSpace($line)) { continue }
            $event = $null
            try { $event = $line | ConvertFrom-Json } catch { $event = $null }
            if (-not $event) { continue }
            if ([int](Get-UsageV2EventProperty -Object $event -Name "schemaVersion" -Default 0) -ne 2) { continue }
            $key = [string](Get-UsageV2EventProperty -Object $event -Name "idempotencyKey" -Default "")
            if ([string]::IsNullOrWhiteSpace($key)) { $key = [string](Get-UsageV2EventProperty -Object $event -Name "eventId" -Default ([Guid]::NewGuid().ToString("N"))) }
            if ($seen.Contains($key)) { continue }
            [void]$seen.Add($key)
            $events += , $event
        }
    }
    return @($events)
}

function Update-UsageV2CurrentSessionViewFromEvents {
    param([string] $UsageDir, [string] $ProjectRoot)
    $events = @(Get-UsageV2Events -UsageDir $UsageDir)
    if ($events.Count -eq 0) { return @{ status = "no-data"; sessions = 0 } }

    $sessionEvents = @($events | Where-Object { [string](Get-UsageV2EventProperty -Object $_ -Name "type" -Default "") -eq "session.observed" } | Sort-Object -Property @{ Expression = { ConvertTo-UtcDate -Text (Get-UsageV2EventProperty -Object $_ -Name "observedUtc" -Default $null) } })
    if ($sessionEvents.Count -eq 0) { return @{ status = "no-session"; sessions = 0 } }
    $latestSessionEvent = $sessionEvents[$sessionEvents.Count - 1]
    $sessionId = [string](Get-UsageV2EventProperty -Object $latestSessionEvent -Name "sessionId" -Default "unknown")
    $platform = [string](Get-UsageV2EventProperty -Object (Get-UsageV2EventProperty -Object $latestSessionEvent -Name "source" -Default $null) -Name "platform" -Default "")
    if ([string]::IsNullOrWhiteSpace($platform)) { $platform = "unknown" }
    $sessionPayload = Get-UsageV2EventProperty -Object $latestSessionEvent -Name "payload" -Default $null

    $traceEvents = @($events | Where-Object {
            [string](Get-UsageV2EventProperty -Object $_ -Name "sessionId" -Default "") -eq $sessionId -and
            [string](Get-UsageV2EventProperty -Object $_ -Name "type" -Default "") -eq "trace.ended"
        } | Sort-Object -Property @{ Expression = { ConvertTo-UtcDate -Text (Get-UsageV2EventProperty -Object $_ -Name "observedUtc" -Default $null) } })
    $latestTrace = $null
    if ($traceEvents.Count -gt 0) { $latestTrace = $traceEvents[$traceEvents.Count - 1] }
    $latestTraceId = [string](Get-UsageV2EventProperty -Object $latestTrace -Name "traceId" -Default "")

    $usageEvents = @($events | Where-Object {
            [string](Get-UsageV2EventProperty -Object $_ -Name "sessionId" -Default "") -eq $sessionId -and
            [string](Get-UsageV2EventProperty -Object $_ -Name "type" -Default "") -eq "span.usage"
        })
    $agentEvents = @($events | Where-Object {
            [string](Get-UsageV2EventProperty -Object $_ -Name "sessionId" -Default "") -eq $sessionId -and
            [string](Get-UsageV2EventProperty -Object $_ -Name "type" -Default "") -eq "agent.ended"
        })
    $toolEvents = @($events | Where-Object {
            [string](Get-UsageV2EventProperty -Object $_ -Name "sessionId" -Default "") -eq $sessionId -and
            [string](Get-UsageV2EventProperty -Object $_ -Name "type" -Default "") -eq "tool.completed"
        })

    $lastRows = @()
    $totalByModel = @{}
    $warnings = New-Object "System.Collections.Generic.List[string]"
    foreach ($warning in @((Get-UsageV2EventProperty -Object $sessionPayload -Name "warnings" -Default @()))) {
        $text = [string]$warning
        if (-not [string]::IsNullOrWhiteSpace($text) -and -not $warnings.Contains($text)) {
            [void]$warnings.Add($text)
        }
    }
    $unpricedModels = New-Object "System.Collections.Generic.HashSet[string]"
    $sessionCost = 0.0
    $sessionCostComplete = $true
    foreach ($event in $usageEvents) {
        $payload = Get-UsageV2EventProperty -Object $event -Name "payload" -Default $null
        if (-not $payload) { continue }
        $model = [string](Get-UsageV2EventProperty -Object $payload -Name "model" -Default "unknown")
        $effort = [string](Get-UsageV2EventProperty -Object $payload -Name "effort" -Default "unspecified")
        $modelKey = $model + "|" + $effort
        if (-not $totalByModel.ContainsKey($modelKey)) {
            $totalByModel[$modelKey] = [ordered]@{
                model            = $model
                effort           = $effort
                calls            = [int]0
                inputTokens      = [long]0
                outputTokens     = [long]0
                cacheReadTokens  = [long]0
                cacheWriteTokens = [long]0
                cache5mTokens    = [long]0
                cache1hTokens    = [long]0
                longContextCalls = [int]0
                longInputTokens  = [long]0
                longOutputTokens = [long]0
                longCacheReadTokens = [long]0
                estimatedCostUsd = [double]0.0
                costComplete     = $true
            }
        }
        $target = $totalByModel[$modelKey]
        $target.calls += [int](Get-UsageV2EventNumber -Object $payload -Name "calls" -Default 0.0)
        $target.inputTokens += [long](Get-UsageV2EventNumber -Object $payload -Name "inputTokens" -Default 0.0)
        $target.outputTokens += [long](Get-UsageV2EventNumber -Object $payload -Name "outputTokens" -Default 0.0)
        $target.cacheReadTokens += [long](Get-UsageV2EventNumber -Object $payload -Name "cacheReadTokens" -Default 0.0)
        $target.cacheWriteTokens += [long](Get-UsageV2EventNumber -Object $payload -Name "cacheWriteTokens" -Default 0.0)
        $target.cache5mTokens += [long](Get-UsageV2EventNumber -Object $payload -Name "cache5mTokens" -Default 0.0)
        $target.cache1hTokens += [long](Get-UsageV2EventNumber -Object $payload -Name "cache1hTokens" -Default 0.0)
        $target.longContextCalls += [int](Get-UsageV2EventNumber -Object $payload -Name "longContextCalls" -Default 0.0)
        $target.longInputTokens += [long](Get-UsageV2EventNumber -Object $payload -Name "longInputTokens" -Default 0.0)
        $target.longOutputTokens += [long](Get-UsageV2EventNumber -Object $payload -Name "longOutputTokens" -Default 0.0)
        $target.longCacheReadTokens += [long](Get-UsageV2EventNumber -Object $payload -Name "longCacheReadTokens" -Default 0.0)
        $cost = Get-UsageV2EventProperty -Object $payload -Name "estimatedCostUsd" -Default $null
        if ($null -eq $cost) {
            $target.costComplete = $false
            $sessionCostComplete = $false
            [void]$unpricedModels.Add($model)
        }
        else {
            $target.estimatedCostUsd = [double]$target.estimatedCostUsd + [double]$cost
            $sessionCost += [double]$cost
        }
        if ($latestTraceId -and [string](Get-UsageV2EventProperty -Object $event -Name "traceId" -Default "") -eq $latestTraceId) {
            $lastRows += , $payload
        }
    }

    $totalRows = @()
    foreach ($modelKey in ($totalByModel.Keys | Sort-Object)) {
        $row = $totalByModel[$modelKey]
        $totalRows += , ([ordered]@{
                model            = $row.model
                effort           = $row.effort
                calls            = [int]$row.calls
                inputTokens      = [long]$row.inputTokens
                outputTokens     = [long]$row.outputTokens
                cacheReadTokens  = [long]$row.cacheReadTokens
                cacheWriteTokens = [long]$row.cacheWriteTokens
                cache5mTokens    = [long]$row.cache5mTokens
                cache1hTokens    = [long]$row.cache1hTokens
                longContextCalls = [int]$row.longContextCalls
                longInputTokens  = [long]$row.longInputTokens
                longOutputTokens = [long]$row.longOutputTokens
                longCacheReadTokens = [long]$row.longCacheReadTokens
                estimatedCostUsd = $(if ($row.costComplete) { [double]$row.estimatedCostUsd } else { $null })
            })
    }
    $snapshotModels = @((Get-UsageV2EventProperty -Object $sessionPayload -Name "models" -Default @()))
    if ($snapshotModels.Count -gt 0) {
        $totalRows = @($snapshotModels)
        $snapshotCost = Get-UsageV2EventProperty -Object $sessionPayload -Name "estimatedCostUsd" -Default $null
        if ($null -ne $snapshotCost) { $sessionCost = [double]$snapshotCost }
        $sessionCostComplete = [bool](Get-UsageV2EventProperty -Object $sessionPayload -Name "costComplete" -Default $sessionCostComplete)
    }

    $agentsByRole = @{}
    foreach ($event in $agentEvents) {
        $payload = Get-UsageV2EventProperty -Object $event -Name "payload" -Default $null
        $role = [string](Get-UsageV2EventProperty -Object $payload -Name "role" -Default "")
        if ([string]::IsNullOrWhiteSpace($role)) { continue }
        if (-not $agentsByRole.ContainsKey($role)) {
            $agentsByRole[$role] = [ordered]@{
                role         = $role
                runs         = [int]0
                tokensIn     = [long]0
                tokensOut    = [long]0
                estCost      = [double]0.0
                costComplete = $true
                lastUsedUtc  = $null
            }
        }
        $agentsByRole[$role].runs = [int]$agentsByRole[$role].runs + [int](Get-UsageV2EventNumber -Object $payload -Name "runs" -Default 1.0)
        $agentsByRole[$role].tokensIn = [long]$agentsByRole[$role].tokensIn + [long](Get-UsageV2EventNumber -Object $payload -Name "tokensIn" -Default 0.0)
        $agentsByRole[$role].tokensOut = [long]$agentsByRole[$role].tokensOut + [long](Get-UsageV2EventNumber -Object $payload -Name "tokensOut" -Default 0.0)
        $cost = Get-UsageV2EventProperty -Object $payload -Name "estCost" -Default $null
        if ($null -eq $cost) {
            $agentsByRole[$role].costComplete = $false
        }
        else {
            $agentsByRole[$role].estCost = [double]$agentsByRole[$role].estCost + [double]$cost
        }
        $observed = [string](Get-UsageV2EventProperty -Object $event -Name "observedUtc" -Default "")
        if ($observed) { $agentsByRole[$role].lastUsedUtc = $observed }
    }
    $agentRows = @()
    foreach ($role in ($agentsByRole.Keys | Sort-Object)) { $agentRows += , $agentsByRole[$role] }

    $toolsByKey = @{}
    foreach ($event in $toolEvents) {
        $payload = Get-UsageV2EventProperty -Object $event -Name "payload" -Default $null
        $name = [string](Get-UsageV2EventProperty -Object $payload -Name "name" -Default "")
        if ([string]::IsNullOrWhiteSpace($name)) { continue }
        $kind = [string](Get-UsageV2EventProperty -Object $payload -Name "kind" -Default "tool")
        $key = $kind + "|" + $name
        if (-not $toolsByKey.ContainsKey($key)) {
            $toolsByKey[$key] = [ordered]@{ name = $name; kind = $kind; calls = [int]0; failures = [int]0; lastUsedUtc = $null }
        }
        $toolsByKey[$key].calls = [int]$toolsByKey[$key].calls + [int](Get-UsageV2EventNumber -Object $payload -Name "calls" -Default 1.0)
        $toolsByKey[$key].failures = [int]$toolsByKey[$key].failures + [int](Get-UsageV2EventNumber -Object $payload -Name "failures" -Default 0.0)
        $observed = [string](Get-UsageV2EventProperty -Object $event -Name "observedUtc" -Default "")
        if ($observed) { $toolsByKey[$key].lastUsedUtc = $observed }
    }
    $toolRows = @()
    foreach ($key in ($toolsByKey.Keys | Sort-Object)) { $toolRows += , $toolsByKey[$key] }
    if ($sessionPayload -and $sessionPayload.PSObject.Properties["tools"]) {
        $toolRows = @((Get-UsageV2EventProperty -Object $sessionPayload -Name "tools" -Default @()))
    }

    $tracePayload = Get-UsageV2EventProperty -Object $latestTrace -Name "payload" -Default $null
    $turnCost = 0.0
    $turnCostComplete = $true
    foreach ($row in @($lastRows)) {
        $cost = Get-UsageV2EventProperty -Object $row -Name "estimatedCostUsd" -Default $null
        if ($null -ne $cost) { $turnCost += [double]$cost }
        else { $turnCostComplete = $false }
    }
    if ($latestTrace) {
        $turnCostComplete = [bool](Get-UsageV2EventProperty -Object $tracePayload -Name "costComplete" -Default $turnCostComplete)
    }
    $turns = [int](Get-UsageV2EventNumber -Object $sessionPayload -Name "turns" -Default ([double]$traceEvents.Count))
    $aliases = @()
    foreach ($alias in @((Get-UsageV2EventProperty -Object $sessionPayload -Name "aliases" -Default @()))) {
        if (-not [string]::IsNullOrWhiteSpace([string]$alias)) { $aliases += [string]$alias }
    }
    if ($unpricedModels.Count -gt 0) {
        $unpricedWarning = "! no price data for: " + (($unpricedModels | Sort-Object) -join ", ") + " - excluded from the estimate"
        if (-not $warnings.Contains($unpricedWarning)) { [void]$warnings.Add($unpricedWarning) }
    }

    $view = [ordered]@{
        v                = 2
        generatedUtc     = [DateTime]::UtcNow.ToUniversalTime().ToString("o", $script:Inv)
        projectId        = Get-UsageProjectId -Root $ProjectRoot
        platform         = $platform
        sessionId        = $sessionId
        aliases          = @($aliases)
        sourceConfidence = [string](Get-UsageV2EventProperty -Object $sessionPayload -Name "sourceConfidence" -Default "high")
        status           = "ok"
        priceSource      = [string](Get-UsageV2EventProperty -Object $sessionPayload -Name "priceSource" -Default "unknown")
        warnings         = @($warnings)
        lastTurn         = [ordered]@{
            traceId           = $latestTraceId
            turn              = [int](Get-UsageV2EventNumber -Object $tracePayload -Name "turn" -Default ([double]$turns))
            durationSeconds   = [double](Get-UsageV2EventNumber -Object $tracePayload -Name "durationSeconds" -Default 0.0)
            estimatedCostUsd  = $(if ($turnCostComplete) { [double]$turnCost } else { $null })
            costComplete      = [bool]$turnCostComplete
            agentRuns         = [int](Get-UsageV2EventNumber -Object $tracePayload -Name "agentRuns" -Default 0.0)
            userMessages      = [int](Get-UsageV2EventNumber -Object $tracePayload -Name "userMessages" -Default 0.0)
            assistantMessages = [int](Get-UsageV2EventNumber -Object $tracePayload -Name "assistantMessages" -Default 0.0)
            rows              = @($lastRows)
        }
        totals           = [ordered]@{
            turns            = [int]$turns
            estimatedCostUsd = [double]$sessionCost
            costComplete     = [bool]$sessionCostComplete
            models           = $totalRows
            agents           = $agentRows
            tools            = $toolRows
        }
    }

    $v2 = Get-UsageV2Dir -UsageDir $UsageDir
    Write-JsonAtomic -Path (Join-Path (Join-Path $v2 "views") "current-session.json") -Value $view
    Write-JsonAtomic -Path (Join-Path (Join-Path $v2 "views") "agent-summary.json") -Value ([ordered]@{
            v            = 2
            generatedUtc = [DateTime]::UtcNow.ToUniversalTime().ToString("o", $script:Inv)
            sessionId    = $sessionId
            agents       = $agentRows
        })
    Write-JsonAtomic -Path (Join-Path (Join-Path $v2 "views") "tool-summary.json") -Value ([ordered]@{
            v            = 2
            generatedUtc = [DateTime]::UtcNow.ToUniversalTime().ToString("o", $script:Inv)
            sessionId    = $sessionId
            tools        = $toolRows
        })
    return @{ status = "ok"; sessions = $sessionEvents.Count; events = $events.Count }
}

function Import-UsageV1HistoryToV2 {
    param([string] $UsageDir, [string] $ProjectRoot)
    $historyPath = Join-Path $UsageDir "history.jsonl"
    if (-not (Test-Path -LiteralPath $historyPath)) { return @{ status = "no-history"; imported = 0 } }

    $v2 = Get-UsageV2Dir -UsageDir $UsageDir
    $statePath = Join-Path (Join-Path $v2 "state") "migrations.json"
    $imported = @{}
    $state = Read-JsonFile -Path $statePath
    if ($state -and $state.importedHistory) {
        foreach ($prop in $state.importedHistory.PSObject.Properties) {
            $imported[$prop.Name] = [string]$prop.Value
        }
    }

    $count = 0
    $lineNumber = 0
    foreach ($line in [System.IO.File]::ReadAllLines($historyPath)) {
        $lineNumber++
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        $hash = Get-UsageStableHash -Value $line -Length 32
        if ($imported.ContainsKey($hash)) { continue }

        $record = $null
        try { $record = $line | ConvertFrom-Json } catch { $record = $null }
        if (-not $record -or -not $record.PSObject.Properties["v"] -or [int]$record.v -ne 1) { continue }
        $ts = ConvertTo-UtcDate -Text (Get-UsageV2EventProperty -Object $record -Name "ts" -Default $null)
        if (-not $ts) { $ts = [DateTime]::UtcNow }
        $platform = [string](Get-UsageV2EventProperty -Object $record -Name "platform" -Default "unknown")
        $sourceSessionId = [string](Get-UsageV2EventProperty -Object $record -Name "sessionId" -Default "unknown")
        $sessionId = "hist_" + (Get-UsageStableHash -Value ($platform + "|" + $sourceSessionId) -Length 24)
        $traceId = "trc_" + (Get-UsageStableHash -Value ("v1-history|" + $hash) -Length 24)
        $event = New-UsageV2Event -ProjectRoot $ProjectRoot -Type "migration.imported" -Platform $platform -SessionId $sessionId -TraceId $traceId -SpanId ("spn_" + (Get-UsageStableHash -Value ($traceId + "|migration") -Length 24)) -IdempotencyKey ("v1-history|" + $hash) -Source @{ adapter = "v1-history"; path = $historyPath; offset = $lineNumber } -ObservedUtc $ts -Payload ([ordered]@{
                sourceSessionId = $sourceSessionId
                sourceTurn      = Get-UsageV2EventProperty -Object $record -Name "turn" -Default $null
                platform        = $platform
                record          = $record
            })
        Add-UsageV2Event -UsageDir $UsageDir -Event $event
        $imported[$hash] = [DateTime]::UtcNow.ToUniversalTime().ToString("o", $script:Inv)
        $count++
    }

    Write-JsonAtomic -Path $statePath -Value ([ordered]@{
            updatedUtc      = [DateTime]::UtcNow.ToUniversalTime().ToString("o", $script:Inv)
            importedHistory = $imported
        })
    return @{ status = "ok"; imported = $count }
}

function Write-UsageV2SessionSnapshot {
    param(
        [string] $UsageDir,
        [string] $ProjectRoot,
        [string] $PlatformName,
        [string] $SessionId,
        [string[]] $AliasSessionIds = @(),
        [hashtable] $State,
        [hashtable] $Prices,
        [object[]] $Rows,
        [double] $TurnCost,
        [bool] $TurnCostComplete = $true,
        [double] $SessionCost,
        [bool] $SessionCostComplete,
        [double] $WallSeconds,
        [int] $AgentRuns,
        [hashtable] $MessageCounts,
        [hashtable] $ToolCounts,
        [string[]] $Warnings = @()
    )
    if ([string]::IsNullOrWhiteSpace($UsageDir) -or [string]::IsNullOrWhiteSpace($SessionId) -or -not $State) { return }
    $v2 = Get-UsageV2Dir -UsageDir $UsageDir
    if ([string]::IsNullOrWhiteSpace($v2)) { return }

    $observed = [DateTime]::UtcNow
    $projectId = Get-UsageProjectId -Root $ProjectRoot
    $turnOrdinal = [int]$State.session.turns
    $sampleOrdinal = $turnOrdinal
    if ($State.session.ContainsKey("samples")) { $sampleOrdinal = [int]$State.session.samples }
    $traceId = "trc_" + (Get-UsageStableHash -Value ($projectId + "|" + $PlatformName + "|" + $SessionId + "|sample|" + $sampleOrdinal) -Length 24)
    $source = @{ adapter = "hook"; path = $null; offset = $null }
    $safeAliases = @()
    foreach ($alias in @($AliasSessionIds)) {
        if (-not [string]::IsNullOrWhiteSpace($alias) -and $alias -ne $SessionId) { $safeAliases += [string]$alias }
    }

    $turnRows = @()
    foreach ($row in @($Rows)) {
        $turnRows += , (ConvertTo-UsageV2RowObject -Row $row)
    }

    $agentRowsByRole = @{}
    foreach ($row in @($turnRows)) {
        $scope = [string]$row.scope
        if ($scope -eq "main" -or [string]::IsNullOrWhiteSpace($scope)) { continue }
        if (-not $agentRowsByRole.ContainsKey($scope)) {
            $agentRowsByRole[$scope] = [ordered]@{
                role        = $scope
                runs        = [int]0
                tokensIn    = [long]0
                tokensOut   = [long]0
                estCost     = [double]0.0
                costComplete = $true
                lastUsedUtc = $observed.ToUniversalTime().ToString("o", $script:Inv)
            }
        }
        $agentRowsByRole[$scope].runs = [int]$agentRowsByRole[$scope].runs + 1
        $agentRowsByRole[$scope].tokensIn = [long]$agentRowsByRole[$scope].tokensIn + [long]$row.inputTokens
        $agentRowsByRole[$scope].tokensOut = [long]$agentRowsByRole[$scope].tokensOut + [long]$row.outputTokens
        if ($null -eq $row.estimatedCostUsd) { $agentRowsByRole[$scope].costComplete = $false }
        else { $agentRowsByRole[$scope].estCost = [double]$agentRowsByRole[$scope].estCost + [double]$row.estimatedCostUsd }
    }
    $agentRows = @()
    foreach ($role in ($agentRowsByRole.Keys | Sort-Object)) { $agentRows += , $agentRowsByRole[$role] }

    $toolRows = @()
    if ($ToolCounts) {
        foreach ($key in ($ToolCounts.Keys | Sort-Object)) {
            $tool = $ToolCounts[$key]
            $toolRows += , ([ordered]@{
                    name        = [string]$tool.name
                    kind        = [string]$tool.kind
                    calls       = [int]$tool.calls
                    failures    = [int]$tool.failures
                    lastUsedUtc = $observed.ToUniversalTime().ToString("o", $script:Inv)
                })
        }
    }
    $totalToolRows = @($toolRows)
    if ($State.session.ContainsKey("tools")) {
        $totalToolRows = @()
        foreach ($key in ($State.session.tools.Keys | Sort-Object)) {
            $tool = $State.session.tools[$key]
            $totalToolRows += , ([ordered]@{
                    name        = [string]$tool.name
                    kind        = [string]$tool.kind
                    calls       = [int]$tool.calls
                    failures    = [int]$tool.failures
                    lastUsedUtc = $observed.ToUniversalTime().ToString("o", $script:Inv)
                })
        }
    }

    $totalRows = @()
    foreach ($sessionKey in ($State.session.models.Keys | Sort-Object)) {
        $parts = @($sessionKey -split '\|', 2)
        $model = $parts[0]
        $effort = if ($parts.Count -gt 1) { $parts[1] } else { "unspecified" }
        $bucket = $State.session.models[$sessionKey]
        $price = Get-ModelPrice -Models $Prices.models -Model $model
        $cost = $null
        if ($price) { $cost = Get-BucketCost -Price $price -Bucket $bucket }
        $totalRows += , ([ordered]@{
                model            = [string]$model
                effort           = [string]$effort
                calls            = [int]$bucket.calls
                inputTokens      = [long]$bucket.in
                outputTokens     = [long]$bucket.out
                cacheReadTokens  = [long]$bucket.cacheRead
                cacheWriteTokens = [long]($bucket.cache5m + $bucket.cache1h)
                cache5mTokens    = [long]$bucket.cache5m
                cache1hTokens    = [long]$bucket.cache1h
                longContextCalls = [int]$bucket.longCalls
                longInputTokens  = [long]$bucket.longIn
                longOutputTokens = [long]$bucket.longOut
                longCacheReadTokens = [long]$bucket.longCacheRead
                estimatedCostUsd = $cost
            })
    }

    $view = [ordered]@{
        v                = 2
        generatedUtc     = $observed.ToUniversalTime().ToString("o", $script:Inv)
        projectId        = $projectId
        platform         = $PlatformName
        sessionId        = $SessionId
        aliases          = @($safeAliases)
        sourceConfidence = "high"
        status           = "ok"
        priceSource      = $Prices.sourceLabel
        warnings         = @($Warnings)
        lastTurn         = [ordered]@{
            traceId           = $traceId
            turn              = [int]$turnOrdinal
            durationSeconds   = [double]$WallSeconds
            estimatedCostUsd  = $(if ($TurnCostComplete) { [double]$TurnCost } else { $null })
            costComplete      = [bool]$TurnCostComplete
            agentRuns         = [int]$AgentRuns
            userMessages      = [int]$MessageCounts["userMessages"]
            assistantMessages = [int]$MessageCounts["assistantMessages"]
            rows              = $turnRows
        }
        totals           = [ordered]@{
            turns            = [int]$State.session.turns
            estimatedCostUsd = [double]$SessionCost
            costComplete     = [bool]$SessionCostComplete
            models           = $totalRows
            agents           = $agentRows
            tools            = $totalToolRows
        }
    }
    Write-JsonAtomic -Path (Join-Path (Join-Path $v2 "views") "current-session.json") -Value $view
    Write-JsonAtomic -Path (Join-Path (Join-Path $v2 "views") "agent-summary.json") -Value ([ordered]@{
            v            = 2
            generatedUtc = $observed.ToUniversalTime().ToString("o", $script:Inv)
            sessionId    = $SessionId
            agents       = $agentRows
        })
    Write-JsonAtomic -Path (Join-Path (Join-Path $v2 "views") "tool-summary.json") -Value ([ordered]@{
            v            = 2
            generatedUtc = $observed.ToUniversalTime().ToString("o", $script:Inv)
            sessionId    = $SessionId
            tools        = $totalToolRows
        })

    $sessionEvent = New-UsageV2Event -ProjectRoot $ProjectRoot -Type "session.observed" -Platform $PlatformName -SessionId $SessionId -TraceId $traceId -SpanId ("spn_" + (Get-UsageStableHash -Value ($traceId + "|session") -Length 24)) -IdempotencyKey ("usage-report|" + $PlatformName + "|" + $SessionId + "|sample|" + $sampleOrdinal + "|session") -Source $source -ObservedUtc $observed -Payload ([ordered]@{
            aliases          = @($safeAliases)
            turns            = [int]$State.session.turns
            samples          = [int]$sampleOrdinal
            sourceConfidence = "high"
            priceSource      = $Prices.sourceLabel
            warnings         = @($Warnings)
            models           = @($totalRows)
            tools            = @($totalToolRows)
            estimatedCostUsd = [double]$SessionCost
            costComplete     = [bool]$SessionCostComplete
        })
    Add-UsageV2Event -UsageDir $UsageDir -Event $sessionEvent

    $traceEvent = New-UsageV2Event -ProjectRoot $ProjectRoot -Type "trace.ended" -Platform $PlatformName -SessionId $SessionId -TraceId $traceId -SpanId ("spn_" + (Get-UsageStableHash -Value ($traceId + "|trace") -Length 24)) -IdempotencyKey ("usage-report|" + $PlatformName + "|" + $SessionId + "|sample|" + $sampleOrdinal + "|trace") -Source $source -ObservedUtc $observed -Payload ([ordered]@{
            turn              = [int]$turnOrdinal
            sample            = [int]$sampleOrdinal
            costComplete      = [bool]$TurnCostComplete
            durationSeconds   = [double]$WallSeconds
            agentRuns         = [int]$AgentRuns
            userMessages      = [int]$MessageCounts["userMessages"]
            assistantMessages = [int]$MessageCounts["assistantMessages"]
        })
    Add-UsageV2Event -UsageDir $UsageDir -Event $traceEvent

    foreach ($row in @($turnRows)) {
        $scope = [string]$row.scope
        $model = [string]$row.model
        $effort = [string]$row.effort
        $spanId = "spn_" + (Get-UsageStableHash -Value ($traceId + "|" + $scope + "|" + $model + "|" + $effort) -Length 24)
        $usageEvent = New-UsageV2Event -ProjectRoot $ProjectRoot -Type "span.usage" -Platform $PlatformName -SessionId $SessionId -TraceId $traceId -SpanId $spanId -IdempotencyKey ("usage-report|" + $PlatformName + "|" + $SessionId + "|sample|" + $sampleOrdinal + "|usage|" + $scope + "|" + $model + "|" + $effort) -Source $source -ObservedUtc $observed -Payload $row
        Add-UsageV2Event -UsageDir $UsageDir -Event $usageEvent
    }
    foreach ($agent in @($agentRows)) {
        $role = [string]$agent.role
        $agentEvent = New-UsageV2Event -ProjectRoot $ProjectRoot -Type "agent.ended" -Platform $PlatformName -SessionId $SessionId -TraceId $traceId -SpanId ("spn_" + (Get-UsageStableHash -Value ($traceId + "|agent|" + $role) -Length 24)) -IdempotencyKey ("usage-report|" + $PlatformName + "|" + $SessionId + "|sample|" + $sampleOrdinal + "|agent|" + $role) -Source $source -ObservedUtc $observed -Payload $agent
        Add-UsageV2Event -UsageDir $UsageDir -Event $agentEvent
    }
    foreach ($tool in @($toolRows)) {
        $name = [string]$tool.name
        $kind = [string]$tool.kind
        $toolEvent = New-UsageV2Event -ProjectRoot $ProjectRoot -Type "tool.completed" -Platform $PlatformName -SessionId $SessionId -TraceId $traceId -SpanId ("spn_" + (Get-UsageStableHash -Value ($traceId + "|tool|" + $kind + "|" + $name) -Length 24)) -IdempotencyKey ("usage-report|" + $PlatformName + "|" + $SessionId + "|sample|" + $sampleOrdinal + "|tool|" + $kind + "|" + $name) -Source $source -ObservedUtc $observed -Payload $tool
        Add-UsageV2Event -UsageDir $UsageDir -Event $toolEvent
    }
    try { [void](Update-UsageV2CurrentSessionViewFromEvents -UsageDir $UsageDir -ProjectRoot $ProjectRoot) } catch {}
}


function ConvertTo-CodexComparablePath {
    param([string] $Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return "" }
    $text = $Path.Trim()
    if ($text -match "^/mnt/([A-Za-z])/(.*)$") {
        $drive = $matches[1].ToLowerInvariant()
        $rest = $matches[2] -replace "/", "\"
        $text = $drive + ":\" + $rest
    }
    $text = $text -replace "/", "\"
    $text = $text.TrimEnd("\")
    return $text.ToLowerInvariant()
}

function ConvertFrom-CodexTokenCount {
    param($TotalUsage, [hashtable] $Previous)
    if (-not $TotalUsage) { return $null }
    foreach ($field in @("input_tokens", "output_tokens")) {
        if (-not $TotalUsage.PSObject.Properties[$field]) { return $null }
    }

    $totalIn = [long]$TotalUsage.input_tokens
    $totalOut = [long]$TotalUsage.output_tokens
    $totalCache = [long]0
    if ($TotalUsage.PSObject.Properties["cached_input_tokens"] -and $TotalUsage.cached_input_tokens) {
        $totalCache = [long]$TotalUsage.cached_input_tokens
    }

    $prevIn = [long]0
    $prevOut = [long]0
    $prevCache = [long]0
    if ($Previous.ContainsKey("in")) { $prevIn = [long]$Previous["in"] }
    if ($Previous.ContainsKey("out")) { $prevOut = [long]$Previous["out"] }
    if ($Previous.ContainsKey("cacheRead")) { $prevCache = [long]$Previous["cacheRead"] }

    $deltaInRaw = $totalIn - $prevIn
    $deltaOut = $totalOut - $prevOut
    $deltaCache = $totalCache - $prevCache
    if ($deltaInRaw -lt 0 -or $deltaOut -lt 0 -or $deltaCache -lt 0) { return $null }
    if ($deltaInRaw -eq 0 -and $deltaOut -eq 0 -and $deltaCache -eq 0) {
        return @{ changed = $false }
    }

    return @{
        changed        = $true
        rawInput       = [long]$deltaInRaw
        out            = [long]$deltaOut
        cacheRead      = [long]$deltaCache
    }
}

function Get-CodexSessionRoots {
    $roots = New-Object "System.Collections.Generic.List[string]"
    $candidates = @()
    if (-not [string]::IsNullOrWhiteSpace($env:CODEX_HOME)) { $candidates += $env:CODEX_HOME }
    if (-not [string]::IsNullOrWhiteSpace($HOME)) { $candidates += (Join-Path $HOME ".codex") }
    if (-not [string]::IsNullOrWhiteSpace($env:USERPROFILE)) { $candidates += (Join-Path $env:USERPROFILE ".codex") }
    $profile = [Environment]::GetFolderPath("UserProfile")
    if (-not [string]::IsNullOrWhiteSpace($profile)) { $candidates += (Join-Path $profile ".codex") }
    foreach ($candidate in $candidates) {
        if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
        $sessions = Join-Path $candidate "sessions"
        if ((Test-Path -LiteralPath $sessions) -and -not $roots.Contains($sessions)) {
            [void]$roots.Add($sessions)
        }
    }
    if (-not [string]::IsNullOrWhiteSpace($env:CODEX_HOME) -and $roots.Count -gt 0) { return @($roots) }
    if ([System.IO.Path]::DirectorySeparatorChar -eq "\") {
        $wslDistros = New-Object "System.Collections.Generic.List[string]"
        try {
            foreach ($line in @(& wsl.exe -l -q 2>$null)) {
                $distro = ([string]$line -replace "`0", "").Trim()
                if ([string]::IsNullOrWhiteSpace($distro)) { continue }
                if (-not $wslDistros.Contains($distro)) { [void]$wslDistros.Add($distro) }
            }
        }
        catch {}
        foreach ($fallback in @("Ubuntu", "Ubuntu-24.04", "Ubuntu-22.04", "Debian")) {
            if (-not $wslDistros.Contains($fallback)) { [void]$wslDistros.Add($fallback) }
        }
        foreach ($distro in $wslDistros) {
            $rootSessions = "\\wsl.localhost\" + $distro + "\root\.codex\sessions"
            if ((Test-Path -LiteralPath $rootSessions) -and -not $roots.Contains($rootSessions)) { [void]$roots.Add($rootSessions) }
            $homeRoot = "\\wsl.localhost\" + $distro + "\home"
            if (-not (Test-Path -LiteralPath $homeRoot)) { continue }
            foreach ($homeDir in Get-ChildItem -LiteralPath $homeRoot -Directory -ErrorAction SilentlyContinue) {
                $sessions = Join-Path $homeDir.FullName ".codex\sessions"
                if ((Test-Path -LiteralPath $sessions) -and -not $roots.Contains($sessions)) { [void]$roots.Add($sessions) }
            }
        }
    }
    return @($roots)
}

function Read-FirstLineShared {
    param([string] $Path)
    $stream = $null
    $reader = $null
    try {
        $share = [System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete
        $stream = New-Object System.IO.FileStream($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, $share)
        $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8, $true, 4096, $true)
        return $reader.ReadLine()
    }
    finally {
        if ($reader) { $reader.Dispose() }
        if ($stream) { $stream.Dispose() }
    }
}

function Get-CodexRolloutMetadata {
    param([string] $Path)
    if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path)) { return $null }
    try {
        $firstLine = Read-FirstLineShared -Path $Path
        if ([string]::IsNullOrWhiteSpace($firstLine)) { return $null }
        $first = $firstLine | ConvertFrom-Json
        if (-not $first -or $first.type -ne "session_meta" -or -not $first.payload -or -not $first.payload.id) { return $null }
        $payload = $first.payload
        $rolloutId = [string]$payload.id
        $rootSessionId = $rolloutId
        if ($payload.PSObject.Properties["session_id"] -and $payload.session_id) { $rootSessionId = [string]$payload.session_id }

        $parentId = ""
        $depth = 0
        $scope = "main"
        $source = $null
        if ($payload.PSObject.Properties["source"]) { $source = $payload.source }
        if ($source -and -not ($source -is [string]) -and $source.PSObject.Properties["subagent"] -and $source.subagent) {
            $subagent = $source.subagent
            if ($subagent.PSObject.Properties["thread_spawn"] -and $subagent.thread_spawn) {
                $spawn = $subagent.thread_spawn
                if ($spawn.PSObject.Properties["parent_thread_id"] -and $spawn.parent_thread_id) { $parentId = [string]$spawn.parent_thread_id }
                if ($spawn.PSObject.Properties["depth"] -and $null -ne $spawn.depth) { $depth = [int]$spawn.depth }
                if ($spawn.PSObject.Properties["agent_path"] -and $spawn.agent_path) {
                    $scope = [string]$spawn.agent_path
                    if ($scope.StartsWith("/root/", [System.StringComparison]::Ordinal)) { $scope = $scope.Substring(6) }
                    else { $scope = $scope.TrimStart("/") }
                }
                elseif ($spawn.PSObject.Properties["agent_role"] -and $spawn.agent_role) { $scope = [string]$spawn.agent_role }
                else { $scope = "subagent" }
            }
        }

        return [pscustomobject]@{
            path          = $Path
            id            = $rolloutId
            sessionId     = $rootSessionId
            parentId      = $parentId
            depth         = $depth
            scope         = $scope
            startedUtc    = ConvertTo-UtcDate -Text $first.timestamp
            cwd           = if ($payload.PSObject.Properties["cwd"]) { [string]$payload.cwd } else { "" }
        }
    }
    catch { return $null }
}

function Find-CodexSessionRollouts {
    param(
        [string] $SessionId,
        [string] $MainTranscript,
        [string[]] $RolloutPaths
    )
    if ([string]::IsNullOrWhiteSpace($SessionId)) { return @() }
    $candidates = New-Object "System.Collections.Generic.List[string]"
    $seenPaths = New-Object "System.Collections.Generic.HashSet[string]" ([System.StringComparer]::OrdinalIgnoreCase)

    foreach ($path in @($RolloutPaths)) {
        if (-not [string]::IsNullOrWhiteSpace($path) -and (Test-Path -LiteralPath $path) -and $seenPaths.Add($path)) { [void]$candidates.Add($path) }
    }

    $mainPath = $null
    if (-not [string]::IsNullOrWhiteSpace($MainTranscript) -and (Test-Path -LiteralPath $MainTranscript)) {
        $meta = Get-CodexRolloutMetadata -Path $MainTranscript
        if ($meta -and $meta.sessionId -eq $SessionId) {
            $mainPath = $MainTranscript
            if ($seenPaths.Add($MainTranscript)) { [void]$candidates.Add($MainTranscript) }
        }
    }

    $sessionRoots = @(Get-CodexSessionRoots)
    if (-not $mainPath) {
        foreach ($root in $sessionRoots) {
            foreach ($file in Get-ChildItem -LiteralPath $root -Recurse -File -Filter "rollout-*.jsonl" -ErrorAction SilentlyContinue) {
                if (-not $file.BaseName.EndsWith($SessionId, [System.StringComparison]::OrdinalIgnoreCase)) { continue }
                $meta = Get-CodexRolloutMetadata -Path $file.FullName
                if ($meta -and $meta.id -eq $SessionId -and $meta.sessionId -eq $SessionId) {
                    $mainPath = $file.FullName
                    if ($seenPaths.Add($mainPath)) { [void]$candidates.Add($mainPath) }
                    break
                }
            }
            if ($mainPath) { break }
        }
    }

    if ($mainPath -and @($RolloutPaths).Count -eq 0) {
        $mainMeta = Get-CodexRolloutMetadata -Path $mainPath
        $cutoff = [DateTime]::MinValue
        if ($mainMeta -and $mainMeta.startedUtc) { $cutoff = $mainMeta.startedUtc.AddMinutes(-5) }
        $derivedRoot = Split-Path -Parent $mainPath
        for ($i = 0; $i -lt 3 -and $derivedRoot; $i++) { $derivedRoot = Split-Path -Parent $derivedRoot }
        if ($derivedRoot -and (Test-Path -LiteralPath $derivedRoot) -and $sessionRoots -notcontains $derivedRoot) { $sessionRoots += $derivedRoot }
        foreach ($root in $sessionRoots) {
            foreach ($file in Get-ChildItem -LiteralPath $root -Recurse -File -Filter "rollout-*.jsonl" -ErrorAction SilentlyContinue) {
                if ($file.LastWriteTimeUtc -lt $cutoff -or -not $seenPaths.Add($file.FullName)) { continue }
                [void]$candidates.Add($file.FullName)
            }
        }
    }

    $result = @()
    foreach ($path in $candidates) {
        $meta = Get-CodexRolloutMetadata -Path $path
        if ($meta -and $meta.sessionId -eq $SessionId) { $result += , $meta }
    }
    return @($result | Sort-Object @{ Expression = { $_.depth } }, @{ Expression = { $_.startedUtc } }, @{ Expression = { $_.id } })
}

function Read-CodexRolloutUsageData {
    param($Metadata)
    $turnIds = New-Object "System.Collections.Generic.List[string]"
    $seenTurns = New-Object "System.Collections.Generic.HashSet[string]"
    $events = New-Object "System.Collections.Generic.List[object]"
    $responseTools = New-Object "System.Collections.Generic.List[object]"
    $legacyTools = New-Object "System.Collections.Generic.List[object]"
    $warnings = New-Object "System.Collections.Generic.List[string]"
    $activeTurnId = ""
    $currentModel = "unknown"
    $currentEffort = "unspecified"
    $lineNumber = 0

    $stream = $null
    $reader = $null
    try {
        $share = [System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete
        $stream = New-Object System.IO.FileStream([string]$Metadata.path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, $share)
        $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8, $true, 65536, $true)
        while ($null -ne ($line = $reader.ReadLine())) {
            $lineNumber++
            if ($line.IndexOf('"turn_context"', [System.StringComparison]::Ordinal) -lt 0 -and
                $line.IndexOf('"task_started"', [System.StringComparison]::Ordinal) -lt 0 -and
                $line.IndexOf('"token_count"', [System.StringComparison]::Ordinal) -lt 0 -and
                $line.IndexOf('"custom_tool_call"', [System.StringComparison]::Ordinal) -lt 0 -and
                $line.IndexOf('"function_call"', [System.StringComparison]::Ordinal) -lt 0 -and
                $line.IndexOf('"exec_command_end"', [System.StringComparison]::Ordinal) -lt 0 -and
                $line.IndexOf('"patch_apply_end"', [System.StringComparison]::Ordinal) -lt 0 -and
                $line.IndexOf('"tool_call_end"', [System.StringComparison]::Ordinal) -lt 0) { continue }
            $entry = $null
            try { $entry = $line | ConvertFrom-Json } catch { continue }
            if (-not $entry) { continue }

            if ($entry.type -eq "response_item" -and $entry.payload) {
                $responseType = [string]$entry.payload.type
                if ($responseType -eq "custom_tool_call" -or $responseType -eq "function_call") {
                    $toolTurnId = $activeTurnId
                    if ($entry.payload.PSObject.Properties["internal_chat_message_metadata_passthrough"] -and $entry.payload.internal_chat_message_metadata_passthrough) {
                        $meta = $entry.payload.internal_chat_message_metadata_passthrough
                        if ($meta.PSObject.Properties["turn_id"] -and $meta.turn_id) { $toolTurnId = [string]$meta.turn_id }
                    }
                    $toolName = $responseType
                    if ($entry.payload.PSObject.Properties["name"] -and $entry.payload.name) { $toolName = [string]$entry.payload.name }
                    [void]$responseTools.Add([pscustomobject]@{ turnId = $toolTurnId; name = $toolName; kind = "codex"; failures = [int]0 })
                }
                continue
            }

            if ($entry.type -eq "turn_context" -and $entry.payload) {
                if ($entry.payload.PSObject.Properties["turn_id"] -and $entry.payload.turn_id) { $activeTurnId = [string]$entry.payload.turn_id }
                if ($entry.payload.PSObject.Properties["model"] -and $entry.payload.model) { $currentModel = [string]$entry.payload.model }
                if ($entry.payload.PSObject.Properties["effort"] -and $entry.payload.effort) { $currentEffort = [string]$entry.payload.effort }
                if (-not [string]::IsNullOrWhiteSpace($activeTurnId) -and $seenTurns.Add($activeTurnId)) { [void]$turnIds.Add($activeTurnId) }
                continue
            }

            if ($entry.type -ne "event_msg" -or -not $entry.payload -or -not $entry.payload.PSObject.Properties["type"]) { continue }
            $payloadType = [string]$entry.payload.type
            if ($payloadType -eq "exec_command_end" -or $payloadType -eq "patch_apply_end" -or $payloadType -eq "tool_call_end") {
                $toolName = if ($payloadType -eq "exec_command_end") { "shell" } elseif ($payloadType -eq "patch_apply_end") { "apply_patch" } else { "tool" }
                if ($payloadType -eq "tool_call_end" -and $entry.payload.PSObject.Properties["name"] -and $entry.payload.name) { $toolName = [string]$entry.payload.name }
                [void]$legacyTools.Add([pscustomobject]@{ turnId = $activeTurnId; name = $toolName; kind = "codex"; failures = [int]0 })
                continue
            }
            if ($payloadType -eq "task_started") {
                if ($entry.payload.PSObject.Properties["turn_id"] -and $entry.payload.turn_id) {
                    $activeTurnId = [string]$entry.payload.turn_id
                    if ($seenTurns.Add($activeTurnId)) { [void]$turnIds.Add($activeTurnId) }
                }
                continue
            }
            if ($payloadType -ne "token_count" -or -not $entry.payload.info -or -not $entry.payload.info.total_token_usage) { continue }
            $total = $entry.payload.info.total_token_usage
            if (-not $total.PSObject.Properties["input_tokens"] -or -not $total.PSObject.Properties["output_tokens"]) {
                [void]$warnings.Add("token_count without input/output totals at line " + $lineNumber)
                continue
            }
            $last = $null
            if ($entry.payload.info.PSObject.Properties["last_token_usage"]) { $last = $entry.payload.info.last_token_usage }
            [void]$events.Add([pscustomobject]@{
                    turnId       = $activeTurnId
                    model        = $currentModel
                    effort       = $currentEffort
                    timestampUtc = ConvertTo-UtcDate -Text $entry.timestamp
                    totalIn      = [long]$total.input_tokens
                    totalOut     = [long]$total.output_tokens
                    totalCache   = if ($total.PSObject.Properties["cached_input_tokens"] -and $total.cached_input_tokens) { [long]$total.cached_input_tokens } else { [long]0 }
                    lastIn       = if ($last -and $last.PSObject.Properties["input_tokens"]) { [long]$last.input_tokens } else { [long]-1 }
                    lastOut      = if ($last -and $last.PSObject.Properties["output_tokens"]) { [long]$last.output_tokens } else { [long]-1 }
                    lastCache    = if ($last -and $last.PSObject.Properties["cached_input_tokens"] -and $last.cached_input_tokens) { [long]$last.cached_input_tokens } else { [long]0 }
                })
        }
    }
    catch { [void]$warnings.Add("could not read rollout: " + $_.Exception.Message) }
    finally {
        if ($reader) { $reader.Dispose() }
        if ($stream) { $stream.Dispose() }
    }

    $tools = New-Object "System.Collections.Generic.List[object]"
    if ($responseTools.Count -gt 0) {
        $modernNames = New-Object "System.Collections.Generic.HashSet[string]" ([System.StringComparer]::OrdinalIgnoreCase)
        foreach ($tool in $responseTools) {
            [void]$tools.Add($tool)
            [void]$modernNames.Add([string]$tool.name)
        }
        if ($modernNames.Contains("exec")) { [void]$modernNames.Add("shell") }
        foreach ($tool in $legacyTools) {
            $name = [string]$tool.name
            if ($name -eq "tool" -or $modernNames.Contains($name)) { continue }
            [void]$tools.Add($tool)
        }
    }
    else {
        foreach ($tool in $legacyTools) { [void]$tools.Add($tool) }
    }
    return [pscustomobject]@{
        turnIds  = $turnIds.ToArray()
        events   = $events.ToArray()
        tools    = $tools.ToArray()
        warnings = $warnings.ToArray()
    }
}

function Get-CodexSessionUsage {
    param(
        [string] $SessionId,
        [string] $MainTranscript,
        [string[]] $RolloutPaths,
        [hashtable] $PriceModels
    )
    $result = @{
        status      = "no-data"
        rows        = @()
        warnings    = @()
        rollouts    = 0
        agentRuns   = 0
        turns       = 0
        wallFrom    = $null
        wallTo      = $null
        toolCounts  = @{}
        rolloutRevision = ""
    }
    $metadata = @(Find-CodexSessionRollouts -SessionId $SessionId -MainTranscript $MainTranscript -RolloutPaths $RolloutPaths)
    if ($metadata.Count -eq 0) { return $result }

    $validMetadata = @()
    $validIds = New-Object "System.Collections.Generic.HashSet[string]"
    foreach ($meta in $metadata) {
        if (-not [string]::IsNullOrWhiteSpace($meta.parentId) -and -not $validIds.Contains($meta.parentId)) {
            $result.warnings += ("missing parent rollout " + $meta.parentId + " for " + $meta.id + "; descendant excluded")
            continue
        }
        $validMetadata += , $meta
        [void]$validIds.Add([string]$meta.id)
    }
    if ($validMetadata.Count -eq 0) { $result.status = "partial"; return $result }
    $revisionParts = @()
    foreach ($meta in @($validMetadata | Sort-Object -Property id)) {
        $file = Get-Item -LiteralPath $meta.path -ErrorAction SilentlyContinue
        if (-not $file) { continue }
        $revisionParts += ([string]$meta.id) + ":" + ([string]$file.Length) + ":" + ([string]$file.LastWriteTimeUtc.Ticks)
    }
    if ($revisionParts.Count -gt 0) { $result.rolloutRevision = Get-UsageStableHash -Value ($revisionParts -join "|") -Length 32 }

    $dataById = @{}
    $ownerByTurn = @{}
    foreach ($meta in $validMetadata) {
        $data = Read-CodexRolloutUsageData -Metadata $meta
        $dataById[$meta.id] = $data
        foreach ($warning in @($data.warnings)) { $result.warnings += ($meta.id + ": " + $warning) }
        foreach ($turnId in @($data.turnIds)) {
            if (-not $ownerByTurn.ContainsKey($turnId)) { $ownerByTurn[$turnId] = $meta.id }
        }
    }

    $rowBuckets = @{}
    $filesWithOwnedUsage = New-Object "System.Collections.Generic.HashSet[string]"
    $rootTurnsWithUsage = New-Object "System.Collections.Generic.HashSet[string]"
    foreach ($meta in $validMetadata) {
        $data = $dataById[$meta.id]
        foreach ($tool in @($data.tools)) {
            if ([string]::IsNullOrWhiteSpace($tool.turnId) -or -not $ownerByTurn.ContainsKey($tool.turnId) -or $ownerByTurn[$tool.turnId] -ne $meta.id) { continue }
            $toolKey = $tool.kind + "|" + $tool.name
            if (-not $result.toolCounts.ContainsKey($toolKey)) {
                $result.toolCounts[$toolKey] = @{ name = [string]$tool.name; kind = [string]$tool.kind; calls = [int]0; failures = [int]0 }
            }
            $result.toolCounts[$toolKey].calls = [int]$result.toolCounts[$toolKey].calls + 1
            $result.toolCounts[$toolKey].failures = [int]$result.toolCounts[$toolKey].failures + [int]$tool.failures
        }
        $previous = @{ in = [long]0; out = [long]0; cacheRead = [long]0 }
        $unattributedWarned = $false
        foreach ($event in @($data.events)) {
            $totalUsage = [pscustomobject]@{
                input_tokens        = [long]$event.totalIn
                output_tokens       = [long]$event.totalOut
                cached_input_tokens = [long]$event.totalCache
            }
            $delta = ConvertFrom-CodexTokenCount -TotalUsage $totalUsage -Previous $previous
            $previous.in = [long]$event.totalIn
            $previous.out = [long]$event.totalOut
            $previous.cacheRead = [long]$event.totalCache
            if (-not $delta) {
                $result.warnings += ($meta.id + ": cumulative token counter decreased; event excluded")
                continue
            }
            if (-not $delta.changed) { continue }
            if ([string]::IsNullOrWhiteSpace($event.turnId) -or -not $ownerByTurn.ContainsKey($event.turnId)) {
                # Partial-fork child rollouts can replay cumulative ancestor
                # counters before their first task_started/turn_context entry.
                # They advance the baseline but never belong to the child.
                if ($meta.id -eq $SessionId -and -not $unattributedWarned) {
                    $result.warnings += ($meta.id + ": token event without a turn id; event excluded")
                    $unattributedWarned = $true
                }
                continue
            }
            if ($ownerByTurn[$event.turnId] -ne $meta.id) { continue }

            $rawInput = [long]$delta.rawInput
            $output = [long]$delta.out
            $cacheRead = [long]$delta.cacheRead
            if ($event.lastIn -ge 0 -and ($event.lastIn -ne $rawInput -or $event.lastOut -ne $output -or $event.lastCache -ne $cacheRead)) {
                $result.warnings += ($meta.id + ": last_token_usage disagrees with cumulative delta; event excluded")
                continue
            }
            $uncachedInput = [Math]::Max([long]0, $rawInput - $cacheRead)
            $model = [string]$event.model
            $effort = [string]$event.effort
            if ([string]::IsNullOrWhiteSpace($model)) { $model = "unknown" }
            if ([string]::IsNullOrWhiteSpace($effort)) { $effort = "unspecified" }
            $key = $meta.scope + "|" + $model + "|" + $effort
            if (-not $rowBuckets.ContainsKey($key)) {
                $rowBuckets[$key] = [pscustomobject]@{
                    scope  = [string]$meta.scope
                    model  = $model
                    effort = $effort
                    bucket = New-TokenBucket
                }
            }
            $bucket = $rowBuckets[$key].bucket
            $bucket.calls++
            $bucket.in += $uncachedInput
            $bucket.out += $output
            $bucket.cacheRead += $cacheRead

            $price = $null
            if ($PriceModels) { $price = Get-ModelPrice -Models $PriceModels -Model $model }
            $isLong = $false
            if ($price -and $price.PSObject.Properties["long_context_threshold"] -and $null -ne $price.long_context_threshold) {
                $isLong = $rawInput -gt [long]$price.long_context_threshold
            }
            if ($isLong) {
                $bucket.longCalls++
                $bucket.longIn += $uncachedInput
                $bucket.longOut += $output
                $bucket.longCacheRead += $cacheRead
            }

            [void]$filesWithOwnedUsage.Add($meta.id)
            if ($meta.id -eq $SessionId) { [void]$rootTurnsWithUsage.Add([string]$event.turnId) }
            if ($event.timestampUtc) {
                if (-not $result.wallFrom -or $event.timestampUtc -lt $result.wallFrom) { $result.wallFrom = $event.timestampUtc }
                if (-not $result.wallTo -or $event.timestampUtc -gt $result.wallTo) { $result.wallTo = $event.timestampUtc }
            }
        }
    }

    $rows = @()
    foreach ($key in ($rowBuckets.Keys | Sort-Object)) {
        $row = $rowBuckets[$key]
        $price = $null
        if ($PriceModels) { $price = Get-ModelPrice -Models $PriceModels -Model $row.model }
        $cost = $null
        if ($price) { $cost = Get-BucketCost -Price $price -Bucket $row.bucket }
        $rows += , [pscustomobject]@{
            scope  = $row.scope
            model  = $row.model
            effort = $row.effort
            bucket = $row.bucket
            cost   = $cost
        }
    }
    foreach ($meta in $validMetadata) {
        if ($meta.id -ne $SessionId -and $filesWithOwnedUsage.Contains($meta.id)) { $result.agentRuns++ }
    }
    $result.rows = $rows
    $result.rollouts = $validMetadata.Count
    $result.turns = $rootTurnsWithUsage.Count
    if ($rows.Count -gt 0) { $result.status = if ($result.warnings.Count -gt 0) { "partial" } else { "ok" } }
    elseif ($result.warnings.Count -gt 0) { $result.status = "partial" }
    return $result
}

function Get-CodexRolloutRecords {
    param(
        [string] $ProjectRoot,
        [string] $UsageDir,
        [string] $ScriptDir,
        [int] $RetentionDays = 90
    )
    $result = @{ status = "no-data"; records = 0; warnings = @() }
    if ([string]::IsNullOrWhiteSpace($ProjectRoot) -or [string]::IsNullOrWhiteSpace($UsageDir)) { return $result }
    $sessionRoots = @(Get-CodexSessionRoots)
    if ($sessionRoots.Count -eq 0) { return $result }

    $recordedRevisions = New-Object "System.Collections.Generic.HashSet[string]"
    $historyPath = Join-Path $UsageDir "history.jsonl"
    if (Test-Path -LiteralPath $historyPath) {
        foreach ($line in [System.IO.File]::ReadLines($historyPath)) {
            if ([string]::IsNullOrWhiteSpace($line)) { continue }
            $record = $null
            try { $record = $line | ConvertFrom-Json } catch { continue }
            if (-not $record -or $record.platform -ne "codex" -or -not $record.sessionId) { continue }
            if ($record.source -ne "rollout-scan" -and $record.source -ne "session-snapshot") { continue }
            if ($record.PSObject.Properties["rolloutRevision"] -and -not [string]::IsNullOrWhiteSpace([string]$record.rolloutRevision)) {
                [void]$recordedRevisions.Add(([string]$record.sessionId) + "|" + ([string]$record.rolloutRevision))
            }
        }
    }

    $rootKey = ConvertTo-CodexComparablePath -Path $ProjectRoot
    $cutoff = [DateTime]::UtcNow.AddDays(-1 * [Math]::Max(1, $RetentionDays))
    $completeCutoff = [DateTime]::UtcNow.AddHours(-2)
    $groups = @{}
    foreach ($sessionsRoot in $sessionRoots) {
        foreach ($file in Get-ChildItem -LiteralPath $sessionsRoot -Recurse -File -Filter "rollout-*.jsonl" -ErrorAction SilentlyContinue) {
            if ($file.LastWriteTimeUtc -lt $cutoff) { continue }
            $meta = Get-CodexRolloutMetadata -Path $file.FullName
            if (-not $meta -or (ConvertTo-CodexComparablePath -Path $meta.cwd) -ne $rootKey) { continue }
            if (-not $groups.ContainsKey($meta.sessionId)) { $groups[$meta.sessionId] = New-Object "System.Collections.Generic.List[object]" }
            [void]$groups[$meta.sessionId].Add([pscustomobject]@{ meta = $meta; lastWriteUtc = $file.LastWriteTimeUtc; length = [long]$file.Length })
        }
    }

    $prices = Get-PriceTable -ScriptDir $ScriptDir -UsageDir $UsageDir
    foreach ($sessionId in ($groups.Keys | Sort-Object)) {
        $items = @($groups[$sessionId] | ForEach-Object { $_ })
        $rootItem = @($items | Where-Object { $_.meta.id -eq $sessionId -and [string]::IsNullOrWhiteSpace($_.meta.parentId) } | Select-Object -First 1)
        if ($rootItem.Count -eq 0) {
            $result.warnings += ("codex session " + $sessionId + " has descendants but no root rollout; excluded")
            continue
        }
        $latestWriteUtc = @($items | Sort-Object -Property lastWriteUtc -Descending | Select-Object -First 1)[0].lastWriteUtc
        if ($latestWriteUtc -ge $completeCutoff) { continue }
        $revisionParts = @($items | Sort-Object -Property @{ Expression = { $_.meta.id } } | ForEach-Object {
                ([string]$_.meta.id) + ":" + ([string]$_.length) + ":" + ([string]$_.lastWriteUtc.Ticks)
            })
        $rolloutRevision = Get-UsageStableHash -Value ($revisionParts -join "|") -Length 32
        if ($recordedRevisions.Contains($sessionId + "|" + $rolloutRevision)) { continue }
        $paths = @($items | ForEach-Object { [string]$_.meta.path })
        $snapshot = Get-CodexSessionUsage -SessionId $sessionId -MainTranscript $rootItem[0].meta.path -RolloutPaths $paths -PriceModels $prices.models
        foreach ($warning in @($snapshot.warnings)) { $result.warnings += ($sessionId + ": " + $warning) }
        if ($snapshot.status -ne "ok" -or @($snapshot.rows).Count -eq 0) {
            if ($snapshot.status -ne "ok") { $result.warnings += ($sessionId + ": lineage snapshot is " + $snapshot.status + "; checkpoint not written") }
            continue
        }

        $historyRows = @()
        foreach ($row in @($snapshot.rows)) {
            $historyRows += , (ConvertTo-UsageHistoryRow -Row $row)
        }
        $recordTs = $rootItem[0].lastWriteUtc
        if ($snapshot.wallTo) { $recordTs = $snapshot.wallTo }
        Add-HistoryRecord -UsageDir $UsageDir -Record ([ordered]@{
                v                 = 1
                accountingVersion = 2
                ts                = $recordTs.ToUniversalTime().ToString("o", $script:Inv)
                platform          = "codex"
                source            = "rollout-scan"
                sessionId         = $sessionId
                rolloutRevision   = $rolloutRevision
                turn              = [int]$snapshot.turns
                wallSeconds       = if ($snapshot.wallFrom -and $snapshot.wallTo) { [double]($snapshot.wallTo - $snapshot.wallFrom).TotalSeconds } else { [double]0 }
                agentRuns         = [int]$snapshot.agentRuns
                userMessages      = [int]0
                assistantMessages = [int]0
                rows              = $historyRows
            })
        [void]$recordedRevisions.Add($sessionId + "|" + $rolloutRevision)
        $result.records++
    }

    if ($groups.Count -gt 0) { $result.status = "ok" }
    return $result
}
