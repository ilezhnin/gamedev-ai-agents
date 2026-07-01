# Code Style And Source Rules (Unity C#)

This document is the source-level contract for project-authored C#. It defines formatting, naming, file organization, comments, Unity reference wiring, and async rules. Architecture, module ownership, and boundaries belong to `ARCHITECTURE.md` or the module map in `AGENTS.md`.

## Scope

- Applies to project-authored C# under the project's own source folders.
- Generated code, third-party packages, external SDKs, and imported samples are exempt unless modified into project-owned code.
- New and touched code must follow this guide. Do not churn stable legacy files for style alone.
- When a module documents stricter local rules, the stricter rule wins.
- Project consistency beats generic C# style advice.

## File Headers

Every project-authored C# file starts with the project's standard header. Derive the concrete values from the project itself - never invent them:

- Company/copyright and author: take from existing headers in the project, or `git config user.name` when the project has no headers yet.
- Date format: match existing headers; update the Modified date on meaningful changes; the copyright year matches the Created year.
- The AI agent must never appear as author, co-author, or contributor in any header.

```csharp
// Copyright (c) <year> <company>. All rights reserved.
//------------------------------------------------------------------------------
// Module      : <FileName>.cs
// Created     : <date>
// Modified    : <date>
// Author      : <project author>
// Description : <one or two factual lines: ownership and purpose, not history>
//------------------------------------------------------------------------------
```

If the project has no header convention, propose this one to the user before adopting it.

## Namespace And File Layout

- Use the project root namespace (derive from asmdefs, existing files, or the csproj `RootNamespace`).
- Namespace structure mirrors module and responsibility folders.
- Place the namespace declaration before the `#region Usings` block; put `using` directives inside the namespace and inside `#region Usings`.
- Sort usings: `System.*`, Unity, third-party, project, aliases. No comments labeling groups.
- One file - one entity. This rule is hard and has no exceptions: every class, struct, interface, enum, record, and delegate lives in its own file named after it. Nested types are forbidden - extract them into their own files, including private ones (generated code is exempt per Scope).
- No new `partial` types in runtime code (generated code and approved editor integration are exceptions).

## Naming

- `PascalCase`: types, interfaces, properties, methods, namespaces, public/protected fields, events.
- `_camelCase`: private fields, including `[SerializeField] private`.
- `camelCase`: locals and parameters.
- `UPPER_SNAKE_CASE`: new constants and simulation/content/data-contract enum members. `static readonly` is not a constant - name by visibility.
- Booleans start with `Is`, `Can`, `Has`, `Should`, or `Try`. No vague `CheckX`.
- Methods are verbs; types and properties are nouns. Collections are plural.
- No tautology (`character.Move()`, not `character.CharacterMove()`); no vague names (`temp`, `data`, `obj`, `Manager`, `Helper`, `Utility`) when a responsibility-based name exists.
- Use `Id` casing in new APIs; keep `ID` only where an existing schema requires it.
- New C# events are `PascalCase` and describe what happened: `StateChanged`, `SaveCompleted`.

## Access And API Surface

- Explicit access modifiers everywhere (interface members excepted). Prefer `private`.
- `public` is a deliberate API decision, not a default. C# `public` is not automatically supported API - supported surface lives in `Api` folders, role ports, or documented composition boundaries.
- No new `internal` in regular code (tests, generated code, approved editor boundaries excepted).
- Public APIs must not expose mutable internal collections, concrete runtime services, reusable buffers, or external SDK models.

## Formatting

- 4 spaces, Allman braces, braces on every control block, no single-line condition/action pairs.
- Keep declarations and short calls on one line when they fit; when wrapping, group arguments into compact balanced lines, keep the first argument on the `(` line, and never orphan `=` from its right-hand side.
- Many related scalar parameters -> extract a request/settings/context type instead of a tall signature.
- One empty line between members; max two consecutive empty lines; blank line before a final `return` after meaningful logic; trailing commas in multi-line initializers and enums; no trailing whitespace.

## Expressions

- C# keywords over .NET names (`int`, not `Int32`). `var` when the type is obvious; explicit types when ownership, allocation, or Unity object type matters.
- No magic numbers/strings - extract named constants or configuration. Bare `0`, `1`, `true`, empty string are fine when obvious.
- Expression bodies only for trivial read-only properties and forwarding; block syntax when there is logic or lifecycle meaning.
- Extract complex conditions into named booleans or helpers; guard clauses over deep nesting; cheap checks before expensive ones.

## LINQ, Collections, Async

- LINQ for clarity; loops for hot paths, allocation-sensitive code, and deterministic simulation.
- Materialize (`ToList`/`ToArray`) only when ownership or repeated enumeration requires it.
- Parameters take the narrowest collection interface; returns prefer read-only views or immutable snapshots.
- Async uses `Task`/`ValueTask` unless the project's Tech Stack declares another abstraction (UniTask, Awaitable). Async methods end with `Async`; `CancellationToken` is the last parameter and is propagated.
- No `async void` outside Unity lifecycle/event signatures, and those must catch and report. Fire-and-forget assigns with `_ =` and routes exceptions to diagnostics. Never block with `.Wait()`/`.Result` on the main thread.

## Comments

- English only - in comments, identifiers, string resources for developers, and documentation. No other language appears in source.
- Comments explain ownership, invariants, lifecycle, or non-obvious tradeoffs - never restate code or narrate change history.
- XML docs for supported APIs, module boundaries, and serialized contracts.
- Inline comments start uppercase and end with a period when written as sentences. Keep comments current during refactors.

## Class Organization

Structure non-trivial classes with `#region` blocks in this order, omitting empty ones: `Events`, `Fields`, `Properties`, `Constructors`, `Unity Methods`, `Public Methods`, `Protected Methods`, `Private Methods`, `Event Handlers`. There is no `Nested Types` region because nested types are forbidden (one file - one entity).

- Blank line before and after each `#region`/`#endregion`; no nested regions.
- Inside `Fields`: constants, statics, serialized, readonly, mutable - in that order where practical.
- Callers above helpers so files read top-down. Keep files under roughly 600 non-blank lines; split by responsibility, not line count.

## Unity Rules

- `[SerializeField] private` for inspector wiring; required references are wired intentionally and fail loudly when missing.
- Never use `FindObjectOfType`/`FindAnyObjectByType`/scene-wide searches as fallback for missing references. Local discovery (`GetComponent*` on the owned hierarchy) is fine.
- Build UI and object hierarchies in scenes/prefabs; code wires serialized refs, subscriptions, data, and state. Runtime `Instantiate` is for existing prefabs, not for assembling layouts from raw `GameObject`/`RectTransform` in code. Code-generated hierarchies need a named reason (unbounded dynamic content, tooling, tests, migration).
- MonoBehaviours stay thin: bind lifecycle, hold serialized refs, forward into plain C# services.
- Keep gameplay-critical logic deterministic: no render-frame, wall-clock, static-random, or unordered-iteration dependencies (see the determinism rules in the kit's Unity patterns reference).

## Review Checklist

- [ ] Header, namespace, usings, and regions match this guide; no AI attribution anywhere.
- [ ] One file - one entity: no nested types, no sibling types sharing a file.
- [ ] Names communicate responsibility; access modifiers explicit; public surface intentional.
- [ ] Serialized references wired intentionally; no global-search fallbacks.
- [ ] Async methods use `Async` suffix, propagate cancellation, avoid unsafe `async void`.
- [ ] Public APIs expose typed outcomes or read-only snapshots.
- [ ] Comments explain why; documentation matches the actual code.
