# Audit Process Reference

## Required Task Format

Every backlog task uses this shape:

```markdown
### <MODULE>-ARCH-001: <one clear architectural outcome>

- Severity: Critical | High | Medium | Low
- Depends on: <task IDs that must land first, or "none">
- Scope: <exact files, folders, or subsystem boundaries expected to change>
- Non-goals: <adjacent work that must not be mixed into this task>
- Work:
  1. <concrete implementation step>
  2. <concrete implementation step>
- Acceptance criteria:
  - <observable condition that proves the task is complete>
- Required tests: <behavior, boundary/source-scan, regression, or performance checks>
- Verification: <builds and commands to run>
- Rollback/migration note: <compatibility or serialized-data risk, or "none">
```

Rules:

- Task IDs are stable; never renumber after publishing.
- Non-goals are mandatory - they stop cleanup tasks from becoming rewrites.
- Work in dependency order: behavior, ownership, and boundary fixes before broad cleanup.
- If a task reveals a larger issue, add a new task instead of widening the current one.

## Refactor Discipline

- A cleanup pass is neutral or negative in production code by default. Record the production-code balance; a pass that grows code must be reworked, split, or justified explicitly.
- Ownership first, extraction second: move or split code only after the real owner is obvious from call sites, invariants, lifecycle, and data flow.
- Delete before abstracting. Prefer negative-only changes: remove false public surface, dead shortcuts, duplicate state, stale compatibility wrappers, one-use helpers.
- Do not change runtime behavior as a side effect of cleanup; behavior changes are separate explicit tasks.
- Audit call sites with source search before removing or widening any public member.
- Convenience members (`Empty` values, `With*` clones, `Can*` probes, extra overloads) need multiple real call sites or a protected invariant.
- Do not mix line-ending churn, mass formatting, or mechanical call-site migration into architectural diffs.

## Verification Gate

A task is verifiable when all of these pass or are explicitly blocked with a reason:

- Relevant runtime and editor/test assemblies build.
- `git diff --check` is clean on touched files.
- Focused tests for the touched contract pass (EditMode/PlayMode for Unity, targeted `dotnet test` for backend).
- Boundary tests or source scans still prevent the forbidden dependencies this audit identified.
- No unrelated formatting or asset churn is mixed into the diff.

## Definition Of Done For Module Refactors

- External callers use narrow public ports instead of concrete internals.
- Internal dependencies match the dependency map; no contract bypasses.
- Every mutable state has one authority and one mutation path.
- Commands and operations return typed, explicit outcomes; rejected work does not mutate success state.
- Lifecycle readiness, retry, reload failure, and shutdown behavior are documented and tested.
- Public snapshots are immutable or defensively copied; caches invalidate deterministically when sources change.
- Cross-module data enters through adapters and becomes module-owned before core processing.
- Diagnostics are read-only and decoupled from runtime internals.
- Documentation describes the implemented architecture, not the pre-refactor one.
