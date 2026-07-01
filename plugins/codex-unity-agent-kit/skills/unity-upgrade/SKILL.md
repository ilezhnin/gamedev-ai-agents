---
name: unity-upgrade
description: Upgrade the Unity editor version and packages in controlled stages with churn triage and validation gates. Use when moving a project to a new Unity release or LTS, bumping packages in manifest.json, upgrading URP or HDRP, triaging API Updater output, or deciding whether post-upgrade .meta and asset churn is safe to commit.
---

# Unity Upgrade Editor And Packages

## Goal

Move the project to the target editor or package versions in small verified stages. Never mix upgrade work with feature work, and never claim a stage succeeded until Unity compiled clean and the churn is explained.

## Workflow

1. **Preflight**
   - Require a clean working tree on a dedicated upgrade branch.
   - Snapshot `ProjectSettings/ProjectVersion.txt` and `Packages/packages-lock.json` (commands in `references/upgrade-checklist.md`).
   - Confirm the target editor is installed or installable through Unity Hub; prefer LTS targets.

2. **Stage the editor upgrade**
   - Order: latest patch of the current minor, then next minor, then one major at a time. Never jump multiple majors in one step.
   - Gate each stage on the validation ladder below before starting the next; commit per green stage.

3. **Editor upgrade pass**
   - Open the project once in the new editor and let the API Updater finish (batchmode needs `-accept-apiupdate`); do not interrupt the first import.
   - Triage remaining compile errors: obsolete APIs the Updater cannot rewrite (moved namespaces, changed signatures, removed subsystems) get fixed by hand in project code; errors in third-party or Asset Store code are a stop condition.

4. **Package upgrades**
   - One package at a time. Read the target version's changelog for breaking changes before editing `Packages/manifest.json`.
   - Let `Packages/packages-lock.json` regenerate; diff it and question transitive bumps you did not request.
   - Compile and run targeted tests before touching the next package.

5. **Render pipeline caution**
   - URP/HDRP version moves may require the pipeline's material/shader upgrade menu actions and can rewrite many materials and shader assets; run those actions deliberately and commit that churn separately.

6. **Churn triage**
   - Classify every diff using the rules below before committing anything.

7. **Validate**
   - Ladder per stage: compile clean, EditMode, PlayMode, open key scenes (unity-mcp), and a player build if the project ships soon (delegate to unity-build). Use unity-validate for command templates.

## Churn Triage

Safe to commit as upgrade churn:

- `serializedVersion` bumps applied uniformly across scenes, prefabs, and assets.
- Importer version bumps in `.meta` files applied project-wide.
- `packages-lock.json` changes matching the manifest edit.

Red flags, stop and investigate:

- Any `guid:` change inside a `.meta` file.
- Scene or prefab diffs that drop components, objects, or references with no known migration explaining them.
- Churn concentrated in a handful of files instead of uniform project-wide patterns.
- Reserialization mixed into the same commit as hand edits; split them.

## Stop Conditions

Stop and ask when:

- The API Updater leaves errors in third-party or Asset Store code; the right fix may be a vendor update, not local edits.
- A package major bump changes public APIs used widely across the project.
- Post-upgrade churn includes GUID changes or scene data diffs you cannot explain.
- Unity Hub or the license cannot provide the target editor version.
- A rollback is requested after assets were reserialized; restore from the branch point rather than downgrading the editor in place.

## Final Report

Report:

- Stages completed: editor and package versions, from and to, per stage.
- API fixes: files changed and why the Updater could not handle them.
- Churn committed: classification and rough counts, plus anything deferred.
- Validation: compile, tests, scenes, and build results per stage.
- Remaining risk: skipped stages, untested platforms, packages left behind.

## Reference

Read `references/upgrade-checklist.md` for snapshot commands, per-stage compile checks, churn diff patterns, and the staged-upgrade order table.
