---
name: backend-validate
description: Choose and run focused validation for C# backend and ASP.NET projects. Use when verifying .NET builds, unit tests, integration tests, WebApplicationFactory tests, EF Core migrations, API contracts, formatting, analyzers, Docker/CI checks, or reporting what remains untested.
---

# C# Backend Validate

## Overview

Select the cheapest validation that proves the changed backend behavior without running unrelated long workflows. Default role: `backend-test-runner`.

## Workflow

1. Discover available validation from README files, CI config, `.sln`, `.csproj`, `global.json`, `Directory.Build.props`, `Directory.Packages.props`, test projects, and scripts.
2. Prefer project-provided commands over invented commands.
3. Restore only when needed or when the project workflow requires it.
4. Run targeted tests first, then broaden only if the changed surface warrants it.
5. For migrations, inspect generated migration code and run the project-specific migration check before claiming data safety.
6. Capture exact commands, results, failures, and skipped checks.

## Validation Ladder

Use the first level that meaningfully covers the change:

1. Static inspection for docs/config-only changes.
2. `dotnet build` for compile, analyzer, or project-file risk.
3. Targeted unit tests for services, validators, domain logic, and mappers.
4. Targeted integration tests for endpoints, auth, persistence, serialization, and hosted services.
5. Contract/OpenAPI/client-generation checks when API shape changes.
6. EF migration validation when persistence models or schema change.
7. Docker or CI-equivalent checks only when deployment files, runtime image, or environment wiring changes.

## Guardrails

- Do not claim tests passed unless the command actually ran.
- Do not treat `dotnet restore` as a compile or behavior check.
- Do not run production migrations or commands against production data.
- Keep generated test output under ignored paths such as `TestResults/`, `artifacts/`, or the project standard.
- If validation is blocked by missing SDKs, services, databases, containers, credentials, or config, report the blocker and the next exact command.

## Reference

Read `references/validation-commands.md` for command templates and reporting guidance.
