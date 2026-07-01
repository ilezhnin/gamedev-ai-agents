# C# Backend Implementation Patterns

## Discovery

- Read `global.json` before assuming the .NET SDK version.
- Read `Directory.Build.props`, `Directory.Packages.props`, `NuGet.config`, and relevant `.csproj` files before changing packages, analyzers, nullable settings, or target frameworks.
- Read `Program.cs`, `Startup.cs`, endpoint maps, filters, middleware, DI registrations, and nearby tests before changing request behavior.
- Search for existing helpers before adding validators, result wrappers, mappers, options classes, repositories, or logging wrappers.

## API Boundaries

- Preserve route templates, HTTP methods, status codes, DTO names, required fields, pagination, sorting, filtering, and error shape unless the task requires a contract change.
- For Minimal APIs, keep endpoint filters, metadata, typed results, and OpenAPI conventions consistent with nearby endpoints.
- For controllers, keep attributes, model binding, filters, response types, and versioning patterns consistent.
- Validate requests at the boundary and keep domain invariants inside the domain layer where the project has that split.

## Security

- Do not bypass `[Authorize]`, endpoint `RequireAuthorization`, policies, roles, scopes, tenant checks, or ownership checks.
- Validate JWT issuer, audience, signature, and expiration through existing framework configuration.
- Keep CORS restrictive. Do not use wildcard origins with credentials.
- Use secure cookie settings when touching cookie auth: `HttpOnly`, `Secure`, and appropriate `SameSite`.
- Never include internal exception details, SQL, stack traces, secrets, or full auth headers in production responses.
- Treat LLM output, webhook payloads, uploaded files, and integration responses as untrusted input.

## Data Access

- Use parameterized SQL and existing EF Core/Dapper helpers.
- Avoid unbounded queries. Preserve or add pagination for list endpoints.
- Avoid N+1 patterns. Use includes, projections, joins, or explicit loading according to existing project style.
- Use transactions when a workflow must commit multiple changes atomically.
- Handle optimistic concurrency if the surrounding code already uses row versions, ETags, timestamps, or concurrency tokens.

## Migrations

- Inspect generated EF migrations before accepting them.
- Call out operations that drop columns, rename columns, rebuild large tables, rewrite data, or require downtime.
- Prefer explicit rename operations over drop-and-add when preserving data.
- Keep seed data and model snapshots consistent.

## Configuration

- Keep secrets out of source. Use user secrets, environment variables, key vaults, or the project standard.
- Add placeholder keys to examples only when needed; never copy real local values.
- Keep options binding and validation consistent with existing `IOptions<T>`, `IOptionsMonitor<T>`, or custom configuration patterns.

## Reliability And Performance

- Pass `CancellationToken` through async IO when nearby code does.
- Avoid sync-over-async (`.Result`, `.Wait()`) in request and worker paths.
- Bound retries and timeouts. Do not retry non-idempotent operations unless the project already has a safe policy.
- Avoid per-request heavy allocations, reflection, service-provider builds, and repeated configuration parsing.
