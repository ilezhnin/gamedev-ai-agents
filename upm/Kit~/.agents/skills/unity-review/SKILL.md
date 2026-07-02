---
name: unity-review
description: Review Unity and C# changes for correctness. Use when asked to review a Unity diff, PR, branch, or local changes touching .cs files, asmdefs, scenes, prefabs, ScriptableObjects, packages, ProjectSettings, tests, gameplay behavior, editor tooling, serialization, performance, or Unity lifecycle code.
---

# Unity Review Changes

## Overview

Review like a Unity code owner. Lead with concrete bugs and regression risks, then mention test gaps and residual risk.

## Review Workflow

1. Determine the diff scope before reading broadly.
2. Inspect nearby code and assets only when needed to prove or disprove a risk.
3. Prioritize P0/P1 correctness, data-loss, build-breaking, serialization, lifecycle, and performance issues.
4. Include file and line references for every actionable finding.
5. Classify findings by severity: P0 blocks immediately, P1 must fix before merge, P2 should fix now, P3 is optional or follow-up.
6. Do not list stylistic preferences unless they hide a real defect.
7. If no issues are found, say so and name any validation that was not run.

## Quality Gates

- Confirm the change is one coherent unit. Flag PRs that mix feature work, refactors, formatting, generated churn, and unrelated asset edits.
- Review tests before implementation when tests exist. Verify they cover behavior and regression risk, not only implementation details.
- Check validation history: compile, EditMode/PlayMode tests, manual scene/prefab verification, or explicit blockers.
- Prefer existing project patterns and Unity/C# APIs over new abstractions or dependencies.
- Treat new packages, ProjectSettings changes, asmdef dependency changes, and generated files as higher-risk review items.
- Identify newly dead or unreachable code, but do not ask for deletion unless the evidence is clear.
- Do not accept "fix later" for build breaks, data loss, broken serialization, failing tests, or misleading validation claims.

## Unity Risk Areas

- Serialized field renames without `FormerlySerializedAs`.
- Changed prefab, scene, or asset GUID references.
- Runtime assemblies depending on editor-only code.
- New asmdef dependencies that break platforms or create cycles.
- Event subscriptions that leak after `OnDisable`, scene unload, or domain reload.
- Coroutine, async, timer, tween, and cancellation lifetime bugs.
- Allocations or expensive lookup calls in `Update`, `FixedUpdate`, input, and UI refresh loops.
- Physics code that mixes `Update` and `FixedUpdate` incorrectly.
- Input System vs legacy input mismatches.
- Save data, economy, inventory, migration, or versioning regressions.
- Missing EditMode/PlayMode coverage for changed behavior.
- PR size or scope that prevents reliable review.
- New dependencies where standard library, Unity APIs, or existing project utilities would be enough.
- Dead code, stale compatibility layers, unused serialized fields, or obsolete tests left after refactors.

## Output Shape

Use this order:

1. Findings ordered by severity.
2. Open questions or assumptions.
3. Brief test/validation notes.

## Reference

Read `references/review-checklist.md` for a deeper pass on gameplay, editor tooling, UI, serialization, and validation risks.
