# Architecture Contract (Unity)

This document is the project-wide architecture contract. It governs module ownership, data flow, lifecycle, boundaries, determinism, and integration rules. `CODE_STYLE.md` governs source-level style; `AGENTS.md` holds the module map and working rules. Read this before starting module work, reviewing a refactor, adding a public API, or introducing a new system boundary.

This file installs as the kit's default contract. On install, review each section against the actual codebase: delete or adjust rules that do not describe this project (an existing project rarely matches all of them on day one). Until that review happens, treat divergence between code and this document as a discussion item for the user, not as a defect to fix toward the contract.

## Architecture Standard

The project uses a modular runtime architecture. MVC is acceptable for UI-facing flows, but it is not the architecture of the whole project. Core simulation and engine-like systems are organized around modules, ports, adapters, domain models, deterministic services, explicit lifecycle, and read-only diagnostics.

Every major system fits this shape:

```text
External caller / composition root / UI / simulation
  -> narrow public module port or composition facade
  -> command/query API with typed outcomes
  -> lifecycle gate
  -> internal runtime services
  -> domain models, catalogs, caches, state owners
  -> presentation/view adapters
  -> diagnostics read models
```

External callers must not know how internal services, catalogs, caches, or storage formats are implemented.

## Non-Negotiables

- Prefer plain C# domain logic. Unity APIs (`MonoBehaviour`, `ScriptableObject`, prefabs, editor APIs) live at boundaries where they add clear value.
- Gameplay-critical simulation is deterministic and tick-driven. Never derive gameplay outcomes from render frame rate, Unity physics side effects, animation sampling, wall-clock time, static random state, or unordered iteration.
- Modules integrate through narrow role ports. Feature code depends on the smallest interface it needs, never on concrete runtime hosts or aggregate facades.
- One authority per mutable state: settings, lifecycle, catalogs, runtime state, presentation state, persistence, and diagnostics never have parallel mutable owners.
- Failure is explicit: typed outcomes, no silent no-ops, no swallowed exceptions, no empty IDs as failure markers, no "completed" results for rejected work.
- Data flow is directional: authored content and input create domain requests; runtime services process them; presentation applies results; diagnostics observes read models.
- One file - one entity, no exceptions; nested types are forbidden (see `CODE_STYLE.md`).
- Boundaries are defended: assembly definitions and/or editor-only source scans catch forbidden dependencies.
- Optimize only after ownership and correctness are clear; performance work never exposes mutable internals.

## Module Shape

A module is a runtime, editor, content, or presentation capability with a clear owner, a public boundary, lifecycle rules, and a nameable responsibility. Folder and namespace shape reflect real ownership; asmdefs are used when the project chooses assembly-level enforcement:

```text
ModuleName/
  Api/             stable external contracts: role ports, typed results
  Core/            lifecycle, command execution, runtime services, adapters, ports
  Model/           domain concepts: ids, requests, results, snapshots, definitions
  View/            presentation applied to Unity objects (runtime and editor)
  Diagnostics/     read-only observation models and views
  Documentation/   living module docs
  Tests/           EditMode/PlayMode tests near the owner
  <SubsystemName>/ optional owned workflow with its own layers
```

Layer folder vocabulary is fixed: `Api`, `Core`, `Model`, `View`, `Diagnostics`, `Tests`, and `Documentation`. Use only layers the module actually needs. Unity-special `Editor` and `Resources` folders are legal where Unity requires them and are not architecture layers.

## Subsystem-First Structure

Beside layer folders, the only legal sibling folder is a real subsystem. A subsystem recursively has its own layer folders (only the layers it needs) and may nest deeper subsystems. Folder and namespace mirror at every level.

```text
ModuleName/
  Api/
  Core/
    Native/        legal grouping folder inside a layer
  Model/
  Diagnostics/
  FirstWorkflow/
    Api/
    Core/
    Model/
    View/
  SecondWorkflow/
    Core/
    Model/
    NestedWorkflow/
      Core/
      Model/
  Tests/
    Editor/
  Documentation/
```

Subsystem rules:

- A subsystem earns its own folder only with real volume: a named workflow, a clear owner and lifecycle, several related types, and its own layer shape.
- Thin concerns with one or two files fold into the parent `Core` or `Model` instead of getting a named folder. Prefer folding; promote only when the workflow becomes named, owned, and growing.
- Multi-workflow modules are subsystem-first. Do not scatter one workflow across root `Api`/`Core`/`Model`/`View` just because those folders exist.
- Each module and subsystem keeps one public API and one entry point so it can be replaced, extended, or tested alone.
- Single-layer subsystems are legal: a View-only or Model-only workflow does not need fake `Core`.
- Grouping folders inside a layer, such as `Core/Native`, are legal. The "thin unclear folder" rule applies to non-layer folders beside layer folders, not to grouping inside a layer.
- Do not introduce new parking-lot folders such as `Managers`, `Services`, `Systems`, `Utils`, or `Runtime`. Existing legacy folders are migration context, not a pattern to copy.
- Never create: `Feature/Core/OneClass.cs`; an `Api/IFoo.cs` for one call site; a facade over a facade; a folder whose only purpose is a shorter class name.

## Assembly Boundaries

Detect the project's boundary mechanism before proposing changes. Assembly definitions are the kit's default enforcement mechanism, but some projects deliberately keep gameplay code in one assembly and enforce boundaries with source-scan guard tests. The absence of per-module asmdefs is not a finding when that policy is documented and guarded.

For asmdef-based projects:

- One asmdef per module: runtime, `Editor`, and tests. New modules do not grow the `Assembly-CSharp` monolith.
- References are minimal and explicit; no cycles; no editor references from runtime assemblies; platform leakage blocked with define constraints.
- A dependency that asmdef references cannot express cleanly is an architecture smell: add an adapter or a narrower port, not a reference chain.
- Do not remove or restructure asmdefs as cleanup without an explicit architecture decision.

For asmdef-less projects:

- Boundary enforcement moves to editor-only source scans or guard tests under the owning module's `Tests/Editor`.
- Guard tests scan the on-disk source tree (for example through `Application.dataPath`) and fail on forbidden folder tokens, illegal layer references, cross-module reach-ins, and folder/namespace mismatches.
- Propose or strengthen guard tests before proposing asmdefs when the project documents an asmdef-less policy.

## Layer Rules

- **Domain model**: plain C#; no dependencies on presentation, diagnostics views, editor UI, or runtime orchestration. Cross-module data converts into module-owned data at the boundary. Public snapshots are immutable to consumers.
- **Runtime core**: owns lifecycle, command execution, tick processing, caches, and active state. Services are small enough to name directly (dispatcher, lifecycle gate, snapshot builder). Lifecycle states define which commands are accepted, rejected, or deferred during loading and shutdown.
- **Public API**: consumer-focused ports returning typed outcomes. Never exposes mutable collections, concrete internal services, reusable buffers, or external SDK models. C# `public` outside `Api` or a documented boundary is still an implementation detail.
- **Presentation/View**: applies runtime output to Unity objects. Owns no gameplay policy, no admission policy, no command result mapping. Runtime core depends on narrow presentation ports, not concrete viewers or prefabs.
- **Adapters**: the only place a module understands another module's (or an SDK's) concrete data shape. Live at composition/binding boundaries, never inside domain algorithms.
- **Diagnostics**: observes without owning. Consumes read models/snapshots only; expensive diagnostics are opt-in; disabling diagnostics clears diagnostics-owned state.

Forbidden shapes: a UI panel mutating a runtime service directly; a bridge storing a concrete facade when it needs a command sink; a diagnostics renderer reading runtime fields; a simulation algorithm consuming another module's frame type directly; a catalog resolver executing commands.

## State, Commands, Results

For every module answer explicitly: who owns lifecycle readiness, settings, content catalogs and reload generation, active runtime instances, presentation allocation, diagnostics state, persistence and migration, and network authority.

- A state mutation succeeds, is rejected, is deferred, or fails with a typed reason. Rejected work never mutates success state.
- Lower layers return domain outcomes; higher orchestration maps them to user-facing results.
- Retry behavior after failure is documented and tested.

## Determinism, Networking, Replay

- Tick-based simulation for gameplay state; randomness from an explicit seeded source owned by the simulation or command context.
- Networked state changes flow through commands, snapshots, or deterministic inputs that can be replayed.
- If async work or jobs contribute to gameplay state, committed outputs are ordered by stable IDs before application.
- Presentation, audio, VFX, and diagnostics never feed back into deterministic simulation unless explicitly modeled.

## Content And Catalogs

- Large content systems use domain catalog ports (`IWeaponCatalog`-style), not monolithic aggregates.
- Content loading reports structured errors for invalid content; authoring schemas define defaults, clamping, versioning, and cycle detection where fallback chains exist.
- Default loadable content to Addressables or the project's declared async content pipeline. Use `Resources/` only for bootstrap-critical assets that must load synchronously before the content pipeline exists, and document the reason in the owning module or authoring guide.
- Editor validation catches invalid IDs, missing references, cycles, and unsupported values before runtime.
- Runtime caches that depend on content include generation/version invalidation; reloaded content leaves no stale resolved data.
- Existing authored content stays compatible unless a migration plan is documented.

## Snapshots, Caches, Data Flow

- Public and runtime snapshots are immutable or defensively copied. `IReadOnlyList<T>` is not isolation if the producer still mutates the backing list.
- Reusable internal buffers are allowed only if no public result or diagnostics object can observe later mutations.
- Cache keys are collision-safe: hashes may precheck, equality uses canonical IDs.
- Caches over scene/content data carry generation/version invalidation. Snapshot builders never mutate subsystem state.

## Concurrency And Async

- Default runtime model: single-threaded, tick-driven, deterministic. Jobs, threads, or task fan-out require an explicit architecture decision plus determinism tests.
- Gameplay-critical decisions happen on the authoritative simulation path, never in background continuations.
- Async loading reports loading/success/missing/cancelled/failed as typed states; no caller waits forever (cancellation, timeout, or fault state).
- Unity object access stays on the main thread.

## Serialization And Save Compatibility

- Serialized data that outlives a session (saves, replays, network payloads, authored content) is versioned and migration-aware.
- Renamed fields, moved IDs, and changed defaults get migration paths; runtime-only class layout is never accidentally a save format.
- Player-authored and external content is validated before it reaches runtime systems.
- Temporary wrappers and migration helpers have an owner, active call sites, and a removal condition.

## External Integrations

- External services (mods, cloud, analytics, platform SDKs) live behind project-owned facades or adapters; SDK types never leak through gameplay-facing APIs.
- Network, file, and cloud calls define timeout and failure behavior; offline and degraded behavior is documented for player-facing features.
- External callbacks enqueue work through the owning module, never by reaching into runtime internals.

## Testing Requirements

Every major module keeps layered verification:

- Behavior tests for public API results and important failure modes.
- Lifecycle tests: initialization, loading, reload failure, retry, shutdown, pre-ready commands.
- Boundary tests or editor-only source scans for forbidden dependencies.
- Content tests: defaults, fallback, invalid data, migration.
- Snapshot immutability and cache invalidation tests.
- Determinism/replay tests for gameplay-critical systems.

## Governance

- Significant cross-module decisions are captured as short architecture notes in `docs/tickets/` or module `Documentation/`.
- Architecture audits and refactor backlogs are produced by `$arch-audit` and live in `docs/tickets/`.
- A refactor states its non-goals; cleanup passes are neutral or negative in production code by default.
- If implementation diverges from this document, fix one of them before the work is considered complete.
