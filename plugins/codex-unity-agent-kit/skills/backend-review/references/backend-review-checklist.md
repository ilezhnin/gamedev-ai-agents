# C# Backend Review Checklist

## Functional Correctness

- Changed code satisfies the requested behavior and does not broaden scope.
- Public APIs preserve route, method, DTO, status-code, pagination, and error contracts unless intentionally changed.
- Nullability, default values, enum handling, culture/timezone behavior, and serialization options are compatible with callers.
- Background jobs, message handlers, and webhook handlers remain idempotent where retries can happen.

## Security

- Authentication and authorization remain enforced at every protected boundary.
- Ownership, tenant, role, scope, policy, and admin checks happen server-side.
- Input is validated at external boundaries.
- SQL and command execution paths are parameterized and do not accept untrusted raw strings.
- Secrets, tokens, credentials, auth headers, private keys, and sensitive personal data are not logged or committed.
- CORS, cookies, JWT, and error responses do not weaken production security.

## Data And Migrations

- Persistence changes preserve existing data or clearly call out migration risk.
- EF migrations match model changes and avoid accidental drop-and-add renames.
- Transactions cover multi-step invariants.
- Queries are bounded and avoid obvious N+1 patterns.
- Concurrency handling is preserved for update/delete paths.

## Reliability

- Async request paths avoid blocking calls.
- Cancellation tokens, timeouts, and retry policies match existing conventions.
- External integrations handle failure without hiding errors.
- Logging gives actionable context without leaking sensitive data.
- Configuration changes are reflected in deployment files, examples, tests, and CI where relevant.

## Tests

- Unit tests cover domain/services/validators affected by the change.
- Integration tests cover endpoints, auth, persistence, serialization, and middleware when those surfaces change.
- Migration or data-access changes have a project-appropriate check.
- Tests assert externally visible behavior instead of only implementation details.

## Five-Minute Threat Model (STRIDE)

Run this when the change touches auth, input, uploads, storage, or anything client-reported:

- Trust boundaries crossed: HTTP requests, forms, uploads, webhooks, queue messages, client-reported game state.
- Assets at risk: credentials, PII, save data, economy balances, admin actions.
- Spoofing -> is authentication enforced on this path? Tampering -> parameterized queries, integrity of client-reported values? Repudiation -> audit log for sensitive actions? Information disclosure -> generic errors, no internal details? Denial of service -> rate limits, input size caps, unbounded queries? Elevation of privilege -> server-side authorization, ownership, tenant checks?
- Game-specific: never trust client-reported currency, inventory, progress, or timing; recompute or validate server-side.

## Dependency Vulnerability Triage

For NuGet advisories (`dotnet list package --vulnerable`) triage by: severity x reachability (is the vulnerable code path actually used?) x fix availability (patch bump vs major upgrade). Patch reachable-critical now; schedule the rest with reasons.

## Overengineering And Principles

- New abstraction with a single implementation and no boundary/testing need - flag it; delete before abstracting.
- Parallel service/helper created where an existing owner (service, repository, validator) already covers the responsibility.
- New public surface with one internal caller; DTOs/overloads without real call sites.
- Missed reuse: an existing middleware, filter, validator, or mapper already does this.
- SRP breaches that hurt: handlers accumulating unrelated responsibilities; layers bypassed (endpoint reaching into persistence internals instead of the owning service).
- The diff grows production code during what was framed as cleanup - ask for the justification.

## Finding Classification

- Severity: P0 blocks immediately, P1 must fix before merge, P2 should fix now, P3 optional/follow-up.
- Confidence: state HIGH/MEDIUM/LOW per finding. Phrase LOW-confidence findings as questions, not assertions.
- Project consistency beats generic best practices unless correctness, data safety, or security is at stake.
- Deliver one consolidated review, not a stream of fragments.
- Change size: ~100 changed lines review reliably; ~300 only when logically unified; ~1000+ or mixed concerns - request a split before deep review.
