---
name: unity-orient-project
description: Map a Unity project before coding. Use when starting work in an unfamiliar Unity repository, planning a feature or bug fix, locating relevant files, or when a task mentions Assets, Packages, ProjectSettings, asmdef files, scenes, prefabs, ScriptableObjects, tests, or Unity version discovery.
---

# Unity Orient Project

## Overview

Build the smallest useful map of a Unity project before editing. Prefer targeted discovery over broad file reading, and return actionable paths, risks, and validation options.

## Workflow

1. Confirm the Unity root by checking for `Assets/`, `Packages/`, and `ProjectSettings/`.
2. Read `ProjectSettings/ProjectVersion.txt`, `Packages/manifest.json`, and `Packages/packages-lock.json` when present.
3. Find assembly boundaries with `rg --files -g "*.asmdef" -g "*.asmref"` and inspect only relevant assemblies.
4. Identify runtime, editor, tests, generated code, and third-party folders before opening many files.
5. Use `rg` for domain names, class names, scene names, serialized field names, and asset GUIDs.
6. Identify the cheapest meaningful validation path: Unity Test Framework, compile-only batchmode, package tests, or project-specific scripts.
7. Report a short orientation: Unity version, packages that matter, candidate files, architectural boundaries, risks, and recommended next command.

## Reading Boundaries

Skip `Library/`, `Temp/`, `Obj/`, `Build/`, `Builds/`, `Logs/`, `.vs/`, `UserSettings/`, and generated IDE files unless the task explicitly needs them.

Prefer these first:

- `Assets/**/Scripts/**/*.cs`
- `Assets/**/Editor/**/*.cs`
- `Assets/**/Tests/**/*.cs`
- `Assets/**/*.asmdef`
- `ProjectSettings/*.asset`
- `Packages/manifest.json`

## Reference

Read `references/discovery-checklist.md` when the project is large, unfamiliar, or has multiple assemblies/packages.
