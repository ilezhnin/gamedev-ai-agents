# Architecture Contract (C# Backend)

This document is the project-wide architecture contract. It governs module ownership, data flow, lifecycle, boundaries, and integration rules. `CODE_STYLE.md` governs source-level style; `AGENTS.md` holds the module map and working rules. Read this before starting module work, reviewing a refactor, adding a public contract, or introducing a new system boundary.

This file installs as the kit's default contract. On install, review each section against the actual codebase: delete or adjust rules that do not describe this project (an existing project rarely matches all of them on day one). Until that review happens, treat divergence between code and this document as a discussion item for the user, not as a defect to fix toward the contract.

## Architecture Standard

The service is organized around domain modules, narrow ports, adapters, explicit composition, and typed outcomes - not around framework artifacts. ASP.NET is the delivery mechanism at the boundary, not the owner of domain policy.

Every feature fits this shape:

```text
HTTP request / message / scheduled trigger
  -> endpoint / handler (binding, auth, validation at the boundary)
  -> application service or command handler with typed outcomes
  -> domain model (invariants, policy)
  -> persistence and external-service adapters
  -> response mapping to owned DTOs
```

Callers must not know how persistence, external SDKs, caches, or background processing are implemented.

## Non-Negotiables

- Domain logic is plain C# and independent of ASP.NET, EF, and SDK types where the project follows that split.
- One authority per mutable state: an aggregate, a table, a cache, a configuration value each have one owner and one mutation path.
- Failure is explicit: typed results or exceptions per the local pattern; no silent fallbacks, no swallowed exceptions, no nulls/empty IDs as failure markers.
- Public contracts (routes, DTO shapes, status codes, pagination, error shape, OpenAPI metadata) are versioned property of the project; changing them is a compatibility event.
- Auth is enforced server-side at every protected boundary: authentication, authorization, tenant, ownership, role, scope.
- One file - one entity, no exceptions; nested types are forbidden (see `CODE_STYLE.md`).
- Optimize only after ownership and correctness are clear.

## Module Shape

Group code by domain responsibility, not by technical artifact type, following the existing solution layout. A domain module owns:

- its endpoints/handlers (thin: binding, auth, validation, mapping);
- its application services or command/query handlers with typed outcomes;
- its domain model (entities, value objects, invariants);
- its persistence surface (repositories/DbContext configuration it owns);
- its adapters to external services;
- its tests.

Rules:

- Each module keeps one public API surface (its endpoints plus any internal ports other modules may consume) and one composition entry (DI registration).
- Never create parallel `Manager`/`Helper`/`Service` types when an existing owner covers the responsibility; never create folders as parking lots for unclear ownership.
- Cross-module access goes through the owning module's public service or port, never into its persistence or internals.

## Composition And DI

- `Program.cs`/composition root wires modules; domain policy stays inside the owning module.
- Lifetimes are deliberate: no captive dependencies (singleton capturing scoped), no service-locator reaches into the container from domain code.
- Options binding is validated at startup (`ValidateDataAnnotations`/`ValidateOnStart` or the local pattern); missing required config fails startup loudly, not first request.

## API Contracts

- Endpoints expose owned DTOs; EF entities and SDK models never leave the boundary.
- Contract changes are additive by default; breaking changes require a versioned route or a documented migration path for clients.
- Validation happens at the boundary (model binding, filters, validators); domain invariants live in the domain, not in controllers.
- Error responses use the project's error shape; internals (SQL, stack traces, secrets) never reach responses.

## Persistence And Migrations

- One owner per table/aggregate; other modules read through the owner's API or documented read models, not through joins into foreign tables.
- EF migrations are data-risk changes: generated operations are inspected; destructive or locking operations are called out with a rollback plan; expand-migrate-contract ordering for zero-downtime deploys.
- Queries are bounded (pagination on list endpoints); N+1 access patterns are findings; transactions cover multi-step invariants; concurrency handling matches the existing convention (row versions, ETags).
- Serialized/persisted contracts that outlive a deploy (queues, caches, exports) are versioned and migration-aware.

## External Integrations

- Every external service (payments, identity, storage, game platform, LLM) lives behind a project-owned adapter; SDK types and errors convert into typed project results at that boundary.
- Network calls define timeout, retry (idempotent-only), and failure behavior; degraded/offline behavior is documented for user-facing features.
- Webhooks, queue messages, and callbacks are untrusted input: validated, idempotent, and routed through the owning module.

## Concurrency, Async, Reliability

- Async end to end on request and worker paths; `CancellationToken` propagated; no sync-over-async.
- Background work has explicit ownership, cancellation, and state-transfer semantics; committed state changes happen through the owning module, not in ad-hoc continuations.
- Handlers that can be retried (messages, webhooks, jobs) are idempotent.
- No caller waits forever: cancellation, timeout, or explicit fault state.

## Caches And Snapshots

- Cache keys are collision-safe; entries carry explicit invalidation (TTL, version, event) - "restart clears it" is not an invalidation strategy.
- Data returned across module boundaries is owned DTOs or immutable snapshots, never live mutable internals.

## Configuration And Secrets

- Configuration has one owner per value; drift between appsettings, environment variables, and CI is a finding.
- Secrets never live in source, logs, or test snapshots; local development uses user secrets or environment variables.

## Testing Requirements

- Behavior tests for application services and domain invariants, including failure modes.
- Integration tests (WebApplicationFactory/Testcontainers per project convention) for endpoints, auth, persistence, and serialization when those surfaces change.
- Contract checks when API shape changes; migration checks when persistence changes.
- Boundary checks (tests or source scans) for forbidden dependencies: domain referencing ASP.NET/EF/SDK types where the split forbids it.

## Governance

- Significant cross-module decisions are captured as short architecture notes in `docs/tickets/` or module `Documentation/`.
- Architecture audits and refactor backlogs are produced by `$arch-audit` and live in `docs/tickets/`.
- A refactor states its non-goals; cleanup passes are neutral or negative in production code by default.
- If implementation diverges from this document, fix one of them before the work is considered complete.
