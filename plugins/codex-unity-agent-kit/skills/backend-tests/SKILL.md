---
name: backend-tests
description: Bootstrap .NET test infrastructure and author meaningful unit and integration tests for C# backend and ASP.NET code, including legacy code with none. Use when asked to add backend tests, set up a test project, cover an untested service or endpoint, write a WebApplicationFactory or Testcontainers test, write a regression test for a bug fix, or pin behavior before a refactor.
---

# C# Backend Author Tests

## Goal

Add tests that pin real behavior and survive refactoring. Match existing test infrastructure when it exists; bootstrap it correctly when it does not.

## Workflow

1. **Detect existing infrastructure first**
   - Look for `*Tests*.csproj` projects, the test framework in use (xUnit, NUnit, MSTest), fixture and naming conventions, and CI test steps.
   - If tests exist, match their layout, naming, framework, and assertion style exactly. Do not introduce a second convention.
   - If the solution layout is unclear, run $backend-orient first.

2. **Bootstrap when absent**
   - Create a test project per `references/test-setup.md`: xUnit by default (the ASP.NET ecosystem norm), named `<Project>.Tests`, referencing the project under test, added to the solution.
   - New packages (test framework, `Microsoft.AspNetCore.Mvc.Testing`, Testcontainers) are dependency changes: surface them explicitly and get approval before touching csproj or `Directory.Packages.props`, then record them in `DEPENDENCIES.md`.

3. **Choose the level**
   - Unit: domain logic, validators, mappers, calculators. No host, no IO, no database.
   - Integration: endpoint behavior, routing, auth policies, model binding, serialization, EF Core queries - via `WebApplicationFactory<TEntryPoint>` against the real DI container.
   - Real dependency: database-engine behavior (SQL semantics, migrations, concurrency, transactions) - via Testcontainers. The EF InMemory provider is not a database; do not use it to prove relational behavior.

4. **Make untestable code testable (humble controller)**
   - Extract decision logic out of controllers, minimal API handlers, and hosted services into plain services the handler delegates to; unit-test the service.
   - Introduce seams only at slow or nondeterministic boundaries (clock via `TimeProvider`, network, external SDKs). Do not interface-wrap everything.

5. **Pin legacy behavior before refactoring (characterization)**
   - Write tests asserting what the code currently does, including oddities, before changing it. Refactor only once the pins are green.
   - If observed behavior looks like a bug, do not silently enshrine it: ask what correct behavior is, or pin it and flag it in the report.

6. **Prove bug fixes**
   - Write the regression test first, run it, and confirm it fails for the reported reason. Apply the fix. Confirm the test passes.
   - A regression test that never failed proves nothing.

7. **Run and report honestly**
   - Run new tests via $backend-validate paths: `dotnet test` with a `--filter` scoped to what you added, then the affected suite.
   - If tests cannot run (missing SDK, no Docker for Testcontainers), state that tests were authored but not executed. Never claim tests ran or passed unless they did.

## Test Quality Rules

- Prefer real implementation > fake > stub > mock. Substitute only slow or nondeterministic boundaries (network, disk, clock, external services); mocking everything makes tests assert their own wiring instead of behavior.
- Assert state and outcomes (response status, body, persisted rows), not call sequences. Tests coupled to internal call order break on every refactor and catch nothing.
- DAMP over DRY: a test should read like a specification top to bottom. Duplicated setup beats a helper maze; extract fixtures only for boilerplate irrelevant to the behavior.
- One behavior concept per test. Name tests after behavior (`Register_WhenEmailTaken_Returns409`), not after the method under test.
- Deterministic: no wall-clock waits (inject `TimeProvider`), no live network, no shared mutable state between tests, no `Random` without a fixed seed.
- Do not test framework plumbing: model binding itself, EF change tracking itself, or logic-free mappers and forwarding calls need no test.

## Stop Conditions

Stop and ask before:

- Adding any package to a csproj or `Directory.Packages.props`.
- Restructuring projects or the solution to make code reachable from tests.
- An extraction that would change a public API surface or serialized contract.
- Pinning behavior that is unknown or disputed. Ask what correct behavior is instead of enshrining a bug silently, or pin it and explicitly flag it.

## Final Report

Report:

- Infrastructure: matched existing, or created (projects, packages surfaced for approval, `DEPENDENCIES.md` updated).
- Tests added: unit/integration/real-dependency split, behaviors covered, characterization pins flagged as suspect where applicable.
- Bug fixes: regression test failed before the fix and passed after, with the actual runs.
- Execution: exactly which tests ran and how, or that tests were authored but not executed.
- Gaps: behavior that remains untested and why.

## Reference

Read `references/test-setup.md` for the test csproj template, WebApplicationFactory and Testcontainers examples, EF Core test-double guidance, and run commands.
