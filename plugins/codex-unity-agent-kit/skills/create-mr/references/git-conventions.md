# Git Conventions

## Commit Types (Conventional Commits)

- `feat:` new user-facing behavior.
- `fix:` bug fix.
- `docs:` documentation only.
- `style:` formatting only, no behavior change.
- `refactor:` behavior-preserving restructuring.
- `perf:` measured performance improvement.
- `test:` adding or fixing tests only.
- `build:` build system, packages, project files, csproj/manifest changes.
- `ci:` CI configuration.
- `chore:` maintenance that fits nothing above.
- `revert:` reverts a previous commit; reference it.

Optional scope: `feat(inventory): add stack splitting`. Keep scopes short and consistent with the repo's history.

## Message Rules

- Imperative mood: "add", not "added" or "adds".
- Subject line lowercase after the type, no trailing period, aim for <= 72 characters.
- Body (when needed) explains why, not what the diff already shows.
- Breaking changes: append `!` after the type (`feat!:`) and add a `BREAKING CHANGE:` footer describing the migration.
- Banned messages: "Fix bug", "Update code", "Phase 1", "WIP", "Add convenience functions", "Misc changes".

## Atomic Commits

- One logical change per commit: it is self-contained, includes its tests, and the project compiles after it.
- Do not mix a refactor and a behavior change in one commit.
- Unity: keep scene/prefab/asset churn in the commit that caused it, and mention it in the message when significant.
- Checkpoint commits during long work are fine locally; squash or reword them before pushing if the repo keeps a clean history.

## Branch Naming

- `feat/<task-name>`, `fix/<task-name>`, `chore/<task-name>`; also acceptable when the repo uses them: `docs/`, `refactor/`, `perf/`, `test/`.
- Task name: 2-5 lowercase words, hyphen-separated, describing the outcome (`fix/save-migration-crash`), never a ticket number alone unless that is the repo convention.

## Pre-Commit Checklist

- Every staged line traces to the task.
- No secrets, tokens, real connection strings, keystores, or license files.
- No `Library/`, `Temp/`, build output, `TestResults/`, or IDE noise.
- `git diff --check` passes (no whitespace errors, no conflict markers).
- Direct consumers updated: tests, docs, content references affected by the change.
