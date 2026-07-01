---
name: unity-validate
description: Choose and run focused validation for Unity projects. Use when verifying Unity or C# changes, compiling scripts, running EditMode or PlayMode tests, checking logs, validating asmdef changes, confirming package changes, or reporting what remains untested when Unity cannot run.
---

# Unity Validate Project

## Overview

Select the cheapest validation that proves the changed behavior without running unrelated long workflows.

## Workflow

1. Discover available validation from project docs, `Packages/manifest.json`, asmdefs, test folders, CI config, and existing scripts.
2. Prefer project-provided commands over invented commands.
3. If `UNITY_EDITOR` is set, use it for batchmode compile or tests.
4. If Unity MCP testing tools are available, prefer them for targeted EditMode/PlayMode runs.
5. Capture logs and inspect errors or warnings relevant to the change.
6. State exactly what ran, what passed or failed, and what could not be checked.

## Validation Ladder

Use the first level that meaningfully covers the change:

1. Static inspection for docs/config-only changes.
2. `dotnet test` or `dotnet build` only when the repo has a supported non-Unity test/build path.
3. Unity batchmode compile when script compatibility is the main risk.
4. Targeted EditMode tests for pure logic, editor tooling, serialization utilities, and asset processors.
5. Targeted PlayMode tests for scene, lifecycle, physics, input, UI, and gameplay flows.
6. Manual Unity MCP/editor verification for scene or prefab changes where automated tests do not exist.

## Guardrails

- Do not claim a Unity compile passed unless Unity actually compiled the project or the Unity console was checked after recompilation.
- Do not treat IDE `.sln` generation as a reliable Unity compile.
- Avoid full PlayMode suites unless the task requires them or the project is small.
- Keep generated result files under an ignored or agreed path such as `TestResults/` or `Logs/`.
- If validation is blocked by missing Unity path, license, packages, or project state, report the blocker and the next exact command.

## Reference

Read `references/validation-commands.md` for command templates and log handling.
