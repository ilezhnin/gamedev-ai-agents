# AI Usage Analytics V2 GDD

Status: draft. User review required before implementation.

This document is the design contract for refactoring the kit usage feature from a hook-level report into a durable local AI analytics layer. It is intentionally scoped like a GDD even though the feature is tooling, not gameplay: it defines the product fantasy, loops, systems, data, milestones, and cut lines before implementation starts.

Research baseline:

- LangSmith organizes observability around traces, runs, feedback, metadata, and datasets: https://docs.langchain.com/langsmith/observability-concepts
- Langfuse organizes LLM observability around traces, observations, scores, sessions, and users: https://langfuse.com/docs/observability/data-model
- OpenTelemetry GenAI semantic conventions standardize model, token, usage, system, request, response, and operation attributes: https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/
- OpenAI exposes usage and costs as separate time-bucketed API surfaces, which is a useful precedent for separating raw usage from priced views: https://developers.openai.com/api-reference/usage/costs

## Vision

The kit should answer three questions without spending extra tokens:

1. What did the currently open agent session cost and consume?
2. Which models, agents, tools, and workflows are driving project-level spend?
3. Is the data complete enough to trust, or is it partial, stale, unpriced, or unsupported?

The feature must feel like a professional local AI observability layer: session-correct, explainable, privacy-aware, and portable across Codex, Claude Code, Gemini CLI, and future adapters.

## Design Pillars

| Pillar | Rule |
|---|---|
| Session identity first | Visible session totals must belong to the currently open logical session, never to a stale provider rollout, old thread, or all-project history. |
| Event log over counters | Raw events are appended once; derived views can be rebuilt. Counters are materialized views, not the source of truth. |
| Hierarchical analytics | Project, environment, session, trace, turn, span, agent, tool, and model are first-class axes. |
| Honest confidence | Partial scans, missing prices, unknown schemas, and unsupported platforms are labeled explicitly. |
| Zero extra model calls | Usage collection reads local transcripts, lifecycle hook payloads, rollout files, and telemetry already on disk. |
| Privacy by default | Store IDs, counts, hashes, timestamps, and short optional snippets; never store full prompts or outputs by default. |
| Portable kit design | PowerShell 5.1 and pwsh 7 compatible, self-gitignored runtime data, rendered UPM payload parity. |

## Player Fantasy

The user finishes a task and sees an accurate footer:

`codex: turn 1m25s | est $0.35 | session $0.35 (1 turn) | in 36.2k | out 2.0k | cacheR 220.7k`

The Unity panel then lets the user inspect:

- Current session usage, including turns, messages, model calls, tools, agents, cache, and cost.
- Project usage by 24h, 7d, 30d, and retention windows.
- Model distribution, agent distribution, tool distribution, and unpriced or partial data warnings.
- Raw data health: last ingested event, source adapter status, schema confidence, and rebuild status.

## Core Loop

1. Agent runtime emits or writes local activity.
2. Ingestor reads only new source records and normalizes them into v2 events.
3. Session resolver attaches events to a logical session, trace, turn, span, and agent scope.
4. Rollup builder updates materialized views.
5. Footer and Unity panel render current-session and project views.
6. User spots high spend, stale data, overuse of a model, or a costly agent pattern.
7. User adjusts workflow, model, role, or limits and repeats.

## Feature Systems

| System | Responsibility | Current code touched |
|---|---|---|
| Source adapters | Read Claude transcripts, Codex rollout files, Gemini telemetry, and future Antigravity sources defensively. | `scripts/usage-report.ps1`, `scripts/usage-common.ps1` |
| Event store | Append normalized immutable v2 JSONL events with idempotency keys. | new helpers in `scripts/usage-common.ps1` |
| Session resolver | Build stable logical sessions from provider IDs, thread/window IDs, cwd, model, environment, topic hints, and timestamps. | `scripts/usage-report.ps1`, new v2 resolver |
| Trace and span model | Represent a user turn, model call, subagent run, tool call, and lifecycle hook as related entities. | new v2 schema |
| Rollup builder | Rebuild current-session, session-index, stats-summary, and agent-summary from events. | `scripts/usage-stats.ps1` |
| Pricing layer | Price model usage with cache read/write semantics and a clear price source label. | `scripts/usage-common.ps1`, `scripts/usage-prices.json` |
| Footer renderer | Render current logical session, not global history. | `scripts/usage-footer.ps1` |
| Unity analytics panel | Display current session, historical windows, agents, models, tools, warnings, and settings. | `upm/Editor/AgentKitUsagePanel.cs` |
| Migration | Import v1 `history.jsonl` as historical summary events without corrupting current sessions. | new migration function |
| Validation | Use fixtures and replay tests for session identity, idempotency, pricing, and rollups. | scripts plus scratch fixtures |

## Data Entities

| Entity | Meaning | Key fields |
|---|---|---|
| Project | Installed kit project root. | `projectId`, `rootHash`, `stack`, `kitVersion` |
| Environment | Runtime environment for a source event. | `platform`, `cwd`, `host`, `shell`, `timezone`, `sandbox`, `approvalPolicy` |
| Session | A user-visible conversation or work session. | `sessionId`, `providerSessionId`, `threadId`, `windowId`, `title`, `topicHash`, `startedUtc`, `endedUtc`, `status` |
| Trace | One user request and all work spawned from it. | `traceId`, `sessionId`, `turnOrdinal`, `userMessageId`, `startedUtc`, `endedUtc` |
| Span | One model call, tool call, agent run, hook run, or scan. | `spanId`, `traceId`, `parentSpanId`, `kind`, `name`, `model`, `agentRole`, `status` |
| Message | User, assistant, tool result, or system message metadata. | `messageId`, `traceId`, `role`, `length`, `contentHash`, `snippet` |
| Usage | Token and cost delta attached to a span. | `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `reasoningTokens`, `estimatedCostUsd` |
| Agent | A named role/subagent/workflow participant. | `agentId`, `role`, `source`, `readonly`, `runs`, `lastUsedUtc` |
| Tool | Local shell, file edit, MCP, browser, Unity, or other tool execution. | `toolName`, `toolKind`, `durationMs`, `status`, `exitCode` |
| View | Materialized rollup from the event log. | `generatedUtc`, `sourceWatermark`, `complete`, `warnings` |

## Runtime Storage

All runtime data stays under `.agents/usage/`, which is self-gitignored.

```
.agents/usage/
  v2/
    events/
      2026-07-08.jsonl
    state/
      ingestors.json
      migrations.json
    views/
      current-session.json
      session-index.json
      stats-summary.json
      agent-summary.json
      tool-summary.json
    reports/
      last-report.md
      usage-stats.md
```

The event log is append-only. Views are disposable and rebuilt from events plus current price tables.

## Event Types

Minimum v2 event set:

- `session.observed`
- `session.updated`
- `trace.started`
- `trace.ended`
- `message.recorded`
- `agent.started`
- `agent.ended`
- `span.started`
- `span.usage`
- `span.ended`
- `tool.completed`
- `price.snapshot`
- `rollup.completed`
- `migration.imported`
- `source.warning`

Every event has:

- `schemaVersion`
- `eventId`
- `idempotencyKey`
- `observedUtc`
- `source`
- `sourcePath`
- `sourceOffset`
- `confidence`
- `projectId`
- `sessionId`
- `traceId`
- `spanId`

## Balance Data

| Setting | Default | Reason |
|---|---:|---|
| `retentionDays` | 90 | Enough history for trends without unbounded growth. |
| `storePromptText` | false | Privacy default. |
| `storeOutputText` | false | Privacy default. |
| `snippetMaxChars` | 120 | Optional diagnostics without storing full content. |
| `codexScanEnabled` | true | Codex has no kit-owned stop hook. |
| `currentSessionStaleHours` | 12 | Prevent stale footer reuse. |
| `rebuildOnSchemaMismatch` | true | Views are disposable. |
| `priceRefreshDays` | 7 | Existing behavior. |
| `unknownPricePolicy` | warn | Never present missing prices as zero. |
| `toolCaptureMode` | metadata | Tool names/status/duration, no command bodies by default. |

## MVP Scope

MVP V2 ships when:

- Current-session footer is sourced from v2 views.
- Codex, Claude, and Gemini produce normalized v2 events.
- V1 `history.jsonl` still works during a dual-write period.
- Unity panel can show Current Session, Windows, Models, Agents, Tools, and Health views.
- Rebuild command can regenerate views from events.
- Tests cover identity reset, duplicate source events, unpriced models, partial scans, and corrupt lines.

## Milestones

### M1 - Schema and Fixtures

Create schema docs, event helpers, fixture data, and replay tests. No UI changes. No behavior changes.

Acceptance:

- `New-UsageEvent`, `Add-UsageEvent`, `Get-UsageV2Dir`, `Get-UsageProjectId`, and `Get-UsageIdempotencyKey` exist.
- Fixture replay can build current-session and stats views without touching real transcripts.
- Unknown fields are preserved or ignored safely.

### M2 - Dual Write for Claude and Codex

Extend existing hook and scan paths to emit v2 events while preserving v1 outputs.

Acceptance:

- Existing footer and panel still work from v1.
- v2 events are append-only and idempotent.
- Codex logical session is based on window/thread identity when available, not rollout file totals.

### M3 - Rollup Builder

Rebuild materialized views from v2 events.

Acceptance:

- `current-session.json` shows one logical session with turns, messages, model calls, tokens, cache, agents, tools, wall time, and cost.
- `stats-summary.json` keeps a compatibility shape for the current Unity panel, then adds v2 fields.
- Re-running the rollup is deterministic.

### M4 - Footer Cutover

Switch `usage-footer.ps1` to read v2 current-session view first, v1 last-report fallback second.

Acceptance:

- A new Codex chat that performs one task shows one-session usage, not all historical Codex usage.
- Footer says when v2 data is unavailable and why.

### M5 - Unity Analytics Panel

Split the usage UI into focused tabs or sections: Current Session, Trends, Models, Agents, Tools, Health, Settings.

Acceptance:

- Current Session shows session ID, title/topic, platform, model, turns, messages, calls, tokens, cache, cost, and source confidence.
- Agents view shows role, runs, tokens, cost, duration, and last used.
- Tools view shows tool kind/name/status/duration, with privacy-safe metadata.
- Health view shows last event, adapter status, warnings, and rebuild button.

### M6 - Migration and Cleanup

Import v1 history as historical summary records, keep v1 fallback for one release, then remove direct v1 aggregation dependencies.

Acceptance:

- Existing users keep 24h/7d/30d stats.
- Current-session totals are not inflated by imported v1 project history.
- Migration is idempotent and records its watermark.

### M7 - Advanced Analytics

Add budgets, anomaly hints, export, and optional privacy-controlled prompt/output snippets.

Acceptance:

- User can set warning thresholds for session spend, daily spend, and cache miss ratio.
- Panel flags high burn rate, unpriced models, excessive tool failures, or repeated retries.
- Export writes sanitized JSON/Markdown without full prompt text unless enabled.

## Cut Lines

Do not include in V2 MVP:

- LLM-as-judge quality scoring.
- Remote telemetry upload.
- Cross-project cloud sync.
- Full prompt/output storage by default.
- Billing claims beyond API-equivalent estimates.
- Antigravity adapter until a stable machine-readable source exists.

## User Review Required

This draft is not an implementation contract until these decisions are answered:

1. Storage engine: keep JSONL plus materialized JSON views for V2, or introduce SQLite now? Recommended: JSONL plus views first, SQLite only if query speed becomes a real issue.
2. Privacy default: metadata-only by default, with optional snippets, or store full prompt/output text locally? Recommended: metadata-only plus hashes and opt-in snippets.
3. Migration: dual-write v1/v2 for one release, or hard cut to v2? Recommended: dual-write for one release.
4. UI priority: current-session correctness first, or full historical analytics first? Recommended: current-session correctness first.
5. Tool analytics: capture tool command metadata only, or command bodies too? Recommended: metadata only.
6. Budgets: warnings only in V2, or hard blockers? Recommended: warnings only; hard blockers need stronger UX and platform support.
