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
