---
name: backend-orient
description: Map an ASP.NET / C# solution before coding. Use when starting work in an unfamiliar backend repository, planning an endpoint, service, or data change, locating relevant files, or when a task mentions .sln, csproj, Program.cs, dependency injection, middleware, controllers, minimal APIs, EF Core, migrations, appsettings, hosted services, docker, or CI discovery.
---

# C# Backend Orient

## Overview

Build the smallest useful map of an ASP.NET / C# solution before editing. Prefer targeted discovery over broad file reading, and return actionable paths, ownership boundaries, risks, and the cheapest validation path.

## Workflow

1. Confirm the pinned toolchain and solution shape: `global.json` (SDK version), `.sln`/`.slnx`, `Directory.Build.props`, `Directory.Packages.props`.
2. Map the `.csproj` graph: target frameworks, project references, and which projects are apps, libraries, or tests.
3. Read `Program.cs` (and `Startup.cs` if present) as the composition root: DI registrations, middleware pipeline order, and hosting model.
4. Enumerate the endpoint surface: controllers, minimal API `Map*` calls, route groups, versioning, and OpenAPI setup.
5. Identify auth: registered schemes (JWT, cookie, API key), authorization policies, and where `[Authorize]`/`RequireAuthorization` is applied.
6. Map persistence: `DbContext` classes, `Migrations/` folders and the latest migration vs model snapshot, Dapper or raw SQL usage, connection string names.
7. Map configuration layers: `appsettings*.json` overlays, `UserSecretsId`, environment variable overrides, and options binding classes.
8. Find background work: `BackgroundService`/`IHostedService` implementations, queues, and schedulers.
9. Find test projects, their framework, and their style: unit, WebApplicationFactory integration, Testcontainers.
10. Note CI scripts and `Dockerfile`/`docker-compose*` files to understand how the project validates and ships.
11. Report candidate files, ownership boundaries, risks, and the cheapest meaningful validation path.

## Reading Boundaries

Skip `bin/`, `obj/`, `TestResults/`, `artifacts/`, `.vs/`, `.idea/`, `node_modules/`, and generated code (`*.g.cs`, `*.Designer.cs` bodies) unless the task explicitly needs them.

Prefer these first:

- `global.json`, `*.sln`, `*.slnx`, `Directory.Build.props`, `Directory.Packages.props`
- `src/**/Program.cs`, `src/**/Startup.cs`
- `src/**/*.csproj`, `tests/**/*.csproj`
- `src/**/appsettings*.json`
- CI config (`.github/workflows/`, `azure-pipelines*.yml`, `.gitlab-ci.yml`) and `Dockerfile*`

## Stop Conditions

Stop and ask before:

- Reading secret stores, live connection strings, or production configuration beyond names and shapes.
- Running the app, scripts, or migrations against any database or service not confirmed local.
- Expanding discovery into edits; hand off to backend-implement or backend-debug once the map is sufficient.

## Final Report

Report:

- SDK and target frameworks.
- Composition root findings: DI registrations and middleware order that matter for the task.
- Endpoint, auth, and data surface relevant to the task.
- Candidate files and ownership boundaries.
- Risks: contract, auth, migration, config, or shared-code hazards.
- Cheapest validation path and recommended next command (often backend-validate).

## Reference

Read `references/discovery-checklist.md` when the solution is large, unfamiliar, or has many projects.
