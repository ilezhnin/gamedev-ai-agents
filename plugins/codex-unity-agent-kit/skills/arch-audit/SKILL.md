---
name: arch-audit
description: Audit a module or system architecture and produce a dependency-ordered, developer-ready refactor backlog. Use when the user asks for an architecture audit or review, a module cleanup or decomposition plan, dependency untangling, boundary analysis, says the code became spaghetti or a god class, or wants a refactor planned before anyone edits code.
---

# Architecture Audit

## Goal

Inspect a whole module or system - not just the open file - and produce a developer-ready Markdown plan a lead can execute and delegate. This skill plans; it does not implement. Output goes to `docs/tickets/<module>-architecture-audit.md` (create `docs/tickets/` when missing).

## Principles Lens

Judge everything through these, by name, in the findings:

- **SRP / SOLID**: one reason to change per type; depend on narrow abstractions at real boundaries; no leaky or fat interfaces.
- **KISS / DRY**: the simplest shape that solves the problem; duplication is a finding only when the copies must evolve together.
- **Systems hierarchy**: decompose into systems and subsystems, each isolated with one public API and one entry point, so a subsystem can be replaced, extended, or tested alone.
- **Patterns where they pay**: use Gang of Four patterns when they remove real coupling or duplication (factory for families, strategy for swappable policy, observer for decoupled events, adapter at boundaries). Naming a pattern is never a justification by itself.
- **Anti-overengineering**: no abstractions or entities for their own sake. Delete before abstracting. A new interface, facade, registry, or helper must pay for itself by removing duplication or creating a boundary with multiple real call sites. Public surface is a liability: a public member with one internal caller is a private detail. Compatibility wrappers must have an owner and a removal condition.
- **Economical growth**: before proposing new code, check what already exists and whether less code solves it. A cleanup pass should be neutral or negative in production code; net-new code needs an explicit reason.

## Workflow

1. **Inventory**: list every file in the target module; classify by responsibility: public API, runtime orchestration, domain model, content/data loading, presentation/view, diagnostics, adapters, tests, documentation.
2. **Dependency map**: which subsystems know about each other; which dependencies violate boundaries (UI mutating runtime internals, algorithms consuming foreign types directly, diagnostics reaching into runtime fields). In Unity, read asmdef references; missing asmdefs in a growing module is itself a finding.
3. **Trace flows**: initialization, loading, command execution, per-frame/per-request work, presentation, diagnostics, shutdown, reload, failure, retry.
4. **State ownership**: one owner and one mutation path per mutable state. Find duplicated state, hidden mutation paths, cache ownership gaps, lifecycle races, silent failures.
5. **Target architecture**: define it as narrow public ports, internal services, domain models, adapters, diagnostics read models, and tests. Every subsystem gets one public API/entry point; cross-module data enters through adapters and becomes module-owned.
6. **Backlog**: dependency-ordered tasks in the format from `references/audit-process.md` (stable ID, severity, depends-on, scope, non-goals, work, acceptance criteria, required tests, verification, rollback note). Behavior and ownership fixes before broad cleanup.
7. **Verification plan**: builds, focused tests, source-level boundary scans, `git diff --check`, and Unity/editor or service constraints.
8. **Migration plan**: compatibility wrappers with removal conditions, call-site migration, serialized data and content compatibility, documentation updates.

## Stack Notes

- Unity: asmdefs are the boundary enforcement mechanism - runtime/editor/tests split per module, no cycles, minimal references. Propose introducing them where a module has outgrown `Assembly-CSharp`; do not propose removing them as cleanup.
- Unity: gameplay-critical findings include nondeterminism (render-frame coupling, wall-clock time, unordered iteration, static random) and serialized-contract risks.
- Backend: composition root and DI registrations are the wiring boundary; SDK types leaking through gameplay/service-facing APIs are boundary findings; migrations and persisted contracts get the same versioning discipline as save data.

## Stop Conditions

Stop and ask when:

- The requested scope is ambiguous (one module vs the whole project).
- The audit reveals product decisions (feature removal, behavior change) that a refactor must not decide alone.
- Reading the module requires credentials, closed-source packages, or generated code that is unavailable.

## Final Report

- Audit document path and the module map it covers.
- Top findings ordered by severity, each naming the violated principle or boundary.
- Backlog size and the first three executable tasks.
- What was not inspected and why.
- Recommended next step: usually `$planning` for the first task, then `$crossworking` to execute.

## Reference

Read `references/audit-process.md` for the required task format, refactor discipline, verification gate, and the definition of done for module refactors.
