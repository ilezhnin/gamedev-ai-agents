# Unity C# Implementation Patterns

## Serialization

- Prefer `[SerializeField] private` for inspector fields.
- Use `FormerlySerializedAs` when renaming serialized fields that may exist in scenes, prefabs, or assets.
- Avoid changing serialized type shapes unless migration is planned.
- Be careful with auto-properties: Unity does not serialize most properties.
- Preserve `.meta` files and GUIDs when moving assets.

## Lifecycle

- Subscribe in `OnEnable` and unsubscribe in `OnDisable` unless the project has a different owner-lifetime rule.
- Use `OnDestroy` for resources that outlive enable/disable cycles.
- Assume domain reload may be disabled; reset static state deliberately when needed.
- Avoid accessing scene objects from constructors or field initializers.

## Performance

- Avoid per-frame allocations in `Update`, `FixedUpdate`, `LateUpdate`, input polling, UI refresh, and physics callbacks.
- Cache component lookups when code runs often.
- Prefer non-alloc physics APIs in hot paths when existing project code does so.
- Avoid LINQ in hot paths unless existing code accepts it.

## Assembly Boundaries

- Runtime assemblies must not reference `UnityEditor`.
- Editor scripts belong in `Editor` folders or editor-only asmdefs.
- Tests should reference the smallest assembly needed.
- Do not add asmdef references that create cycles or platform leakage.

## Async and Coroutines

- Match the project pattern: coroutine, UniTask, Task, custom scheduler, or event-driven.
- Tie async work to object lifetime with cancellation where available.
- Do not call Unity APIs from background threads.
- Stop coroutines or cancel tasks when the owner disables or destroys if continued execution would mutate dead objects.

## Save Data Migration

- Every persisted schema carries a version field; bump it on any shape change.
- Migrations are forward-only and chained: v1->v2->v3, never version-skipping special cases.
- Missing or corrupt fields get explicit defaults or clamps; decide recover-vs-reject deliberately and log the decision path.
- Never ship a save-shape change without a round-trip test against a fixture save from the released version.
- Renaming a serialized save field is a schema change, not a refactor - map the old name in the migration.
