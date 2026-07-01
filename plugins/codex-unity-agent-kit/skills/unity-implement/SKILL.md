---
name: unity-implement
description: Implement or refactor Unity C# code safely. Use when modifying .cs files in Unity projects, including MonoBehaviours, ScriptableObjects, editor scripts, asmdef-scoped code, gameplay systems, UI controllers, tests, serialization-sensitive fields, coroutines, async flows, or performance-sensitive Update loops.
---

# Unity Implement C#

## Overview

Make narrow Unity C# changes that respect Unity serialization, assembly boundaries, lifecycle rules, and project validation constraints.

## Workflow

1. Orient first if the relevant assembly, scene, prefab, or validation path is unclear.
2. Read the project's `CODE_STYLE.md` and `ARCHITECTURE.md` when present; they override generic habits, and structural changes must follow the architecture contract.
3. Inspect nearby code, asmdefs, tests, and serialized usages before editing public or `[SerializeField]` members.
4. Keep edits small and local. Follow existing architecture instead of adding a new pattern.
5. Preserve `.meta` files and GUIDs. Do not move or rename assets unless the task requires it.
6. Avoid adding packages, assets, or project settings changes without a clear need. Update `DEPENDENCIES.md` (when the project keeps one) in the same change as any package change.
7. Add or update focused tests when the project already has a nearby EditMode, PlayMode, or pure C# test pattern.
8. Run the cheapest meaningful validation. If Unity cannot be run, state exactly what was checked and what remains unverified.

## Unity C# Rules

- One file - one entity, no exceptions: every class, struct, interface, enum, record, and delegate gets its own file named after it. Nested types are forbidden, including private ones - extract them.
- Prefer `[SerializeField] private` over new public fields unless existing API requires public access.
- When renaming serialized fields that may already exist in scenes, prefabs, or assets, use `UnityEngine.Serialization.FormerlySerializedAs`.
- Keep `Editor` code out of runtime assemblies and runtime code out of `Editor` folders.
- Respect asmdef dependencies. Do not create circular assembly references.
- Avoid allocations in `Update`, `FixedUpdate`, hot input loops, and frequently called UI refresh paths.
- Do not call UnityEngine APIs from background threads unless the project already uses a safe dispatcher pattern.
- Match existing async style: coroutine, UniTask, Task, event bus, or custom scheduler.
- Handle disabled domain reload and object lifetime when subscribing to events or static state.
- Prefer project-specific service locators, DI containers, save systems, and logging wrappers over new globals.
- Build UI and hierarchies in scenes/prefabs; code wires refs, data, and state. Do not assemble layouts from raw GameObjects in code without a named reason.
- Grow the codebase economically: check for an existing helper, extension point, or pattern before writing new code. No abstractions for single-use code (SRP and KISS over ceremony).

## Rationalizations To Reject

- "Too simple to test" - simple code with serialized data or lifecycle coupling still breaks scenes.
- "It compiles, that is enough" - Unity compiles broken lifecycle wiring happily; run or test the changed path.
- "I will clean up this adjacent code while here" - unrequested churn hides the real diff.
- "The API surely works like I remember" - verify version-specific Unity APIs against the project's packages or current docs before relying on them.
- "More than ~100 lines written without any check" is a red flag - stop and validate before continuing.

## Reference

Read `references/unity-csharp-patterns.md` before changing serialization, lifecycle, async, editor/runtime boundaries, or performance-sensitive code.
