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
    foreach ($key in @($Models.Keys | Sort-Object -Property Length -Descending)) {
        if ($Model.StartsWith([string]$key, [System.StringComparison]::OrdinalIgnoreCase)) { return $Models[$key] }
    }
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
        return @{ changed = $false; totalIn = $totalIn; totalOut = $totalOut; totalCacheRead = $totalCache }
    }

    $uncachedIn = $deltaInRaw - $deltaCache
    if ($uncachedIn -lt 0) { $uncachedIn = 0 }
    return @{
        changed        = $true
        calls          = 1
        in             = [long]$uncachedIn
        out            = [long]$deltaOut
        cacheRead      = [long]$deltaCache
        totalIn        = $totalIn
        totalOut       = $totalOut
        totalCacheRead = $totalCache
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
    return @($roots)
}

function Get-CodexRolloutRecords {
    param(
        [string] $ProjectRoot,
        [string] $UsageDir,
        [string] $ScriptDir,
        [int] $RetentionDays = 90
    )

    $result = @{
        status   = "no-data"
        records  = 0
        warnings = @()
    }
    if ([string]::IsNullOrWhiteSpace($ProjectRoot) -or [string]::IsNullOrWhiteSpace($UsageDir)) { return $result }

    $sessionRoots = @(Get-CodexSessionRoots)
    if ($sessionRoots.Count -eq 0) { return $result }

    $historySessions = New-Object "System.Collections.Generic.HashSet[string]"
    $historyPath = Join-Path $UsageDir "history.jsonl"
    if (Test-Path -LiteralPath $historyPath) {
        foreach ($line in [System.IO.File]::ReadAllLines($historyPath)) {
            if ([string]::IsNullOrWhiteSpace($line)) { continue }
            $record = $null
            try { $record = $line | ConvertFrom-Json } catch { $record = $null }
            if ($record -and $record.platform -eq "codex" -and $record.sessionId) {
                [void]$historySessions.Add([string]$record.sessionId)
            }
        }
    }

    $statePath = Join-Path $UsageDir "codex-scan-state.json"
    $stateFiles = @{}
    $loadedState = Read-JsonFile -Path $statePath
    if ($loadedState -and $loadedState.files) {
        foreach ($prop in $loadedState.files.PSObject.Properties) {
            $stateFiles[$prop.Name] = $prop.Value
        }
    }

    $rootKey = ConvertTo-CodexComparablePath -Path $ProjectRoot
    $now = [DateTime]::UtcNow
    $cutoff = $now.AddDays(-1 * [Math]::Max(1, $RetentionDays))
    $doneCutoff = $now.AddHours(-48)
    $prices = Get-PriceTable -ScriptDir $ScriptDir -UsageDir $UsageDir
    $formatUnknown = $false
    $matchingFiles = 0

    $files = @()
    foreach ($sessionsRoot in $sessionRoots) {
        $files += @(Get-ChildItem -LiteralPath $sessionsRoot -Recurse -File -Filter "rollout-*.jsonl" -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTimeUtc -ge $cutoff })
    }
    foreach ($file in $files) {
        $path = $file.FullName
        $lines = $null
        try { $lines = [System.IO.File]::ReadAllLines($path) } catch { continue }
        if (-not $lines -or $lines.Count -eq 0) { continue }

        $first = $null
        try { $first = $lines[0] | ConvertFrom-Json } catch { $formatUnknown = $true; $result.warnings += ("codex format unknown in " + $path + ": invalid session_meta"); continue }
        if (-not $first -or $first.type -ne "session_meta" -or -not $first.PSObject.Properties["payload"] -or -not $first.payload -or -not $first.payload.PSObject.Properties["cwd"]) {
            $formatUnknown = $true
            $result.warnings += ("codex format unknown in " + $path + ": missing session_meta.cwd")
            continue
        }
        if ((ConvertTo-CodexComparablePath -Path ([string]$first.payload.cwd)) -ne $rootKey) { continue }
        $sessionId = [System.IO.Path]::GetFileNameWithoutExtension($path)
        if ($first.payload.PSObject.Properties["id"] -and $first.payload.id) { $sessionId = [string]$first.payload.id }

        $matchingFiles++
        $fileState = $null
        if ($stateFiles.ContainsKey($path)) { $fileState = $stateFiles[$path] }
        $offset = 0
        $done = $false
        $currentModel = $null
        $prev = @{ in = [long]0; out = [long]0; cacheRead = [long]0 }
        if ($fileState) {
            if ($fileState.PSObject.Properties["lines"]) { $offset = [int]$fileState.lines }
            if ($fileState.PSObject.Properties["done"] -and $fileState.done) { $done = $true }
            if ($fileState.PSObject.Properties["lastModel"] -and $fileState.lastModel) { $currentModel = [string]$fileState.lastModel }
            if ($fileState.PSObject.Properties["lastTotalIn"]) { $prev["in"] = [long]$fileState.lastTotalIn }
            if ($fileState.PSObject.Properties["lastTotalOut"]) { $prev["out"] = [long]$fileState.lastTotalOut }
            if ($fileState.PSObject.Properties["lastTotalCacheRead"]) { $prev["cacheRead"] = [long]$fileState.lastTotalCacheRead }
        }
        if ($done -and $offset -ge $lines.Count) { continue }
        if ($offset -gt $lines.Count) { $offset = 0 }

        $buckets = @{}
        $userMessages = 0
        $assistantMessages = 0
        $lastTs = $null
        for ($i = $offset; $i -lt $lines.Count; $i++) {
            $entry = $null
            try { $entry = $lines[$i] | ConvertFrom-Json }
            catch {
                if ($i -lt ($lines.Count - 1)) {
                    $formatUnknown = $true
                    $result.warnings += ("codex format unknown in " + $path + ": invalid json line " + ($i + 1))
                }
                continue
            }
            if (-not $entry) { continue }
            if ($entry.PSObject.Properties["timestamp"]) {
                $ts = ConvertTo-UtcDate -Text $entry.timestamp
                if ($ts) { $lastTs = $ts }
            }

            if ($entry.type -eq "turn_context") {
                if ($entry.PSObject.Properties["payload"] -and $entry.payload -and $entry.payload.PSObject.Properties["model"] -and $entry.payload.model) {
                    $currentModel = [string]$entry.payload.model
                }
                else {
                    $formatUnknown = $true
                    $result.warnings += ("codex format unknown in " + $path + ": turn_context without model")
                }
                continue
            }

            if ($entry.type -ne "event_msg" -or -not $entry.PSObject.Properties["payload"] -or -not $entry.payload -or -not $entry.payload.PSObject.Properties["type"]) { continue }
            $payloadType = [string]$entry.payload.type
            if ($payloadType -eq "user_message") {
                $userMessages++
                continue
            }
            if ($payloadType -eq "agent_message") {
                $assistantMessages++
                continue
            }
            if ($payloadType -ne "token_count") { continue }
            if (-not $entry.payload.PSObject.Properties["info"] -or -not $entry.payload.info) { continue }
            if (-not $entry.payload.info.PSObject.Properties["total_token_usage"] -or -not $entry.payload.info.total_token_usage) {
                $formatUnknown = $true
                $result.warnings += ("codex format unknown in " + $path + ": token_count without total_token_usage")
                continue
            }
            if ([string]::IsNullOrWhiteSpace($currentModel)) {
                $formatUnknown = $true
                $result.warnings += ("codex format unknown in " + $path + ": token_count before model")
                continue
            }

            $delta = ConvertFrom-CodexTokenCount -TotalUsage $entry.payload.info.total_token_usage -Previous $prev
            if (-not $delta) {
                $formatUnknown = $true
                $result.warnings += ("codex format unknown in " + $path + ": token totals decreased or missing fields")
                continue
            }
            $prev["in"] = [long]$delta.totalIn
            $prev["out"] = [long]$delta.totalOut
            $prev["cacheRead"] = [long]$delta.totalCacheRead
            if (-not $delta.changed) { continue }

            if (-not $buckets.ContainsKey($currentModel)) { $buckets[$currentModel] = New-TokenBucket }
            $bucket = $buckets[$currentModel]
            $bucket.calls += [int]$delta.calls
            $bucket.in += [long]$delta.in
            $bucket.out += [long]$delta.out
            $bucket.cacheRead += [long]$delta.cacheRead
        }

        $rows = @()
        foreach ($model in ($buckets.Keys | Sort-Object)) {
            $bucket = $buckets[$model]
            $price = Get-ModelPrice -Models $prices.models -Model $model
            $cost = $null
            if ($price) { $cost = Get-BucketCost -Price $price -Bucket $bucket }
            $rows += , ([ordered]@{
                    model     = $model
                    scope     = "main"
                    calls     = [int]$bucket.calls
                    in        = [long]$bucket.in
                    out       = [long]$bucket.out
                    cacheRead = [long]$bucket.cacheRead
                    cache5m   = [long]0
                    cache1h   = [long]0
                    estCost   = $cost
                })
        }

        if ($rows.Count -gt 0 -and -not $historySessions.Contains($sessionId)) {
            $recordTs = $file.LastWriteTimeUtc
            if ($lastTs) { $recordTs = $lastTs }
            Add-HistoryRecord -UsageDir $UsageDir -Record ([ordered]@{
                    v                 = 1
                    ts                = $recordTs.ToUniversalTime().ToString("o", $script:Inv)
                    platform          = "codex"
                    source            = "session"
                    sessionId         = $sessionId
                    turn              = $null
                    wallSeconds       = [double]0
                    agentRuns         = [int]0
                    userMessages      = [int]$userMessages
                    assistantMessages = [int]$assistantMessages
                    rows              = $rows
                })
            [void]$historySessions.Add($sessionId)
            $result.records = [int]$result.records + 1
        }

        $stateFiles[$path] = [ordered]@{
            lines              = [int]$lines.Count
            done               = [bool]($file.LastWriteTimeUtc -lt $doneCutoff)
            lastTotalIn        = [long]$prev["in"]
            lastTotalOut       = [long]$prev["out"]
            lastTotalCacheRead = [long]$prev["cacheRead"]
            lastModel          = $currentModel
        }
    }

    Write-JsonAtomic -Path $statePath -Value ([ordered]@{
            updatedUtc = [DateTime]::UtcNow.ToString("o")
            files      = $stateFiles
        })

    if ($formatUnknown -and $result.records -eq 0) { $result.status = "format-unknown" }
    elseif ($matchingFiles -gt 0) { $result.status = "ok" }
    else { $result.status = "no-data" }
    return $result
}
