# Regression tests for usage identity, pricing, and Codex lineage accounting.
# Compatible with Windows PowerShell 5.1 and pwsh 7. No Pester dependency.

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $PSCommandPath
. (Join-Path $scriptDir "usage-common.ps1")

function Assert-Usage {
    param([bool] $Condition, [string] $Message)
    if (-not $Condition) { throw $Message }
}

function Write-JsonLine {
    param([string] $Path, $Value)
    $line = $Value | ConvertTo-Json -Depth 20 -Compress
    [System.IO.File]::AppendAllText($Path, $line + "`n", (New-Object System.Text.UTF8Encoding $false))
}

function Invoke-PowerShellCapture {
    param([string] $Exe, [string] $Script, [string[]] $Arguments)
    $quoted = New-Object "System.Collections.Generic.List[string]"
    foreach ($argument in $Arguments) { [void]$quoted.Add('"' + ($argument -replace '"', '\"') + '"') }
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = $Exe
    $start.Arguments = '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "' + $Script + '" ' + ($quoted -join " ")
    $start.UseShellExecute = $false
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $process = [System.Diagnostics.Process]::Start($start)
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    return ($stdout + $stderr).Trim()
}

function Invoke-PowerShellWithInput {
    param([string] $Exe, [string] $Script, [string[]] $Arguments, [string] $InputText)
    $quoted = New-Object "System.Collections.Generic.List[string]"
    foreach ($argument in $Arguments) { [void]$quoted.Add('"' + ($argument -replace '"', '\"') + '"') }
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = $Exe
    $start.Arguments = '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "' + $Script + '" ' + ($quoted -join " ")
    $start.UseShellExecute = $false
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $process = [System.Diagnostics.Process]::Start($start)
    $process.StandardInput.Write($InputText)
    $process.StandardInput.Close()
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    return ($stdout + $stderr).Trim()
}

function New-SessionMeta {
    param([string] $Id, [string] $RootId, [string] $Cwd, [string] $ParentId = "", [int] $Depth = 0, [string] $AgentPath = "")
    $source = "test"
    $threadSource = "user"
    if (-not [string]::IsNullOrWhiteSpace($ParentId)) {
        $source = [ordered]@{
            subagent = [ordered]@{
                thread_spawn = [ordered]@{
                    parent_thread_id = $ParentId
                    depth            = $Depth
                    agent_path       = $AgentPath
                    agent_role       = $null
                }
            }
        }
        $threadSource = "subagent"
    }
    return [ordered]@{
        timestamp = "2026-07-09T00:00:00Z"
        type      = "session_meta"
        payload   = [ordered]@{
            id            = $Id
            session_id    = $RootId
            cwd           = $Cwd
            source        = $source
            thread_source = $threadSource
        }
    }
}

function New-TaskStarted {
    param([string] $TurnId)
    return [ordered]@{
        timestamp = "2026-07-09T00:00:01Z"
        type      = "event_msg"
        payload   = [ordered]@{ type = "task_started"; turn_id = $TurnId }
    }
}

function New-TurnContext {
    param([string] $TurnId, [string] $Effort)
    return [ordered]@{
        timestamp = "2026-07-09T00:00:02Z"
        type      = "turn_context"
        payload   = [ordered]@{ turn_id = $TurnId; model = "gpt-5.6-sol"; effort = $Effort }
    }
}

function New-TokenCount {
    param([long] $TotalIn, [long] $TotalCache, [long] $TotalOut, [long] $LastIn, [long] $LastCache, [long] $LastOut)
    return [ordered]@{
        timestamp = "2026-07-09T00:00:03Z"
        type      = "event_msg"
        payload   = [ordered]@{
            type = "token_count"
            info = [ordered]@{
                total_token_usage = [ordered]@{
                    input_tokens        = $TotalIn
                    cached_input_tokens = $TotalCache
                    output_tokens       = $TotalOut
                }
                last_token_usage = [ordered]@{
                    input_tokens        = $LastIn
                    cached_input_tokens = $LastCache
                    output_tokens       = $LastOut
                }
            }
        }
    }
}

function New-ResponseTool {
    param([string] $TurnId, [string] $Name, [string] $Id)
    return [ordered]@{
        timestamp = "2026-07-09T00:00:02Z"
        type      = "response_item"
        payload   = [ordered]@{
            type   = "custom_tool_call"
            id     = $Id
            status = "completed"
            name   = $Name
            internal_chat_message_metadata_passthrough = [ordered]@{ turn_id = $TurnId }
        }
    }
}

function New-LegacyToolEnd {
    param([string] $Type, [string] $TurnId)
    return [ordered]@{
        timestamp = "2026-07-09T00:00:02Z"
        type      = "event_msg"
        payload   = [ordered]@{ type = $Type; turn_id = $TurnId }
    }
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("agent-kit-usage-test-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
$savedNoPriceRefresh = $env:AGENT_KIT_USAGE_NO_PRICE_REFRESH
$env:AGENT_KIT_USAGE_NO_PRICE_REFRESH = "1"
try {
    $genericModels = @{
        "gpt-5" = [pscustomobject]@{ in = 1.25; out = 10.0; cache_read = 0.125 }
    }
    Assert-Usage -Condition ($null -eq (Get-ModelPrice -Models $genericModels -Model "gpt-5.6-sol")) -Message "unknown model inherited a generic prefix price"

    $datedModels = @{
        "claude-test" = [pscustomobject]@{ in = 1.0; out = 2.0 }
    }
    Assert-Usage -Condition ($null -ne (Get-ModelPrice -Models $datedModels -Model "claude-test-20260709")) -Message "safe dated alias lookup regressed"

    Write-JsonAtomic -Path (Join-Path $tempRoot "prices.cache.json") -Value ([ordered]@{
            fetched_at = "2026-07-09T00:00:00Z"
            source     = "test"
            models     = [ordered]@{ "gpt-5.5" = [ordered]@{ in = 5.0; out = 30.0; cache_read = 0.5 } }
        })
    $mergedPrices = Get-PriceTable -ScriptDir $scriptDir -UsageDir $tempRoot
    Assert-Usage -Condition ($mergedPrices.models["gpt-5.5"].long_in -eq 10.0) -Message "cache refresh erased official long-context pricing metadata"

    $idA = "019f1234-0000-0000-0000-000000000001"
    $idB = "019f1234-0000-0000-0000-000000000002"
    $stateA = Get-UsageStatePath -UsageDir $tempRoot -SessionId $idA
    $stateB = Get-UsageStatePath -UsageDir $tempRoot -SessionId $idB
    Assert-Usage -Condition ($stateA -ne $stateB) -Message "full session ids still collide in state paths"
    Assert-Usage -Condition ($stateA.Contains($idA) -and $stateB.Contains($idB)) -Message "state path truncated a session id"

    $rootId = "root-session"
    $childId = "child-session"
    $grandchildId = "grandchild-session"
    $rootPath = Join-Path $tempRoot "root.jsonl"
    $childPath = Join-Path $tempRoot "child.jsonl"
    $grandchildPath = Join-Path $tempRoot "grandchild.jsonl"
    $unrelatedPath = Join-Path $tempRoot "unrelated.jsonl"
    $orphanPath = Join-Path $tempRoot "orphan.jsonl"

    $rootTask = New-TaskStarted -TurnId "root-turn"
    $rootContext = New-TurnContext -TurnId "root-turn" -Effort "ultra"
    $rootTool = New-ResponseTool -TurnId "root-turn" -Name "exec" -Id "root-tool"
    $rootLegacyExec = New-LegacyToolEnd -Type "exec_command_end" -TurnId "root-turn"
    $rootLegacyPatch = New-LegacyToolEnd -Type "patch_apply_end" -TurnId "root-turn"
    $rootTokens = New-TokenCount -TotalIn 100 -TotalCache 40 -TotalOut 10 -LastIn 100 -LastCache 40 -LastOut 10
    foreach ($entry in @((New-SessionMeta -Id $rootId -RootId $rootId -Cwd $tempRoot), $rootTask, $rootContext, $rootTool, $rootLegacyExec, $rootLegacyPatch, $rootTokens)) { Write-JsonLine -Path $rootPath -Value $entry }

    $childTask = New-TaskStarted -TurnId "child-turn"
    $childContext = New-TurnContext -TurnId "child-turn" -Effort "high"
    $childTool = New-ResponseTool -TurnId "child-turn" -Name "wait" -Id "child-tool"
    $childTokens = New-TokenCount -TotalIn 160 -TotalCache 60 -TotalOut 16 -LastIn 60 -LastCache 20 -LastOut 6
    foreach ($entry in @((New-SessionMeta -Id $childId -RootId $rootId -Cwd $tempRoot -ParentId $rootId -Depth 1 -AgentPath "/root/child"), $rootTask, $rootContext, $rootTool, $rootLegacyExec, $rootLegacyPatch, $rootTokens, $childTask, $childContext, $childTool, $childTokens)) { Write-JsonLine -Path $childPath -Value $entry }

    $grandchildTask = New-TaskStarted -TurnId "grandchild-turn"
    $grandchildContext = New-TurnContext -TurnId "grandchild-turn" -Effort "max"
    $grandchildTokens = New-TokenCount -TotalIn 200 -TotalCache 70 -TotalOut 20 -LastIn 40 -LastCache 10 -LastOut 4
    foreach ($entry in @((New-SessionMeta -Id $grandchildId -RootId $rootId -Cwd $tempRoot -ParentId $childId -Depth 2 -AgentPath "/root/child/grandchild"), $rootTask, $rootContext, $rootTool, $rootLegacyExec, $rootLegacyPatch, $rootTokens, $childTask, $childContext, $childTool, $childTokens, $grandchildTask, $grandchildContext, $grandchildTokens)) { Write-JsonLine -Path $grandchildPath -Value $entry }

    foreach ($entry in @((New-SessionMeta -Id "unrelated" -RootId "unrelated" -Cwd $tempRoot), (New-TaskStarted -TurnId "other-turn"), (New-TurnContext -TurnId "other-turn" -Effort "low"), (New-TokenCount -TotalIn 999 -TotalCache 0 -TotalOut 99 -LastIn 999 -LastCache 0 -LastOut 99))) { Write-JsonLine -Path $unrelatedPath -Value $entry }
    foreach ($entry in @((New-SessionMeta -Id "orphan" -RootId $rootId -Cwd $tempRoot -ParentId "missing-parent" -Depth 2 -AgentPath "/root/orphan"), (New-TaskStarted -TurnId "orphan-turn"), (New-TurnContext -TurnId "orphan-turn" -Effort "ultra"), (New-TokenCount -TotalIn 999 -TotalCache 0 -TotalOut 99 -LastIn 999 -LastCache 0 -LastOut 99))) { Write-JsonLine -Path $orphanPath -Value $entry }

    $priceModels = @{
        "gpt-5.6-sol" = [pscustomobject]@{
            in = 5.0; out = 30.0; cache_read = 0.5; cache_write_5m = 6.25; cache_write_1h = 6.25
            long_context_threshold = 272000; long_in = 10.0; long_out = 45.0; long_cache_read = 1.0; long_cache_write = 12.5
        }
    }
    $snapshot = Get-CodexSessionUsage -SessionId $rootId -MainTranscript $rootPath -RolloutPaths @($rootPath, $childPath, $grandchildPath, $unrelatedPath) -PriceModels $priceModels
    Assert-Usage -Condition ($snapshot.status -eq "ok") -Message ("lineage snapshot was not complete: " + ($snapshot.warnings -join "; "))
    Assert-Usage -Condition ($snapshot.rollouts -eq 3 -and $snapshot.agentRuns -eq 2 -and $snapshot.turns -eq 1) -Message "lineage/session counts are wrong"
    Assert-Usage -Condition (@($snapshot.rows).Count -eq 3) -Message "model+effort rows were merged or unrelated data leaked in"
    $total = New-TokenBucket
    foreach ($row in @($snapshot.rows)) { Add-TokenBucket -Target $total -Source $row.bucket }
    Assert-Usage -Condition ($total.calls -eq 3 -and $total.in -eq 130 -and $total.cacheRead -eq 70 -and $total.out -eq 20) -Message "ancestor replay was double-counted"
    $efforts = @($snapshot.rows | ForEach-Object { $_.effort } | Sort-Object)
    Assert-Usage -Condition (($efforts -join ",") -eq "high,max,ultra") -Message "reasoning effort was lost"
    $toolCallTotal = 0
    foreach ($toolKey in $snapshot.toolCounts.Keys) { $toolCallTotal += [int]$snapshot.toolCounts[$toolKey].calls }
    Assert-Usage -Condition ($toolCallTotal -eq 3) -Message "hybrid Codex response/legacy tools were missed, duplicated, or replayed"
    Assert-Usage -Condition ($snapshot.toolCounts.ContainsKey("codex|exec") -and $snapshot.toolCounts.ContainsKey("codex|wait") -and $snapshot.toolCounts.ContainsKey("codex|apply_patch") -and -not $snapshot.toolCounts.ContainsKey("codex|shell")) -Message "hybrid Codex tool schema did not prefer modern names while retaining legacy-only tools"
    $partial = Get-CodexSessionUsage -SessionId $rootId -MainTranscript $rootPath -RolloutPaths @($rootPath, $childPath, $grandchildPath, $orphanPath) -PriceModels $priceModels
    Assert-Usage -Condition ($partial.status -eq "partial" -and $partial.rollouts -eq 3 -and @($partial.rows).Count -eq 3) -Message "missing-parent descendant was not excluded fail-closed"

    $longBucket = New-TokenBucket
    $longBucket.calls = 2
    $longBucket.in = 300
    $longBucket.out = 30
    $longBucket.cacheRead = 100
    $longBucket.longCalls = 1
    $longBucket.longIn = 200
    $longBucket.longOut = 20
    $longBucket.longCacheRead = 80
    $tieredCost = Get-BucketCost -Price $priceModels["gpt-5.6-sol"] -Bucket $longBucket
    $expectedCost = ((100 * 5.0) + (10 * 30.0) + (20 * 0.5) + (200 * 10.0) + (20 * 45.0) + (80 * 1.0)) / 1000000.0
    Assert-Usage -Condition ([Math]::Abs($tieredCost - $expectedCost) -lt 0.0000001) -Message "long-context pricing was applied after aggregation"

    $v2UsageDir = Join-Path $tempRoot "v2-usage"
    $ultraBucket = New-TokenBucket
    $ultraBucket.calls = 1; $ultraBucket.in = 10; $ultraBucket.out = 2
    $highBucket = New-TokenBucket
    $highBucket.calls = 1; $highBucket.in = 20; $highBucket.out = 3
    $v2State = @{
        session = @{
            models  = @{
                "gpt-5.6-sol|ultra" = Copy-TokenBucket -Source $ultraBucket
                "gpt-5.6-sol|high"  = Copy-TokenBucket -Source $highBucket
            }
            tools    = @{ "codex|shell" = @{ name = "shell"; kind = "codex"; calls = 1; failures = 0 } }
            turns   = 1
            samples = 1
        }
    }
    $v2Prices = @{ models = $priceModels; sourceLabel = "test prices" }
    $v2Rows = @(
        @{ model = "gpt-5.6-sol"; effort = "ultra"; scope = "main"; bucket = $ultraBucket; cost = Get-BucketCost -Price $priceModels["gpt-5.6-sol"] -Bucket $ultraBucket },
        @{ model = "gpt-5.6-sol"; effort = "high"; scope = "main"; bucket = $highBucket; cost = Get-BucketCost -Price $priceModels["gpt-5.6-sol"] -Bucket $highBucket }
    )
    Write-UsageV2SessionSnapshot -UsageDir $v2UsageDir -ProjectRoot $tempRoot -PlatformName "codex" -SessionId "v2-session" -State $v2State -Prices $v2Prices -Rows $v2Rows -TurnCost 0.0 -SessionCost 0.0 -SessionCostComplete $true -WallSeconds 0.0 -AgentRuns 0 -MessageCounts @{ userMessages = 1; assistantMessages = 1 } -ToolCounts @{ "codex|shell" = @{ name = "shell"; kind = "codex"; calls = 1; failures = 0 } }
    $ultraDelta = New-TokenBucket
    $ultraDelta.calls = 1; $ultraDelta.in = 5; $ultraDelta.out = 1
    Add-TokenBucket -Target $v2State.session.models["gpt-5.6-sol|ultra"] -Source $ultraDelta
    $v2State.session.tools["codex|shell"].calls = 2
    $v2State.session.samples = 2
    Write-UsageV2SessionSnapshot -UsageDir $v2UsageDir -ProjectRoot $tempRoot -PlatformName "codex" -SessionId "v2-session" -State $v2State -Prices $v2Prices -Rows @(@{ model = "gpt-5.6-sol"; effort = "ultra"; scope = "main"; bucket = $ultraDelta; cost = Get-BucketCost -Price $priceModels["gpt-5.6-sol"] -Bucket $ultraDelta }) -TurnCost 0.0 -SessionCost 0.0 -SessionCostComplete $true -WallSeconds 0.0 -AgentRuns 0 -MessageCounts @{ userMessages = 0; assistantMessages = 1 } -ToolCounts @{ "codex|shell" = @{ name = "shell"; kind = "codex"; calls = 1; failures = 0 } }
    $v2Events = @(Get-UsageV2Events -UsageDir $v2UsageDir)
    $usageEvents = @($v2Events | Where-Object { $_.type -eq "span.usage" })
    $traceEvents = @($v2Events | Where-Object { $_.type -eq "trace.ended" })
    Assert-Usage -Condition ($usageEvents.Count -eq 3 -and $traceEvents.Count -eq 2) -Message "v2 sample or effort idempotency keys collided"
    $v2View = Read-JsonFile -Path (Join-Path (Join-Path (Join-Path $v2UsageDir "v2") "views") "current-session.json")
    Assert-Usage -Condition (@($v2View.totals.models).Count -eq 2) -Message "v2 totals merged distinct reasoning efforts"
    Assert-Usage -Condition ((@($v2View.totals.models | ForEach-Object { $_.effort } | Sort-Object) -join ",") -eq "high,ultra") -Message "v2 view lost reasoning effort"
    Assert-Usage -Condition ($v2View.totals.tools[0].calls -eq 2) -Message "v2 tool metrics did not aggregate across samples"

    $unpricedRoot = Join-Path $tempRoot "unpriced-root"
    $unpricedUsage = Join-Path $unpricedRoot ".agents\usage"
    $unpricedBucket = New-TokenBucket
    $unpricedBucket.calls = 1; $unpricedBucket.in = 10; $unpricedBucket.out = 2
    $unpricedState = @{ session = @{ models = @{ "future-model|ultra" = $unpricedBucket }; tools = @{}; turns = 1; samples = 1 } }
    Write-UsageV2SessionSnapshot -UsageDir $unpricedUsage -ProjectRoot $unpricedRoot -PlatformName "claude" -SessionId "unpriced-session" -State $unpricedState -Prices @{ models = @{}; sourceLabel = "test prices" } -Rows @(@{ model = "future-model"; effort = "ultra"; scope = "main"; bucket = $unpricedBucket; cost = $null }) -TurnCost 0.0 -TurnCostComplete $false -SessionCost 0.0 -SessionCostComplete $false -WallSeconds 1.0 -AgentRuns 0 -MessageCounts @{ userMessages = 1; assistantMessages = 1 } -ToolCounts @{}
    $unpricedView = Read-JsonFile -Path (Join-Path (Join-Path (Join-Path $unpricedUsage "v2") "views") "current-session.json")
    Assert-Usage -Condition (-not $unpricedView.lastTurn.costComplete -and $null -eq $unpricedView.lastTurn.estimatedCostUsd) -Message "unpriced v2 turn was rendered as a zero-cost estimate"
    Write-Verbose "v2 round-trip passed"

    $statsRoot = Join-Path $tempRoot "stats-root"
    $statsUsage = Join-Path $statsRoot ".agents\usage"
    New-Item -ItemType Directory -Force -Path $statsUsage | Out-Null
    $historyPath = Join-Path $statsUsage "history.jsonl"
    $nowText = [DateTime]::UtcNow.ToString("o")
    foreach ($record in @(
            [ordered]@{ v = 1; accountingVersion = 2; ts = $nowText; platform = "codex"; source = "session"; sessionId = "checkpoint-session"; rows = @([ordered]@{ model = "gpt-5.6-sol"; effort = "ultra"; scope = "main"; calls = 1; in = 10; out = 1; cacheRead = 0; cache5m = 0; cache1h = 0; estCost = 0.1 }) },
            [ordered]@{ v = 1; accountingVersion = 2; ts = $nowText; platform = "codex"; source = "rollout-scan"; sessionId = "checkpoint-session"; rolloutRevision = "one"; rows = @([ordered]@{ model = "gpt-5.6-sol"; effort = "ultra"; scope = "main"; calls = 2; in = 100; out = 10; cacheRead = 0; cache5m = 0; cache1h = 0; estCost = 1.0 }) },
            [ordered]@{ v = 1; accountingVersion = 2; ts = $nowText; platform = "codex"; source = "session"; sessionId = "checkpoint-session"; rows = @([ordered]@{ model = "gpt-5.6-sol"; effort = "ultra"; scope = "main"; calls = 1; in = 5; out = 1; cacheRead = 0; cache5m = 0; cache1h = 0; estCost = 0.05 }) },
            [ordered]@{ v = 1; accountingVersion = 2; ts = $nowText; platform = "codex"; source = "rollout-scan"; sessionId = "checkpoint-session"; rolloutRevision = "two"; rows = @([ordered]@{ model = "gpt-5.6-sol"; effort = "ultra"; scope = "main"; calls = 3; in = 120; out = 12; cacheRead = 0; cache5m = 0; cache1h = 0; estCost = 1.2 }) }
        )) { Write-JsonLine -Path $historyPath -Value $record }
    $exe = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
    $statsScript = Join-Path $scriptDir "usage-stats.ps1"
    [void](Invoke-PowerShellCapture -Exe $exe -Script $statsScript -Arguments @("-ProjectRoot", $statsRoot, "-NoCodexScan", "-Quiet"))
    $stats = Read-JsonFile -Path (Join-Path $statsUsage "stats-summary.json")
    Assert-Usage -Condition ($stats.windows.'24h'.totals.tokensIn -eq 120) -Message "latest rollout checkpoint did not replace older Codex deltas"
    Write-JsonLine -Path $historyPath -Value ([ordered]@{ v = 1; accountingVersion = 2; ts = $nowText; platform = "codex"; source = "session"; sessionId = "checkpoint-session"; rows = @([ordered]@{ model = "gpt-5.6-sol"; effort = "ultra"; scope = "main"; calls = 1; in = 3; out = 1; cacheRead = 0; cache5m = 0; cache1h = 0; estCost = 0.03 }) })
    [void](Invoke-PowerShellCapture -Exe $exe -Script $statsScript -Arguments @("-ProjectRoot", $statsRoot, "-NoCodexScan", "-Quiet"))
    $stats = Read-JsonFile -Path (Join-Path $statsUsage "stats-summary.json")
    Assert-Usage -Condition ($stats.windows.'24h'.totals.tokensIn -eq 123) -Message "post-checkpoint Codex hook delta was discarded"
    Write-JsonLine -Path $historyPath -Value ([ordered]@{ v = 1; accountingVersion = 2; ts = $nowText; platform = "codex"; source = "session-snapshot"; sessionId = "checkpoint-session"; rolloutRevision = "live-three"; rows = @([ordered]@{ model = "gpt-5.6-sol"; effort = "ultra"; scope = "main"; calls = 4; in = 150; out = 15; cacheRead = 0; cache5m = 0; cache1h = 0; estCost = 1.5 }) })
    [void](Invoke-PowerShellCapture -Exe $exe -Script $statsScript -Arguments @("-ProjectRoot", $statsRoot, "-NoCodexScan", "-Quiet"))
    $stats = Read-JsonFile -Path (Join-Path $statsUsage "stats-summary.json")
    Assert-Usage -Condition ($stats.windows.'24h'.totals.tokensIn -eq 150) -Message "full live session snapshot was added to an older checkpoint"
    Write-Verbose "history checkpoint filtering passed"

    $claudeRoot = Join-Path $tempRoot "claude-root"
    $claudeUsage = Join-Path $claudeRoot ".agents\usage"
    New-Item -ItemType Directory -Force -Path $claudeUsage | Out-Null
    $claudeSession = "claude-state-migration"
    $claudeStatePath = Get-UsageStatePath -UsageDir $claudeUsage -SessionId $claudeSession
    Write-JsonAtomic -Path $claudeStatePath -Value ([ordered]@{
            files = [ordered]@{}; seen = @(); session = [ordered]@{
                turns = 2; models = [ordered]@{
                    "claude-test" = [ordered]@{ calls = 1; in = 10; out = 1; cacheRead = 0; cache5m = 0; cache1h = 0 }
                    "claude-test|unspecified" = [ordered]@{ calls = 2; in = 20; out = 2; cacheRead = 0; cache5m = 0; cache1h = 0 }
                }
            }
        })
    $claudeTranscript = Join-Path $claudeRoot "claude.jsonl"
    Write-JsonLine -Path $claudeTranscript -Value ([ordered]@{
            timestamp = $nowText; type = "assistant"; requestId = "request-one"; message = [ordered]@{
                id = "message-one"; model = "claude-test"; usage = [ordered]@{ input_tokens = 5; output_tokens = 1 }
                content = @([ordered]@{ type = "text"; text = "done" })
            }
        })
    Write-JsonLine -Path $claudeTranscript -Value ([ordered]@{
            timestamp = $nowText; type = "assistant"; requestId = "request-one"; message = [ordered]@{
                id = "message-one"; model = "claude-test"; usage = [ordered]@{ input_tokens = 5; output_tokens = 1 }
                content = @([ordered]@{ type = "tool_use"; id = "tool-one"; name = "read" })
            }
        })
    $reportScript = Join-Path $scriptDir "usage-report.ps1"
    $hookJson = ([ordered]@{ session_id = $claudeSession; transcript_path = $claudeTranscript; cwd = $claudeRoot } | ConvertTo-Json -Compress)
    [void](Invoke-PowerShellWithInput -Exe $exe -Script $reportScript -Arguments @("-Platform", "claude") -InputText $hookJson)
    $migratedState = Read-JsonFile -Path $claudeStatePath
    $stateKeys = @($migratedState.session.models.PSObject.Properties | ForEach-Object { $_.Name })
    Assert-Usage -Condition ($stateKeys.Count -eq 1 -and $stateKeys[0] -eq "claude-test|unspecified") -Message "legacy Claude model key was not normalized"
    Assert-Usage -Condition ($migratedState.session.models.'claude-test|unspecified'.calls -eq 4 -and $migratedState.session.models.'claude-test|unspecified'.in -eq 35) -Message "legacy and normalized Claude state buckets were not merged exactly once"
    $claudeV2 = Read-JsonFile -Path (Join-Path (Join-Path (Join-Path $claudeUsage "v2") "views") "current-session.json")
    Assert-Usage -Condition ($claudeV2.sessionId -eq $claudeSession -and $claudeV2.totals.models[0].effort -eq "unspecified") -Message "Claude v2 session view was not written with effort"
    Assert-Usage -Condition ($claudeV2.totals.models[0].calls -eq 4 -and $claudeV2.totals.models[0].inputTokens -eq 35) -Message "v2 rebuild discarded migrated Claude totals"
    Assert-Usage -Condition ($claudeV2.totals.tools[0].name -eq "read") -Message "Claude tool metric was not restored in v2"

    $footer = Join-Path $scriptDir "usage-footer.ps1"
    $claudeFooter = Invoke-PowerShellCapture -Exe $exe -Script $footer -Arguments @("-ProjectRoot", $claudeRoot, "-Platform", "claude", "-SessionId", $claudeSession, "-Mode", "Full")
    $claudeFooterLines = @($claudeFooter -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    Assert-Usage -Condition ($claudeFooterLines.Count -eq 1 -and $claudeFooter -match '^Usage: claude-test \[unspecified\] \| session ' -and $claudeFooter -match '35 in / 4 out \| 4 calls$') -Message ("Claude compact footer regressed: " + $claudeFooter)
    Assert-Usage -Condition ($claudeFooter -notmatch "sessionId|recorded|prices:|claude/read|cacheR|source:") -Message ("Claude footer leaked operator noise: " + $claudeFooter)
    $claudeBriefFooter = Invoke-PowerShellCapture -Exe $exe -Script $footer -Arguments @("-ProjectRoot", $claudeRoot, "-Platform", "claude", "-SessionId", $claudeSession, "-Mode", "Brief")
    Assert-Usage -Condition ($claudeBriefFooter -eq $claudeFooter) -Message "Brief and Full footer modes no longer share the compact operator format"
    $unpricedFooter = Invoke-PowerShellCapture -Exe $exe -Script $footer -Arguments @("-ProjectRoot", $unpricedRoot, "-Platform", "claude", "-SessionId", "unpriced-session", "-Mode", "Full")
    Assert-Usage -Condition ($unpricedFooter -match "session n/a" -and $unpricedFooter -notmatch "\$0\.00") -Message ("unpriced v2 footer did not fail closed: " + $unpricedFooter)
    Write-Verbose "Claude state, tools, and footer passed"

    $geminiRoot = Join-Path $tempRoot "gemini-root"
    $geminiUsage = Join-Path $geminiRoot ".agents\usage"
    New-Item -ItemType Directory -Force -Path $geminiUsage | Out-Null
    Write-JsonLine -Path (Join-Path $geminiUsage "gemini-telemetry.log") -Value ([ordered]@{
            timestamp = $nowText; model = "gemini-test"; input_token_count = 7; output_token_count = 2; tool_token_count = 3
        })
    $geminiSession = "gemini-v2-session"
    $geminiHook = ([ordered]@{ session_id = $geminiSession; cwd = $geminiRoot; model = "gemini-test" } | ConvertTo-Json -Compress)
    [void](Invoke-PowerShellWithInput -Exe $exe -Script $reportScript -Arguments @("-Platform", "gemini") -InputText $geminiHook)
    $geminiV2 = Read-JsonFile -Path (Join-Path (Join-Path (Join-Path $geminiUsage "v2") "views") "current-session.json")
    Assert-Usage -Condition ($geminiV2.sessionId -eq $geminiSession -and $geminiV2.totals.models[0].model -eq "gemini-test" -and $geminiV2.totals.models[0].effort -eq "unspecified") -Message "Gemini v2 session/model view regressed"
    Assert-Usage -Condition ($geminiV2.totals.tools[0].name -eq "tool_tokens") -Message "Gemini tool metric was not restored in v2"
    Write-Verbose "Gemini tools and v2 passed"

    $scannerUsage = Join-Path $tempRoot "scanner-usage"
    New-Item -ItemType Directory -Force -Path $scannerUsage | Out-Null
    Write-JsonLine -Path (Join-Path $scannerUsage "history.jsonl") -Value ([ordered]@{
            v = 1; accountingVersion = 2; ts = $nowText; platform = "codex"; source = "session"; sessionId = $rootId
            rows = @([ordered]@{ model = "gpt-5.6-sol"; effort = "ultra"; scope = "main"; calls = 1; in = 60; out = 10; cacheRead = 40; cache5m = 0; cache1h = 0; estCost = 0.001 })
        })
    $codexHome = Join-Path $tempRoot "codex-home"
    $scannerSessions = Join-Path $codexHome "sessions\2026\07\09"
    New-Item -ItemType Directory -Force -Path $scannerSessions | Out-Null
    $scannerRootPath = Join-Path $scannerSessions "rollout-root-session.jsonl"
    $scannerChildPath = Join-Path $scannerSessions "rollout-child-session.jsonl"
    $scannerGrandchildPath = Join-Path $scannerSessions "rollout-grandchild-session.jsonl"
    Copy-Item -LiteralPath $rootPath -Destination $scannerRootPath
    Copy-Item -LiteralPath $childPath -Destination $scannerChildPath
    Copy-Item -LiteralPath $grandchildPath -Destination $scannerGrandchildPath
    $oldWrite = [DateTime]::UtcNow.AddHours(-3)
    [System.IO.File]::SetLastWriteTimeUtc($scannerRootPath, $oldWrite)
    [System.IO.File]::SetLastWriteTimeUtc($scannerChildPath, $oldWrite)
    [System.IO.File]::SetLastWriteTimeUtc($scannerGrandchildPath, [DateTime]::UtcNow)
    $priorCodexHome = $env:CODEX_HOME
    try {
        $env:CODEX_HOME = $codexHome
        Write-Verbose "starting active-lineage scan"
        $activeScan = Get-CodexRolloutRecords -ProjectRoot $tempRoot -UsageDir $scannerUsage -ScriptDir $scriptDir -RetentionDays 90
        Assert-Usage -Condition ($activeScan.records -eq 0) -Message "active descendant did not keep the Codex lineage open"
        [System.IO.File]::SetLastWriteTimeUtc($scannerGrandchildPath, $oldWrite)
        Write-Verbose "starting quiet-lineage scan"
        $quietScan = Get-CodexRolloutRecords -ProjectRoot $tempRoot -UsageDir $scannerUsage -ScriptDir $scriptDir -RetentionDays 90
        Assert-Usage -Condition ($quietScan.records -eq 1) -Message "intermediate hook record incorrectly suppressed the quiet rollout scan"
        $scanHistory = @([System.IO.File]::ReadAllLines((Join-Path $scannerUsage "history.jsonl")) | ForEach-Object { $_ | ConvertFrom-Json } | Where-Object { $_.source -eq "rollout-scan" })
        Assert-Usage -Condition ($scanHistory.Count -eq 1 -and -not [string]::IsNullOrWhiteSpace([string]$scanHistory[0].rolloutRevision)) -Message "rollout scan did not write an authoritative revision checkpoint"
        Write-Verbose "starting unchanged-revision scan"
        $sameScan = Get-CodexRolloutRecords -ProjectRoot $tempRoot -UsageDir $scannerUsage -ScriptDir $scriptDir -RetentionDays 90
        Assert-Usage -Condition ($sameScan.records -eq 0) -Message "unchanged rollout revision was scanned twice"
        Write-JsonLine -Path $scannerGrandchildPath -Value ([ordered]@{ timestamp = $nowText; type = "event_msg"; payload = [ordered]@{ type = "agent_message" } })
        [System.IO.File]::SetLastWriteTimeUtc($scannerGrandchildPath, $oldWrite)
        Write-Verbose "starting changed-revision scan"
        $resumedScan = Get-CodexRolloutRecords -ProjectRoot $tempRoot -UsageDir $scannerUsage -ScriptDir $scriptDir -RetentionDays 90
        Assert-Usage -Condition ($resumedScan.records -eq 1) -Message "changed rollout revision was permanently suppressed"
        $scannerOrphanPath = Join-Path $scannerSessions "rollout-orphan-session.jsonl"
        Copy-Item -LiteralPath $orphanPath -Destination $scannerOrphanPath
        [System.IO.File]::SetLastWriteTimeUtc($scannerOrphanPath, $oldWrite)
        $partialScan = Get-CodexRolloutRecords -ProjectRoot $tempRoot -UsageDir $scannerUsage -ScriptDir $scriptDir -RetentionDays 90
        Assert-Usage -Condition ($partialScan.records -eq 0) -Message "partial Codex lineage was written as an authoritative checkpoint"
        [System.IO.File]::SetLastWriteTimeUtc($scannerOrphanPath, [DateTime]::UtcNow)

        $partialUsage = Join-Path $tempRoot ".agents\usage"
        New-Item -ItemType Directory -Force -Path $partialUsage | Out-Null
        $partialStatePath = Get-UsageStatePath -UsageDir $partialUsage -SessionId $rootId
        Write-JsonAtomic -Path $partialStatePath -Value ([ordered]@{ sentinel = "preserve"; files = [ordered]@{}; seen = @(); session = [ordered]@{ turns = 9; models = [ordered]@{} } })
        $stateBefore = [System.IO.File]::ReadAllText($partialStatePath)
        $partialHook = ([ordered]@{ session_id = $rootId; transcript_path = $scannerRootPath; cwd = $tempRoot } | ConvertTo-Json -Compress)
        [void](Invoke-PowerShellWithInput -Exe $exe -Script $reportScript -Arguments @("-Platform", "codex") -InputText $partialHook)
        $stateAfter = [System.IO.File]::ReadAllText($partialStatePath)
        Assert-Usage -Condition ($stateAfter -eq $stateBefore) -Message "partial Codex hook snapshot replaced trusted reporter state"
        Write-Verbose "rollout scanner revision tests passed"
    }
    finally {
        $env:CODEX_HOME = $priorCodexHome
    }

    $usageDir = Join-Path $tempRoot ".agents\usage"
    New-Item -ItemType Directory -Force -Path $usageDir | Out-Null
    [System.IO.File]::WriteAllText((Join-Path $usageDir "last-report-codex.md"), "# Usage report`n`nPlatform: codex`nSession: stale`n`n## Last turn`n`n    Usage codex: stale gpt-5.5`n", (New-Object System.Text.UTF8Encoding $false))
    Write-Verbose "starting strict footer tests"
    $savedCodexThreadId = $env:CODEX_THREAD_ID
    $savedCodexShell = $env:CODEX_SHELL
    $savedCodexOriginator = $env:CODEX_INTERNAL_ORIGINATOR_OVERRIDE
    try {
        $env:CODEX_THREAD_ID = $null
        $env:CODEX_SHELL = $null
        $env:CODEX_INTERNAL_ORIGINATOR_OVERRIDE = $null
        $footerOutput = Invoke-PowerShellCapture -Exe $exe -Script $footer -Arguments @("-ProjectRoot", $tempRoot, "-Platform", "codex", "-Mode", "Full")
        Assert-Usage -Condition ($footerOutput -eq "Usage: unavailable") -Message ("footer did not fail closed compactly without a session id: " + $footerOutput)
        Assert-Usage -Condition ($footerOutput -notmatch "gpt-5.5") -Message "footer leaked a stale platform-global report"
        $autoOutput = Invoke-PowerShellCapture -Exe $exe -Script $footer -Arguments @("-ProjectRoot", $tempRoot, "-Platform", "auto", "-Mode", "Full")
        Assert-Usage -Condition ($autoOutput -eq "Usage: unavailable" -and $autoOutput -notmatch "gpt-5.5") -Message "auto mode leaked a stale global report or verbose diagnostics"
    }
    finally {
        $env:CODEX_THREAD_ID = $savedCodexThreadId
        $env:CODEX_SHELL = $savedCodexShell
        $env:CODEX_INTERNAL_ORIGINATOR_OVERRIDE = $savedCodexOriginator
    }

    Write-Output "usage regression tests: PASS"
}
finally {
    $env:AGENT_KIT_USAGE_NO_PRICE_REFRESH = $savedNoPriceRefresh
    if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
}
