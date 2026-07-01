---
name: unity-merge
description: Resolve git merge conflicts in Unity scenes, prefabs, and serialized assets using UnityYAMLMerge and disciplined manual YAML repair. Use when a merge or rebase conflicts on .unity, .prefab, .asset, or .meta files, when setting up smart merge for a Unity repo, or when a resolved merge left missing references or broken prefab instances.
---

# Unity Merge Scenes And Prefabs

## Goal

Resolve Unity YAML conflicts without corrupting fileID/GUID references. Prefer UnityYAMLMerge; when it fails, take one side and re-apply the smaller change by hand, never concatenate both sides. Verify in Unity before declaring the merge done.

## Workflow

1. **Confirm smart merge setup (one-time per repo)**
   - Requires Asset Serialization = Force Text; binary-serialized scenes cannot be smart-merged.
   - Locate the editor matching `ProjectSettings/ProjectVersion.txt`; on Windows the tool is `<editor>\Editor\Data\Tools\UnityYAMLMerge.exe`.
   - Add the `.gitattributes` block and the `merge.unityyamlmerge` driver config from `references/unityyamlmerge-setup.md`.
   - Fallback behavior: on chunks it cannot auto-resolve, UnityYAMLMerge consults `mergespecfile.txt` next to the exe to launch a fallback merge tool; headless, expect a nonzero exit and treat the file as a manual case rather than editing that shared file.

2. **Run smart merge on each conflicted file**
   - List conflicts: `git diff --name-only --diff-filter=U`.
   - If the driver was configured before the merge started, YAML files may already be auto-resolved. Otherwise re-run the merge per file with `git checkout -m -- <file>` (re-invokes the driver) or `git mergetool --tool=unityyamlmerge`.
   - Success = exit 0 and no conflict markers left; then `git add` the file.

3. **Manual YAML audit (smart merge failed)**
   - Decide take-theirs or take-ours: keep wholesale the side with the larger or riskier change, then re-apply the smaller change as a targeted property edit or redo it in the editor after the merge completes.
   - Apply the audit rules below to whatever is kept.

4. **.meta conflicts**
   - Never delete a conflicted `.meta` or let Unity regenerate it; a new GUID silently breaks every reference to that asset.
   - Take one side (`git checkout --ours|--theirs -- <file>.meta`), keeping the GUID that other assets already reference; carry over non-GUID importer settings by intent.
   - If the two sides carry different GUIDs for the same path, stop (see Stop Conditions).

5. **Verify in Unity**
   - Compile via batchmode (unity-validate templates) or open through unity-mcp and read the Console.
   - Scan logs for missing references: "Broken text asset", "Could not extract GUID", "missing script", orphaned .meta warnings.
   - Open and exercise the affected scene or prefab.
   - Do not claim the merge succeeded until Unity compiled or the Console was checked.

## YAML Audit Rules

- Each document header `--- !u!<classId> &<fileID>` must have a unique fileID within the file; duplicated fileIDs corrupt the asset.
- Every kept `{fileID: X, guid: Y}` must resolve: X is 0 or exists in the same file, Y exists in some `.meta`.
- Prefab instance conflicts live in `m_Modifications` override blocks: entries with different `propertyPath` targets can both be kept; same-path entries need one value chosen.
- Never delete `stripped` documents; they anchor components owned by the source prefab.
- `m_RootOrder` / `SceneRoots` ordering diffs are usually noise; take one side consistently instead of merging them line by line.
- Never resolve by keeping both sides of a conflicted block; duplicated objects and half-applied overrides load without errors but corrupt behavior.

## Stop Conditions

Stop and ask before:

- Resolving when both sides meaningfully changed the same serialized object and product intent is unclear.
- Touching conflicts that involve asset GUID changes or `.meta` pairs with different GUIDs for the same path.
- Picking a side for binary asset conflicts (.fbx, .png, terrain data); present both options to the user.
- Aborting or resetting a merge in which some files were already hand-resolved.

## Final Report

Report:

- Setup: driver already present or configured now.
- Per file: auto-merged, manually resolved (side kept plus change re-applied), or escalated.
- Verification: compile/Console/scene checks run and their results.
- Remaining risk: references or scenes not exercised.

## Reference

Read `references/unityyamlmerge-setup.md` for exact PowerShell setup commands, per-file merge commands, and the manual audit command checklist.
