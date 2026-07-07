# C# ASP.NET Project Instructions

## Project Shape

This repository is a C# backend or ASP.NET project. Assume the root may contain `.sln`, `.slnx`, `.csproj`, `src/`, `tests/`, `Directory.Build.props`, `Directory.Packages.props`, `global.json`, `NuGet.config`, Docker files, and CI configuration.

## Tech Stack

Declare the project's real stack so agents stop guessing. Replace the placeholders and delete rows that do not apply:

- .NET: <SDK version from global.json; ASP.NET flavor: Minimal APIs / MVC / Web API>
- Persistence: <EF Core / Dapper / other; database engine>
- Auth: <JWT / cookies / Identity / external provider; policy conventions>
- Validation: <FluentValidation / DataAnnotations / endpoint filters / domain factories>
- Messaging / background work: <none / hosted services / queues>
- Testing: <xUnit / NUnit; WebApplicationFactory / Testcontainers>

Maintenance rule: when code uses a technology not listed here, ask the user whether to add it to this list.

## Module Map And Feature Routing

Declare owners so features land in the right place. Replace the examples with the project's real layout:

- <HTTP endpoints for domain X> -> <src/Api/Endpoints/X>
- <Domain logic, invariants> -> <src/Domain/...>
- <Persistence, repositories, migrations> -> <src/Data/...>
- <Background jobs, queues> -> <src/Workers/...>
- <External integrations (payments, auth provider)> -> <src/Integrations/<Provider>>

Rules:

- Before adding a feature, find the existing owner. Do not create a parallel service or helper when an existing layer owns the responsibility.
- Cross-layer access goes through the owning service's public API, not into persistence or SDK internals.
- External SDK types stay behind project-owned adapters; they must not leak into domain or API contracts.
- Maintenance rule: when a module appears, disappears, or changes owner, update this map.

## Discovery

- Read `global.json` before assuming the .NET SDK version.
- Read solution files, project files, `Directory.Build.props`, `Directory.Packages.props`, and `NuGet.config` before changing build, packages, analyzers, or target frameworks; `.agents/DEPENDENCIES.md` explains why each package exists.
- Read `.agents/CODE_STYLE.md` before writing or reviewing C#; read `.agents/ARCHITECTURE.md` before module work, refactors, or adding public contracts.
- Read `Program.cs`, `Startup.cs`, endpoint maps, middleware, DI registrations, config binding, and nearby tests before changing request behavior.
- Read `.agents/learnings.md` when it exists - it holds project-specific lessons.
- Inspect CI workflows and README validation commands before inventing build or test commands.

## Documentation Layout

- Project-wide contracts: `AGENTS.md` at the root; `ARCHITECTURE.md`, `CODE_STYLE.md`, and `DEPENDENCIES.md` in `.agents/`.
- Module/service documentation lives next to the code in `<Module>/Documentation/*.md`, written as living docs: current state, not history.
- `docs/qa/` - manual and regression checklists. `docs/tickets/` - implementation plans, architecture audits (from `$arch-audit`), and historical notes; a ticket is never a current contract.
- When behavior changes, update the owning doc in place; move superseded plans to `docs/tickets/`.

## Core Discipline

The kit's global profile (`~/.codex/AGENTS.md`, installed from the kit's `global/AGENTS.md`) carries the full engineering discipline. These are the load-bearing rules that apply even without it:

- State assumptions and risks before editing; when interpretations diverge meaningfully, ask instead of silently choosing.
- Minimum code that solves the task. No speculative abstractions, configurability, or new patterns beside existing ones.
- Surgical changes: touch only what the task requires, remove orphans your change created, match existing style and architecture.
- Read first, edit second: find real entry points, call sites, consumers, and tests before changing them.
- Reproduce bugs before fixing; fix root causes, never hide symptoms behind broad catches or silent fallbacks.
- Preserve contracts: routes, DTO shapes, status codes, pagination, OpenAPI metadata, save/database schemas.
- Preserve authentication, authorization, tenant, ownership, role, scope, and policy checks - always server-side.
- New dependencies need explicit approval. EF migrations are data-risk changes: inspect generated operations.
- Keep request paths async end to end; no sync-over-async, no unbounded queries, no N+1 in hot paths.
- Never log or commit secrets, connection strings, tokens, or personal data; treat all external input as untrusted.
- Report honestly: what changed, what was verified, what remains unverified. Never claim unrun validation.
- Communicate like an engineering log: concrete actions, files, commands, results, and blockers - no filler or playful narration; lead summaries with the outcome.
- English only in every artifact: code, comments, docs, commit messages, branch names, learnings. Converse with the user in the user's language, but write into the repository only in English.
- Stop and ask when requirements conflict, a change is destructive or irreversible, or you cannot verify a risky result.

## Validation

- Prefer targeted validation over full-suite runs: `dotnet build` for compile risk, focused `dotnet test` for behavior.
- `$backend-validate` picks the cheapest sufficient level, including migration and contract checks.
- Do not claim builds, tests, migrations, or smoke checks passed unless they actually ran.

## Boundaries

- Always: run focused validation after edits; parameterize SQL; validate input at external boundaries; keep `.agents/plans/` artifacts current during coordinated work; report unverified gaps.
- Ask first: adding packages; changing public API contracts; auth behavior changes; EF migrations; touching production-like configuration; broad refactors.
- Never: commit secrets or real connection strings; run migrations against shared/production databases; weaken auth checks; force-push shared branches; silence errors to make symptoms disappear; credit the AI agent as author or co-author anywhere - headers, commits, docs, changelogs.

## Skill Routing

Route by situation before acting. No task is "too small for a skill" - routing keeps behavior predictable. If you are about to "just quickly implement it", check this table first.

| Situation | Skill |
| --- | --- |
| Unfamiliar solution or service area, need the right files | `$backend-orient` |
| Unclear requirements, risky design, plan needs stress-testing | `$grill-me` |
| Module became spaghetti, needs an architecture audit and refactor backlog | `$arch-audit` |
| Read-only whole-project issue audit, no project changes, separate report | `$codebase-audit` |
| Task needs a written plan or agent handoff | `$planning` |
| Implement or refactor backend C# | `$backend-implement` |
| Bootstrap or author tests (unit, WebApplicationFactory, Testcontainers) | `$backend-tests` |
| Errors, failing tests, broken endpoints or deploys | `$backend-debug` |
| Review a diff, PR, or branch | `$backend-review` |
| Choose and run the right checks | `$backend-validate` |
| Coordinate a planned task across agents to a PR | `$crossworking` |
| Commit, push, and open the PR/MR | `$create-mr` |
| Capture a reusable lesson | `$learn` |
