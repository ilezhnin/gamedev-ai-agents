---
name: unity-validate
description: Choose and run focused validation for Unity projects safely. Use when verifying Unity or C# changes, compiling scripts, running targeted EditMode or PlayMode tests, checking logs, validating asmdef changes, confirming package changes, or reporting what remains untested when Unity cannot run.
---

# Unity Validate Project

## Overview

Select the cheapest validation that proves the changed behavior while protecting the project from wrong-editor upgrades, broad test runs, and unnoticed import churn. Default role: `unity-test-runner`.

## Workflow

1. For delivery-grade evidence, require the isolated candidate worktree/tree SHA from `$crossworking`; never validate the shared dirty checkout. A direct shared-checkout run is diagnostic only and cannot satisfy delivery.
2. Read candidate `ProjectSettings/ProjectVersion.txt` and record the exact required editor version, source HEAD, candidate tree SHA, frozen expanded task-path JSON, and task-content fingerprint. Before validation, recompute the fingerprint from those paths and candidate-tree blobs; a mismatch blocks the run.
3. Capture a pre-run recursive content manifest of candidate `Assets/`, `Packages/`, and `ProjectSettings/`, including untracked and ignored files.
4. Discover project-provided validation, test assemblies, nearby fixtures, CI scripts, and Unity MCP availability.
5. For docs or agent-config-only changes, use static validation and do not open Unity.
6. Before launching the project, interrogate the configured editor (`-version`) and verify binary revision metadata against both version lines in `ProjectVersion.txt`. A version-looking path alone is not proof; on platforms without equivalent binary metadata, require an explicit trusted executable-to-revision mapping.
7. Choose the smallest meaningful compile/test target. Use a fixture, namespace, test, category, or MCP group filter; do not run a whole test platform while calling it targeted.
8. Store command lines, logs, and results in a new immutable persistent ignored directory outside the disposable candidate, keyed by candidate tree and attempt. Never reuse or overwrite an earlier attempt directory.
9. Inspect exit code, result XML, logs, and Unity console evidence.
10. In a `finally` postflight on success or failure, compare status and the protected-path content manifest. Treat unexpected asset, package, setting, scene, prefab, metadata, untracked, or ignored-file changes as a blocker; never discard them automatically.
11. Run `.agents/scripts/check-unity-meta.ps1` after Unity or asset-related validation.
12. Report exact commands/results, required editor version, candidate tree SHA, task-content fingerprint, source HEAD, unexpected mutations, and unverified gaps.

## Validation Ladder

Use the first level that proves the task:

1. Static schema, syntax, mirror, or source inspection for docs/config-only changes.
2. Supported non-Unity checks only when the repository defines them.
3. Exact-version Unity batchmode compile for script compatibility.
4. Filtered EditMode tests for pure logic, editor tooling, serialization utilities, and asset processors.
5. Filtered PlayMode tests for lifecycle, physics, input, UI, scenes, and gameplay.
6. Focused Unity MCP/editor verification for scene or prefab behavior without adequate automated coverage.
7. Broader suites only when the task scope or release gate explicitly requires them.

## Guardrails

- Do not claim Unity compilation passed unless Unity compiled the project or the console was checked after recompilation.
- Do not treat generated IDE projects or `dotnet build` as Unity compilation.
- Do not launch a different editor version and let it migrate the project.
- Never use `-quit` with `-runTests`.
- Do not add `-accept-apiupdate` unless an API update is explicitly approved.
- Do not run full PlayMode/EditMode suites by default.
- Do not revert or clean unexpected Unity mutations; preserve them and report the blocker.
- Reuse prior evidence only while its editor version, candidate tree SHA, and task-content fingerprint all match.

## Reference

Read `references/validation-commands.md` for guarded PowerShell templates and evidence handling.
