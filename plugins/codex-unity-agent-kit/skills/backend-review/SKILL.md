---
name: backend-review
description: Review C# backend and ASP.NET changes for correctness, security, data integrity, and validation coverage. Use when reviewing diffs, PRs, branches, or local changes touching ASP.NET Core endpoints, services, EF Core/Dapper persistence, auth, config, migrations, background workers, integrations, tests, or API contracts.
---

# C# Backend Review

## Overview

Review backend changes like a service owner. Default role: `backend-reviewer`. Lead with concrete bugs, security risks, data-loss risks, contract regressions, and missing validation.

If the request is not a diff, PR, branch, or local-change review and asks for a read-only whole-project issue audit or separate report, use `$codebase-audit` instead.

## Review Workflow

1. Determine the diff scope with `git diff`, changed files, or the provided PR context before reading broadly.
2. Map the changed boundary: endpoint, auth policy, service, repository, migration, background worker, integration, configuration, or test.
3. Inspect nearby code only as needed to prove or disprove a risk.
4. Prioritize P0/P1 correctness, authorization, data corruption, migration, reliability, and deployment-breaking issues.
5. Include file and line references for every actionable finding.
6. Do not list style preferences unless they hide a real defect or maintainability risk.
7. If no issues are found, say so and name the validation that was or was not run.

## Quality Gates

- Confirm the change is one coherent unit. Flag PRs that mix feature work, refactors, formatting, generated churn, and unrelated config edits.
- Review tests before implementation when tests exist. Verify they cover behavior and regression risk, not only implementation details.
- Check validation history: build, targeted tests, migration checks, manual endpoint verification, or explicit blockers.
- Prefer existing project patterns and framework APIs over new abstractions or dependencies.
- Treat new packages, auth changes, migration files, contract changes, and generated files as higher-risk review items.
- Identify newly dead or unreachable code, but do not ask for deletion unless the evidence is clear.
- Do not accept "fix later" for build breaks, data loss, broken contracts, failing tests, or misleading validation claims.

## Backend Risk Areas

- Missing authentication, authorization, ownership, tenant, or policy checks.
- Endpoint behavior that breaks existing clients, status codes, DTO shape, OpenAPI contracts, or pagination semantics.
- Unvalidated user input, headers, file uploads, webhook payloads, queue messages, or external API data.
- SQL injection, over-posting, mass assignment, weak model validation, or unsafe serialization.
- EF migrations that drop/rename columns, lose data, lock large tables, or diverge from model changes.
- Incorrect transaction boundaries, missing concurrency handling, retry misuse, or non-idempotent handlers.
- Sync-over-async, request-thread blocking, unbounded queries, missing pagination, or N+1 data access.
- Secrets or personal data written to logs, config, tests, snapshots, or error responses.
- Configuration drift between appsettings, environment variables, deployment files, and CI.
- Tests that mock away the changed behavior or miss the externally visible contract.

## Output Shape

Use this order:

1. Findings ordered by severity.
2. Open questions or assumptions.
3. Brief test and validation notes.

## Reference

Read `references/backend-review-checklist.md` for a deeper pass on API contracts, security, persistence, migrations, reliability, configuration, and test coverage.
