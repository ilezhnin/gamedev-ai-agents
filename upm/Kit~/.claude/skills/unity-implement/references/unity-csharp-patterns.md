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

## Boundary Enforcement

Assembly definitions are the kit's default boundary-enforcement mechanism, but some projects deliberately stay asmdef-less and enforce boundaries with source-scan guard tests. Detect the project policy before proposing changes.

- In asmdef-based projects, keep one runtime asmdef plus `Editor` and test asmdefs per module. Keep references minimal and explicit: no cycles, no platform leakage, no editor references from runtime assemblies.
- In asmdef-less projects, absence of per-module asmdefs is not a defect when the policy is documented and guarded. Strengthen editor-only source scans before proposing asmdefs.
- Source-scan guard tests usually live under the owning module's `Tests/Editor` and scan the on-disk tree for forbidden folder tokens, illegal layer references, cross-module reach-ins, and folder/namespace mismatches.
- Namespace and folder structure mirror the boundary mechanism, so ownership is readable from the path.
- Editor scripts belong in `Editor` folders or editor-only asmdefs; use define constraints (`UNITY_EDITOR`, `UNITY_INCLUDE_TESTS`, platform defines) instead of scattering `#if` through shared files.
- Tests reference the smallest assembly or source scope needed; use `InternalsVisibleTo` only for the module's own test assembly.
- A dependency between modules that the boundary mechanism cannot express cleanly is an architecture smell - add an adapter or a narrower port instead of a reference chain.

## UI And Scene Wiring

- Build UI and object hierarchies once in scenes/prefabs during implementation; code then wires serialized refs, subscriptions, data, state, commands, and validation.
- Runtime `Instantiate` is for existing prefabs, row prefabs, and poolable views - not for assembling layouts from raw `GameObject`, `RectTransform`, `Button`, or `TextMeshProUGUI` in code.
- If code-generated hierarchy is genuinely needed, name the reason next to the code: unbounded dynamic content, tooling generation, tests, or migration.
- Never use scene-wide searches (`FindObjectOfType` and friends) as fallback for missing required references; wire through serialized fields or the owner's composition path, and fail loudly when a required reference is missing.

## Determinism

For gameplay-critical logic (anything that affects outcomes, saves, replays, or multiplayer):

- Drive simulation by ticks, not render frame rate. No `Time.deltaTime`-derived gameplay outcomes.
- No `DateTime.Now`, wall-clock time, static random state, or unordered dictionary iteration in simulation decisions.
- Randomness comes from an explicit seeded source owned by the simulation or command context.
- If async work or jobs contribute to gameplay state, order committed outputs by stable IDs before applying them.
- Presentation, audio, VFX, and diagnostics must not feed back into simulation unless explicitly modeled.

## Fail Loud

- Broken required references, invalid content, missing catalog entries, and impossible states reject explicitly: validation error, typed failure result, exception, or visible error log per the local pattern.
- No silent fallbacks, runtime repair, default-asset substitution, or empty IDs as failure markers.
- Reject invalid authored data in editor validation, not deep in runtime.
- A fallback is acceptable only as deliberate, documented, testable product behavior.

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
