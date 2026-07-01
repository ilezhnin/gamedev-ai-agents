# C# ASP.NET Project Instructions

## Project Shape

This repository is a C# backend or ASP.NET project. Assume the root may contain `.sln`, `.slnx`, `.csproj`, `src/`, `tests/`, `Directory.Build.props`, `Directory.Packages.props`, `global.json`, `NuGet.config`, Docker files, and CI configuration.

## Discovery

- Read `global.json` before assuming the .NET SDK version.
- Read solution files, project files, `Directory.Build.props`, `Directory.Packages.props`, and `NuGet.config` before changing build, packages, analyzers, or target frameworks.
- Read `Program.cs`, `Startup.cs`, endpoint maps, middleware, DI registrations, config binding, and nearby tests before changing request behavior.
- Use `rg --files` before broad file reads.
- Inspect CI workflows and README validation commands before inventing build or test commands.

## Engineering Discipline

These rules bias agents toward careful, reviewable C# backend and ASP.NET work. Explicit user instructions and repository-specific instructions override these rules when they are more specific. Existing project conventions override personal style preferences unless the user asks for a redesign.

### 1. Think Before Coding

Do not assume. Do not hide confusion. Surface tradeoffs. Surface assumptions and risk before editing.

Before implementing:

- State important assumptions explicitly. If uncertain, ask.
- If multiple interpretations would lead to different code, present them instead of silently choosing one.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear enough to change scope, architecture, data, API behavior, validation, security, deployment, or persistence, stop. Name what is confusing. Ask.
- If the request can be solved without code, say so.
- If a change is risky, destructive, broad, security-sensitive, data-sensitive, or hard to verify, get confirmation first.

Ask clarifying questions before implementation, not after creating the wrong solution.

### 2. Simplicity First

Minimum code that solves the problem. Nothing speculative. Use the minimum code and content that solves the requested behavior.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that was not requested.
- No error handling for impossible scenarios just to hide broken invariants.
- No new frameworks, services, packages, middleware, background workers, infrastructure, deployment machinery, or architecture layers unless clearly justified.
- Prefer boring, explicit, maintainable code over clever code.
- If you write 200 lines and it could be 50, rewrite it.
- Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

Touch only what the task requires. Clean up only your own mess.

When editing existing code or configuration:

- Do not improve adjacent code, comments, formatting, project files, appsettings files, Docker files, or CI files unless needed for the task.
- Do not refactor systems that are not part of the requested change.
- Match existing style, naming, architecture, async, logging, DI, validation, persistence, error handling, and test patterns.
- Preserve public APIs, routes, DTOs, schemas, auth behavior, status codes, database contracts, and behavior unless the task requires changing them.
- If unrelated dead code or broken configuration is noticed, mention it instead of deleting it.

When your changes create orphans:

- Remove imports, variables, methods, files, tests, package references, service registrations, options bindings, config keys, or database mappings that your change made unused.
- Do not remove pre-existing dead code unless asked.
- Update direct call sites, tests, API metadata, clients, migrations, and documentation affected by your change.
- The test: every changed line should trace directly to the user's request.

A good patch looks intentional, small, and reviewable.

### 4. Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals and keep working until the goal is met or the blocker is explicit.

Examples:

- "Add validation" means write tests or checks for invalid inputs, invalid data, or invalid states, then make them pass.
- "Fix the bug" means reproduce the failure when possible, fix the root cause, and verify the failing path.
- "Refactor this" means preserve behavior and ensure relevant checks pass before and after where practical.
- "Improve performance" means measure baseline, change the bottleneck, and measure or verify the result.

For multi-step tasks, state a brief plan:

1. [Step] -> verify: [check]
2. [Step] -> verify: [check]
3. [Step] -> verify: [check]

Strong success criteria let agents loop independently. Weak goals like "make it work" require clarification or a concrete assumption.

### 5. Read First, Edit Second

Understand the existing system before changing it.

Before modifying code, configuration, migrations, or tests:

- Find the real entry points, call sites, data flow, ownership boundaries, and tests.
- Read neighboring code to understand naming, structure, lifecycle, and conventions.
- Search for existing helpers, extension points, validators, middleware, filters, options classes, repositories, services, and test utilities before creating new ones.
- Confirm whether a bug is in code, configuration, data, tests, migration data, external services, environment, or assumptions.
- Do not infer architecture from filenames alone.

Prefer existing extension points over new patterns.

### 6. Test-Driven Changes

Use tests and focused verification to define and protect behavior.

For bugs:

- Reproduce the issue first when possible.
- Add or identify a failing unit test, integration test, WebApplicationFactory test, contract test, or manual reproduction that captures the bug.
- Make the smallest change that turns the failing path green.

For features:

- Test externally visible behavior, not implementation details.
- Cover meaningful edge cases, not every theoretical branch.
- Keep tests deterministic, focused, and readable.

If test infrastructure is missing or unusable:

- Say so explicitly.
- Perform the best available focused manual verification.
- State exactly what was and was not verified.

Never claim tests, builds, migrations, contract checks, or API smoke checks passed unless they actually ran or were verified by the environment.

### 7. Debugging Discipline

Diagnose before patching.

- Start with the observable failure: error text, logs, stack trace, failing test, bad response, broken migration, or incorrect state.
- Form one hypothesis at a time.
- Check the boundary where correct data becomes wrong.
- Prefer tracing inputs, outputs, state transitions, ownership, auth context, transactions, persistence, and integration boundaries over guessing.
- Do not stack multiple speculative fixes.
- Do not silence errors, swallow exceptions, add broad null fallbacks, or return generic success just to make symptoms disappear.

A fix should explain why the bug happened and why the change prevents it.

### 8. Contract And API Safety

Protect callers, data, integrations, and existing behavior.

- Do not change public signatures unless necessary.
- Do not rename exported types, routes, DTOs, status codes, auth policies, database columns, message contracts, config keys, or output shapes without updating all consumers.
- Preserve authentication, authorization, ownership, tenant, role, scope, and policy checks.
- For behavior changes, update direct tests, documentation, OpenAPI metadata, clients, migration notes, or deployment notes as needed.
- Validate untrusted input at system boundaries.
- Prefer explicit errors over silent fallback behavior.

When compatibility must break, say so clearly and explain the migration path.

### 9. Architecture Restraint

Design only as much architecture as the problem needs.

- Keep high cohesion and low coupling.
- Keep domain logic separate from IO, UI, transport, persistence, and framework glue where the project already follows that split.
- Introduce interfaces only when there are multiple implementations, a stable boundary, platform variation, or a testing need.
- Avoid new global mutable state, service locators, singletons, and hidden dependencies unless the project already uses that pattern.
- Do not rewrite a working subsystem to match a preferred architecture.

Good architecture reduces future change cost. Bad architecture hides simple logic behind ceremony.

### 10. Dependency Discipline

New dependencies are a cost.

Before adding a package, service, SDK, source generator, analyzer, database provider, background worker, or infrastructure dependency:

- Check whether the project already has a suitable library or helper.
- Confirm the dependency solves enough of the problem to justify its weight.
- Consider licensing, security, maintenance, runtime support, container size, cold start, CI impact, deployment impact, and operational ownership.
- Avoid adding a dependency for trivial utilities.

If a dependency is necessary, use the smallest stable integration surface and get approval when the dependency changes project risk.

### 11. Error Handling

Handle realistic failures. Do not invent impossible ones.

- Handle IO, network, permissions, parsing, user input, timeouts, external APIs, queues, databases, and persistence failures at boundaries.
- Do not swallow exceptions without logging or returning actionable context.
- Do not convert all errors into generic "failed" messages.
- Do not leak stack traces, SQL, auth headers, secrets, or sensitive data in production responses.
- Do not add defensive null checks everywhere to hide broken invariants.
- Use assertions or clear invariant checks for states that should be impossible.

Error handling should make failures diagnosable, not invisible.

### 12. Performance

Measure before optimizing unless the issue is obvious.

- Prefer clear code until there is evidence of a bottleneck.
- Avoid obviously bad complexity in hot paths.
- Avoid unbounded API queries, N+1 data access, blocking IO, sync-over-async, repeated service-provider builds, repeated config parsing, and unnecessary allocations in request paths.
- Preserve pagination, filtering, cancellation tokens, and async IO patterns.
- Do not trade readability for micro-optimizations without a measured or well-localized reason.
- When optimizing, record baseline, change, and result when practical.

Performance work is successful only when the target behavior improves without breaking correctness.

### 13. Security And Data Safety

Treat sensitive data and destructive actions carefully.

- Never log, commit, or hardcode secrets, tokens, credentials, private keys, production connection strings, or personal data.
- Treat external input as untrusted: API requests, headers, cookies, tokens, uploaded files, webhooks, queue messages, database data from untrusted sources, integration responses, and model output.
- Preserve authorization, authentication, tenant, ownership, permissions, and audit behavior.
- Be careful with migrations, deletes, overwrites, bulk updates, data backfills, schema changes, and irreversible operations.
- Ask before destructive or broad changes unless explicitly instructed.

Security fixes should reduce risk without creating hidden behavior changes.

### 14. Documentation And Comments

Document intent, not noise.

- Do not add comments that merely repeat the code.
- Add comments for non-obvious decisions, constraints, invariants, transaction boundaries, security assumptions, migration reasoning, or operational tradeoffs.
- Update documentation when public behavior, setup steps, commands, configuration, API contracts, deployment behavior, or validation steps change.
- Do not rewrite unrelated documentation for style.

Good comments explain why. Code should usually explain what.

### 15. Communication

Be clear, direct, and honest.

Before coding:

- State assumptions, risks, and a short plan for non-trivial work.
- Ask when requirements are ambiguous in a way that changes implementation.

After coding:

- Summarize what changed.
- List tests or checks run.
- Mention unverified areas and remaining risks.
- Mention unrelated issues noticed, but do not fix them unless asked.

Do not present guesses as facts. Do not claim completion if verification failed.

### 16. Definition Of Done

A task is done when:

- The requested behavior is implemented.
- The solution is the smallest reasonable change.
- Relevant tests pass or manual verification is clearly reported.
- The diff contains no unrelated rewrites, formatting churn, generated noise, config churn, migration churn, or metadata churn.
- New code matches existing style.
- New code does not leave unused imports, variables, files, dependencies, service registrations, config keys, or dead call sites created by the change.
- Public contracts, documentation, deployment notes, and direct consumers are updated when necessary.
- Known risks or follow-up work are stated honestly.

### 17. Stop Conditions

Stop and ask before continuing when:

- Requirements conflict.
- Multiple interpretations would lead to meaningfully different implementations.
- Required files, APIs, credentials, package state, SDK version, service dependencies, database state, or context are missing.
- The requested change is destructive, irreversible, or security-sensitive.
- The fix requires a broad architecture change not explicitly requested.
- The change would add dependencies, alter public contracts, run migrations, change auth behavior, change production data, or modify project-wide settings without approval.
- You cannot verify the result and the risk of being wrong is meaningful.

Stopping early is better than confidently implementing the wrong thing.

### 18. Working Indicators

These rules are working when:

- Diffs are smaller and easier to review.
- Fewer rewrites happen because assumptions were clarified up front.
- Reviews focus on product behavior, correctness, data, tests, and contracts instead of cleanup caused by the agent.
- Bugs are reproduced before they are fixed.
- Validation is tied directly to the requested outcome.
- Agents report uncertainty and verification gaps instead of hiding them.

## Backend Safety

- Do not commit secrets, connection strings, tokens, private keys, real appsettings values, or local user-secrets state.
- Preserve public API contracts unless the task explicitly requires a contract change.
- Keep authentication, authorization, tenant, ownership, role, scope, and policy checks server-side.
- Validate untrusted input at system boundaries.
- Use parameterized SQL and existing EF Core/Dapper patterns.
- Treat migrations as data-risk changes. Inspect generated operations and call out destructive schema changes.
- Do not add packages, services, infrastructure, or broad architecture layers without explicit approval.
- Keep changes narrow and behavior-focused.

## Validation

- Prefer targeted validation over broad suites.
- Use project-provided scripts, CI commands, or documented `dotnet` commands.
- If services such as databases, containers, brokers, or credentials are required, report the blocker and the exact validation gap.
- Do not claim tests, builds, migrations, or API smoke checks passed unless they actually ran.

## Useful Skills

- `$csharp-backend-implement` for ASP.NET and backend C# implementation.
- `$csharp-backend-review` for backend diff, PR, or branch review.
- `$csharp-backend-validate` for build, test, migration, and API validation.
- `$planning` for writing `.agents/plans/active_plan.md` and `.agents/plans/task_list.md`.
- `$crossworking` for coordinating planned work through implementation, review, validation, and create-mr handoff.
- `$create-mr` for verifying, committing, pushing, and opening a Pull Request / Merge Request.
- `$teamwork-preview` for invoking a coordinated agent team on larger C# backend tasks.
- `$grill-me` for hard questioning and backend plan stress-testing before implementation.
- `$learn` for capturing reusable rules or skill updates after a success, correction, or repeated workflow.
