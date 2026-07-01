---
name: unity-implement-csharp
description: Implement or refactor Unity C# code safely. Use when modifying .cs files in Unity projects, including MonoBehaviours, ScriptableObjects, editor scripts, asmdef-scoped code, gameplay systems, UI controllers, tests, serialization-sensitive fields, coroutines, async flows, or performance-sensitive Update loops.
---

# Unity Implement C#

## Overview

Make narrow Unity C# changes that respect Unity serialization, assembly boundaries, lifecycle rules, and project validation constraints.

## Workflow

1. Orient first if the relevant assembly, scene, prefab, or validation path is unclear.
2. Inspect nearby code, asmdefs, tests, and serialized usages before editing public or `[SerializeField]` members.
3. Keep edits small and local. Follow existing architecture instead of adding a new pattern.
4. Preserve `.meta` files and GUIDs. Do not move or rename assets unless the task requires it.
5. Avoid adding packages, assets, or project settings changes without a clear need.
6. Add or update focused tests when the project already has a nearby EditMode, PlayMode, or pure C# test pattern.
7. Run the cheapest meaningful validation. If Unity cannot be run, state exactly what was checked and what remains unverified.

## Unity C# Rules

- Prefer `[SerializeField] private` over new public fields unless existing API requires public access.
- When renaming serialized fields that may already exist in scenes, prefabs, or assets, use `UnityEngine.Serialization.FormerlySerializedAs`.
- Keep `Editor` code out of runtime assemblies and runtime code out of `Editor` folders.
- Respect asmdef dependencies. Do not create circular assembly references.
- Avoid allocations in `Update`, `FixedUpdate`, hot input loops, and frequently called UI refresh paths.
- Do not call UnityEngine APIs from background threads unless the project already uses a safe dispatcher pattern.
- Match existing async style: coroutine, UniTask, Task, event bus, or custom scheduler.
- Handle disabled domain reload and object lifetime when subscribing to events or static state.
- Prefer project-specific service locators, DI containers, save systems, and logging wrappers over new globals.

## Reference

Read `references/unity-csharp-patterns.md` before changing serialization, lifecycle, async, editor/runtime boundaries, or performance-sensitive code.
