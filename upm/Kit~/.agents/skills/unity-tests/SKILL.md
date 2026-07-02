---
name: unity-tests
description: Bootstrap Unity test infrastructure and author meaningful EditMode/PlayMode tests, including for legacy code with none. Use when asked to add tests, set up Tests folders or test asmdefs, cover an untested MonoBehaviour or legacy system, write a regression test for a bug fix, or pin behavior before a refactor.
---

# Unity Author Tests

## Goal

Add tests that pin real behavior and survive refactoring. Match existing test infrastructure when it exists; bootstrap it correctly when it does not.

## Workflow

1. **Detect existing infrastructure first**
   - Look for `Tests/` folders, `*Tests*.asmdef`, `com.unity.test-framework` in `Packages/manifest.json`, and CI test steps.
   - If tests exist, match their layout, naming, asmdef pattern, and assertion style exactly. Do not introduce a second convention.
   - If the assembly layout is unclear, run unity-orient first.

2. **Bootstrap when absent**
   - Create EditMode and/or PlayMode test asmdefs per `references/test-setup.md`: reference the runtime asmdef under test plus `UnityEngine.TestRunner` and `UnityEditor.TestRunner`, set `overrideReferences: true` with precompiled `nunit.framework.dll`, and add the `UNITY_INCLUDE_TESTS` define constraint so tests strip from player builds.
   - If `com.unity.test-framework` is missing from the manifest, adding it is a package change: surface it explicitly and get approval before touching the manifest.
   - Test asmdefs cannot reference predefined assemblies (Assembly-CSharp). If the code under test has no asmdef, the kit's default recommendation is to introduce a module asmdef (asmdefs are the kit's boundary-enforcement norm) - propose it with the scope of what moves, and get approval before restructuring.

3. **Choose the mode**
   - EditMode: pure logic, damage/economy/math calculations, serialization utilities, save migration, editor tooling. Fast, no scene, no frames.
   - PlayMode: MonoBehaviour lifecycle, scene loading, physics, input, UI behavior, coroutine/async timing. Use `[UnityTest]` returning `IEnumerator` when frames must pass.

4. **Make untestable code testable (humble object)**
   - Extract pure logic from a MonoBehaviour into a plain C# class the MonoBehaviour delegates to; test the plain class in EditMode.
   - Do not rename or retype `[SerializeField]` fields during the extraction. Scenes and prefabs must deserialize unchanged.

5. **Pin legacy behavior before refactoring (characterization)**
   - Write tests asserting what the code currently does, including oddities, before changing it. Refactor only once the pins are green.
   - If observed behavior looks like a bug, do not silently enshrine it: ask what correct behavior is, or pin it and flag it in the report.

6. **Prove bug fixes**
   - Write the regression test first, run it, and confirm it fails for the reported reason. Apply the fix. Confirm the test passes.
   - A regression test that never failed proves nothing.

7. **Run and report honestly**
   - Run new tests via unity-validate paths: Unity MCP test runner, batchmode, or the project's own command.
   - If Unity cannot be run, state that tests were authored but not executed. Never claim tests ran or passed unless they did.

## Test Quality Rules

- Prefer real implementation > fake > stub > mock. Substitute only slow or nondeterministic boundaries (network, disk, clock); mocking everything makes tests assert their own wiring instead of behavior.
- Assert state and outcomes, not call sequences. Tests coupled to internal call order break on every refactor and catch nothing.
- DAMP over DRY: a test should read like a specification top to bottom. Duplicated setup beats a helper maze; extract helpers only for boilerplate irrelevant to the behavior.
- One behavior concept per test. Name tests after behavior (`Reload_WhenMagazineEmpty_RefillsFromReserve`), not after the method under test.
- Deterministic: no real time (control `Time.timeScale` or yield frames instead of wall-clock waits), no live network, no `Random` without an injected or fixed seed.
- Do not test engine behavior, trivial wiring, or Unity serialization itself. `[SerializeField]` round-tripping is Unity's contract; logic-free getters and forwarding calls need no test.

## Stop Conditions

Stop and ask before:

- Adding `com.unity.test-framework` or any other package to `Packages/manifest.json`.
- Creating or changing asmdefs in a way that moves existing code out of Assembly-CSharp or between assemblies.
- A humble-object extraction that would change the serialized data shape of any scene, prefab, or asset.
- Pinning behavior that is unknown or disputed. Ask what correct behavior is instead of enshrining a bug silently, or pin it and explicitly flag it.

## Final Report

Report:

- Infrastructure: matched existing, or created (files, asmdef names, any manifest change surfaced for approval).
- Tests added: EditMode/PlayMode split, behaviors covered, characterization pins flagged as suspect where applicable.
- Bug fixes: regression test failed before the fix and passed after, with the actual runs.
- Execution: exactly which tests ran and how, or that tests were authored but not executed.
- Gaps: behavior that remains untested and why.

## Reference

Read `references/test-setup.md` for test asmdef JSON, folder layout, manifest/testables notes, minimal EditMode and PlayMode examples, and a humble-object before/after sketch.
