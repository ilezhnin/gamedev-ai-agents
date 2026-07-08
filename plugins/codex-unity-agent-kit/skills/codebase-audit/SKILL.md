---
name: codebase-audit
description: Run a read-only whole-project issue audit and write a separate report without changing the project. Use when the user asks to analyze a Unity, C# game, or ASP.NET codebase for code quality, script organization, overengineering, bugs, vulnerabilities, security checks, silent fallbacks, runtime Unity object/field authoring, rollback/save/GGPO readiness, strict determinism, or asks to split audit work across subagents by block, module, or file.
---

# Codebase Audit

## Goal

Find real project risks without modifying source, scenes, assets, settings, lockfiles, or generated files. The only allowed write is the final Markdown report, normally `.agents/plans/codebase-audit-YYYY-MM-DD.md` unless the user gives another path.

## Non-Negotiables

- Stay read-only. Do not edit code, scenes, prefabs, assets, package files, config, migrations, tests, or project contracts.
- Do not run commands that intentionally rewrite project state, generate files, migrate databases, import assets, format code, or update packages. If a build/test command would write `bin/`, `obj/`, `Library/`, generated code, or snapshots, skip it unless the user explicitly approved it for this audit.
- Every finding needs `file:line`, severity, confidence, evidence, impact, and a suggested verification or fix direction. Mark unproven suspicions as "needs verification", not findings.
- Prefer existing project contracts: `AGENTS.md`, `.agents/ARCHITECTURE.md`, `.agents/CODE_STYLE.md`, `.agents/DEPENDENCIES.md`, CI docs, package manifests, and nearby tests.
- Keep vendor, cache, generated, and imported code out of scope unless a project-owned wrapper or dependency contract makes it relevant.

## Workflow

1. **Scope**: identify stack and boundaries. Unity projects have `Assets/`, `Packages/`, and `ProjectSettings/`; backend projects have `.sln`, `.slnx`, `.csproj`, `src/`, `tests/`, and deployment/config files.
2. **Inventory**: map project-owned modules, tests, package manifests, persistence/save/database code, auth boundaries, networking, deterministic simulation paths, and CI/validation commands.
3. **Decompose**: for broad audits, use subagents when available. Split by high-risk module or by audit lane: code quality, script organization, overengineering, bugs, vulnerabilities, security check, silent fallbacks, Unity runtime authoring, rollback/save/GGPO readiness, and strict determinism.
4. **Delegate read-only**: each subagent must inspect fresh files, avoid edits, cite evidence, report "none found" when clean, and name skipped areas. Do not pass parent conclusions into reviewer prompts.
5. **Synthesize**: deduplicate overlapping findings, reject weak claims, order by severity, and preserve minority reports as "needs verification" when evidence is incomplete.
6. **Report**: write the Markdown report to the chosen path and state that no project files were changed besides the report.

## Audit Lanes

### Code Quality

- Ownership and boundaries: parallel managers/services, fat interfaces, one-caller public APIs, cross-layer reach-through, missing boundary enforcement (asmdefs, DI, or guard tests), or leaked SDK types.
- Script organization: root layer-first workflow splits, unclear non-layer folders beside layer folders, new parking-lot folders, folder/namespace mismatches, or using blocks that violate the local contract.
- Maintainability defects: duplicated mutable state, complex control flow, unowned compatibility wrappers, dead code with live references, oversized files, nested types, and test-hostile design at real nondeterministic boundaries.
- Project consistency: deviations from local naming, lifecycle, error handling, dependency, and documentation contracts when they create real maintenance risk.

### Overengineering

- Flag abstractions that do not pay rent: one-implementation interfaces, speculative facades/registries/factories, public APIs with one internal caller, decorative patterns, and compatibility wrappers without an owner and removal condition.
- Prefer deletion or narrowing before new structure. A cleanup/refactor that grows production code needs a concrete boundary, duplicated invariant, test seam, or multiple real call sites.
- In Unity, check for new managers, services, event buses, reflection/config layers, or ScriptableObject registries that bypass simpler serialized references, prefab composition, or existing project-owned extension points.

### Bugs

- Unity: lifecycle races, missing unsubscribe/cancel paths, `Update` vs `FixedUpdate` drift, coroutine/async lifetime bugs, serialization renames without compatibility, prefab/scene reference risks, save migration mistakes, and UI/input edge cases.
- Backend: broken route/DTO/status contracts, null/empty/error path defects, transaction gaps, race conditions, non-idempotent retries, migration/data-loss risks, background-worker shutdown bugs, and test coverage that misses changed behavior.
- Shared C#: exception swallowing, invalid default values, stale caches, unordered mutation paths, culture/timezone bugs, and concurrency hazards.

### Silent Fallbacks

- Flag broad catches, null-swallowing, default asset/config substitution, empty IDs as failure markers, best-effort no-ops, scene-wide searches, and runtime repair paths that hide broken authoring, wiring, migrations, or external operations.
- Accept fallback behavior only when it is deliberate product behavior with a named owner, telemetry/logging, tests, and documented user-facing/degraded-mode semantics.
- Prefer fail-fast validation at editor/build/startup boundaries for required references, catalogs, save schemas, config, auth policy, and network contracts.

### Unity Runtime Authoring

- Flag runtime construction or configuration of GameObjects, components, UI layouts, serialized fields, materials, ScriptableObject-like data, tags/layers, or prefab hierarchies when the same stable structure could be authored once in a scene, prefab, or asset.
- Runtime `Instantiate` is acceptable for existing prefabs, pooled views, spawned gameplay objects, dynamic content, or data-driven rows. Assembling raw `GameObject`/`RectTransform`/component trees in code needs a specific runtime variability reason.
- Check for `AddComponent`, `new GameObject`, repeated `GetComponent`, `Find*`, Resources loads, or default-value wiring used to compensate for missing prefab/scene references; these are findings when they mask authoring defects.

### Vulnerabilities

- Dependency risk: vulnerable or abandoned packages, unsafe transitive exposure, weak license/provenance records for shipped assets or libraries, and unpinned toolchain drift.
- Input handling: SQL/NoSQL injection, path traversal, unsafe deserialization, over-posting, command injection, SSRF, file upload abuse, mod/save tampering, and untrusted network payloads.
- Data exposure: secrets, tokens, connection strings, personal data, internal errors, or sensitive gameplay/economy state written to logs, configs, snapshots, or client-visible responses.

### Security Check

- Authentication, authorization, ownership, tenant, role, scope, and policy enforcement must happen server-side at every external boundary.
- Check CORS, cookies, JWT validation, CSRF posture, rate limits, size caps, webhook signature validation, replay protection, and error response shape.
- For Unity clients, treat saves, mods, local config, remote config, economy inputs, matchmaking payloads, and player-authored content as hostile.

### Rollback Save / GGPO Ready

- Unity save readiness: versioned save schema, deterministic field order, backward-compatible migrations, corrupted-save recovery, atomic writes, last-known-good fallback, and clear rollback notes for risky changes.
- GGPO/rollback readiness: fixed tick input collection, deterministic simulation state, compact snapshots, reversible commands, isolated side effects, rollback-safe animation/VFX/audio boundaries, and no render-frame authority over gameplay.
- Backend rollback readiness: reversible or explicitly forward-only migrations, data backup/restore notes, feature flags, idempotent handlers, contract compatibility, safe deploy order, and rollback-safe background jobs.

### Strict Determinism

- Flag wall-clock gameplay decisions, frame-rate-dependent simulation, global/static random, unordered collections in authoritative logic, async race-dependent commits, floating-point drift across platforms, and hidden singleton state.
- Require stable seeds, fixed-step simulation, deterministic sort keys, snapshot-friendly state ownership, replayable inputs, and deterministic cache invalidation.
- For backend jobs, check idempotency keys, deterministic ordering, retry semantics, concurrency locks, clock injection, and externally visible side effects.

## Report Format

Use this structure:

1. Title with date, stack, scope, report path, and "read-only audit".
2. Executive summary: risk level, finding counts by severity, and top three blockers.
3. Coverage: files/modules inspected, subagents or lanes used, commands run, commands skipped because they would modify project state.
4. Findings grouped by lane. Each finding: ID, severity `P0-P3`, confidence `high/medium/low`, `file:line`, evidence, impact, suggested fix, suggested verification.
5. Clean areas: important lanes inspected with no findings.
6. Gaps and assumptions: unavailable files, generated/vendor exclusions, validation not run, and follow-up audits recommended.
