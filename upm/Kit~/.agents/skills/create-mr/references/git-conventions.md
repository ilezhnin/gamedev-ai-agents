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

- English only: commit messages, branch names, and PR titles/bodies are always English, regardless of the conversation language.
- Imperative mood: "add", not "added" or "adds".
- Subject line lowercase after the type, no trailing period, aim for <= 72 characters.
- The subject states the behavioral result, usually through the domain/module: `fix: bound rewind audio retention by state history window`.
- Prefer concrete behavioral verbs: add, remove, route, keep, prevent, preserve, expose, cover, trim, collapse, simplify.
- Body (when needed) explains why, or lists concrete changes as `-` bullets - each bullet one specific change, check, or wiring detail. Mention important tests, docs, or diagnostics that were part of the work. A series of related cleanups may use conventional mini-headings (`refactor: ...`) followed by bullets.
- Breaking changes: append `!` after the type (`feat!:`) and add a `BREAKING CHANGE:` footer describing the migration.
- Banned messages: "Fix bug", "Update code", "Phase 1", "WIP", "Add convenience functions", "Misc changes".
- No AI attribution, ever: no `Co-Authored-By` for the agent, no "Generated with" trailers, nothing crediting the AI in messages, PR bodies, or changelogs. Authorship belongs to the project's committer identity.

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
- Commit identity checked with `git config user.name`, `git config user.email`, `git var GIT_AUTHOR_IDENT`, and `git var GIT_COMMITTER_IDENT`; no `root`, `root@...`, `.localdomain`, or machine fallback identity.
- `git diff --check` passes (no whitespace errors, no conflict markers).
- Direct consumers updated: tests, docs, content references affected by the change.
