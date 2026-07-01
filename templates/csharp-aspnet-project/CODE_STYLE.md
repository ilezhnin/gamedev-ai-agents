# Code Style And Source Rules (C# Backend)

This document is the source-level contract for project-authored C#. It defines formatting, naming, file organization, comments, and async rules. Architecture, module ownership, and boundaries belong to `ARCHITECTURE.md` or the module map in `AGENTS.md`.

## Scope

- Applies to project-authored C# under the solution's own source folders.
- Generated code (migrations, OpenAPI clients, source generators) and external packages are exempt unless modified into project-owned code.
- New and touched code must follow this guide. Do not churn stable legacy files for style alone.
- Project consistency beats generic C# style advice.

## File Headers

If the project uses file headers, match the existing format exactly and derive values from the project: company/author from existing headers or `git config user.name`, date format from existing headers. The AI agent must never appear as author, co-author, or contributor in any header. If the project has no header convention, do not introduce one without asking.

## Namespace And File Layout

- Use the project root namespace (derive from csproj `RootNamespace` or existing files). File-scoped namespaces are fine when the project already uses them.
- Namespace structure mirrors project and responsibility folders.
- File name matches the primary type. One primary entity per file; split sibling DTOs, requests, results, and enums into their own files unless private nested details.
- Sort usings: `System.*`, framework, third-party, project. Match the project's usings placement (file-scoped `global using` conventions included).

## Naming

- `PascalCase`: types, interfaces, properties, methods, namespaces, public fields, events.
- `_camelCase`: private fields. `camelCase`: locals and parameters.
- New constants: `UPPER_SNAKE_CASE` unless the codebase consistently uses `PascalCase` constants - then match it.
- Booleans start with `Is`, `Can`, `Has`, `Should`, or `Try`. Methods are verbs; types and properties are nouns; collections are plural.
- No vague names (`temp`, `data`, `Manager`, `Helper`, `Service` as a suffix-of-last-resort) when a responsibility-based name exists.
- Use `Id` casing in new APIs; keep `ID` only where an existing schema or external contract requires it.
- Async methods end with `Async`. DTOs describe their contract role: `CreateOrderRequest`, `OrderCreatedResponse`.

## Access And API Surface

- Explicit access modifiers; prefer `private`. `public` is a deliberate contract decision.
- Endpoints, DTOs, and OpenAPI metadata are public contracts - changing them is a compatibility event, not a refactor.
- Do not expose EF entities, SDK models, or mutable internal collections through API responses; map to owned DTOs at the boundary.

## Formatting And Expressions

- 4 spaces, Allman braces (or match the repo's `.editorconfig` if it says otherwise), braces on every control block.
- Keep short declarations on one line; wrap into compact balanced groups; extract request/settings types instead of tall signatures.
- No magic numbers/strings - named constants, options, or configuration. `var` when the type is obvious.
- Guard clauses over deep nesting; extract complex conditions into named booleans.
- One empty line between members; trailing commas in multi-line initializers; no trailing whitespace.

## LINQ, Collections, Async

- LINQ for clarity; avoid it in hot request paths where allocations are measured to matter. Avoid unnecessary materialization.
- Parameters take the narrowest collection interface; returns prefer read-only views or owned snapshots.
- Async end to end: `Task`/`ValueTask`, `Async` suffix, `CancellationToken` last and propagated from the request.
- No `async void` outside event-handler signatures. No `.Wait()`/`.Result` in request or worker paths. Fire-and-forget assigns with `_ =` and routes exceptions to logging.
- External SDK/async translation lives in adapters or boundary services; convert external errors into typed project results.

## Comments

- Comments explain ownership, invariants, or non-obvious tradeoffs - never restate code or narrate change history.
- XML docs for supported APIs and contracts the team consumes.
- Keep comments current during refactors.

## Class Organization

- Order members: constants/statics, fields, constructors, public members, private helpers; callers above helpers so files read top-down.
- Keep files under roughly 600 non-blank lines and endpoints/handlers focused; split by responsibility.
- Minimal APIs: group endpoints by domain in route-group files matching nearby conventions.

## Review Checklist

- [ ] Names communicate responsibility; access modifiers explicit; public surface intentional; no AI attribution anywhere.
- [ ] Contracts (routes, DTOs, status codes) unchanged unless the task requires it.
- [ ] Async methods use `Async` suffix, propagate cancellation, no sync-over-async.
- [ ] Boundaries map external/SDK/EF types into owned models.
- [ ] Comments explain why; documentation matches the actual code.
