---
name: backend-implement
description: Implement or refactor C# backend code safely. Use when modifying ASP.NET Core, Minimal API, MVC/Web API, background services, EF Core, Dapper, authentication, authorization, validation, configuration, dependency injection, migrations, API contracts, .csproj files, or backend tests.
---

# C# Backend Implement

## Overview

Make narrow ASP.NET and C# backend changes that preserve API contracts, security boundaries, data integrity, dependency discipline, and existing validation paths.

## Workflow

1. Orient first if the solution shape, service boundary, data flow, or validation path is unclear.
2. Read the nearest `.sln`, `.csproj`, `Program.cs`, `Startup.cs`, `appsettings*.json`, `Directory.Build.props`, `Directory.Packages.props`, tests, and existing endpoint/service patterns before editing.
3. Identify the system boundary: HTTP endpoint, worker, message handler, repository, database, external API, or configuration.
4. Keep edits local and behavior-focused. Prefer existing DI, options, logging, validation, error, mapper, and persistence patterns.
5. Ask before adding packages, changing public API contracts, changing auth behavior, introducing migrations, or touching production-like configuration.
6. Treat input, headers, claims, tokens, files, webhooks, queue messages, and model output as untrusted.
7. Add or update focused tests when the project has nearby unit, integration, WebApplicationFactory, Testcontainers, or repository-test patterns.
8. Run the cheapest meaningful validation. If validation cannot run, state the exact gap.

## Backend Rules

- Do not hardcode secrets, connection strings, tokens, passwords, private keys, or production URLs.
- Preserve authentication and authorization checks. Do not replace policy/role/ownership checks with client-side assumptions.
- Validate input at external boundaries. Prefer existing validators, model binding, filters, endpoint filters, or domain factories.
- Use parameterized queries and existing EF Core/Dapper conventions. Do not build SQL with untrusted string interpolation.
- Keep async all the way through request and IO paths. Avoid sync-over-async and blocking calls in request handlers.
- Respect cancellation tokens where the project already passes them through.
- Keep domain logic separate from framework glue when the codebase already follows that split.
- Update API documentation, OpenAPI metadata, typed clients, or contract tests when changing observable API behavior.
- For EF migrations, inspect the generated operations before accepting them. Call out destructive schema/data changes explicitly.
- Avoid broad logging changes. Never log secrets, tokens, passwords, full auth headers, or sensitive personal data.

## Rationalizations To Reject

- "Too simple to test" - one-line handler changes still break contracts and auth.
- "It builds, that is enough" - run the changed endpoint or its test; builds do not prove behavior.
- "The migration looks obviously safe" - inspect the generated operations; drop-and-add renames look safe too.
- "The framework surely works like I remember" - verify version-specific ASP.NET/EF APIs against the project's package versions before relying on them.
- "More than ~100 lines written without any check" is a red flag - stop and validate before continuing.

## Reference

Read `references/backend-patterns.md` before changing authentication, authorization, validation, persistence, migrations, external integrations, configuration, or performance-sensitive request paths.
