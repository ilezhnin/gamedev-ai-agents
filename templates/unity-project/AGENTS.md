# Unity Project Instructions

## Project Shape

This repository is a Unity project. Assume the root contains `Assets/`, `Packages/`, and `ProjectSettings/`.

## Discovery

- Read `ProjectSettings/ProjectVersion.txt` before assuming Unity version behavior.
- Read `Packages/manifest.json` before assuming packages such as Input System, TMP, Cinemachine, Addressables, URP, HDRP, or Unity Test Framework.
- Use `rg --files` before broad file reads.
- Inspect relevant `.asmdef` files before changing cross-assembly code.
- Check nearby tests before adding a new test style.

## Engineering Discipline

These rules bias agents toward careful, reviewable Unity and C# work. Explicit user instructions and repository-specific instructions override these rules when they are more specific. Existing project conventions override personal style preferences unless the user asks for a redesign.

### 1. Think Before Coding

Do not assume. Do not hide confusion. Surface tradeoffs. Surface assumptions and risk before editing.

Before implementing:

- State important assumptions explicitly. If uncertain, ask.
- If multiple interpretations would lead to different code, present them instead of silently choosing one.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear enough to change scope, architecture, data, UX, validation, scene behavior, asset behavior, or platform behavior, stop. Name what is confusing. Ask.
- If the request can be solved without code, say so.
- If a change is risky, destructive, broad, security-sensitive, data-sensitive, asset-sensitive, or hard to verify, get confirmation first.

Ask clarifying questions before implementation, not after creating the wrong solution.

### 2. Simplicity First

Minimum code that solves the problem. Nothing speculative. Use the minimum code and content that solves the requested behavior.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that was not requested.
- No error handling for impossible scenarios just to hide broken invariants.
- No new frameworks, services, packages, Unity packages, managers, editor tools, asset pipelines, or architecture layers unless clearly justified.
- Prefer boring, explicit, maintainable code over clever code.
- If you write 200 lines and it could be 50, rewrite it.
- Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

Touch only what the task requires. Clean up only your own mess.

When editing existing code or assets:

- Do not improve adjacent code, comments, formatting, scenes, prefabs, import settings, or project files unless needed for the task.
- Do not refactor systems that are not part of the requested change.
- Match existing style, naming, architecture, serialization, async, logging, DI, event, and test patterns.
- Preserve public APIs, serialized fields, events, save data, asset GUIDs, scene references, prefab references, and behavior unless the task requires changing them.
- If unrelated dead code or broken assets are noticed, mention them instead of deleting them.

When your changes create orphans:

- Remove imports, variables, methods, files, tests, assets, asmdef references, package references, or config entries that your change made unused.
- Do not remove pre-existing dead code unless asked.
- Update direct call sites, tests, scenes, prefabs, ScriptableObjects, and content references affected by your change.
- The test: every changed line and asset diff should trace directly to the user's request.

A good patch looks intentional, small, and reviewable.

### 4. Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals and keep working until the goal is met or the blocker is explicit.

Examples:

- "Add validation" means write tests or checks for invalid inputs, invalid data, or invalid asset states, then make them pass.
- "Fix the bug" means reproduce the failure when possible, fix the root cause, and verify the failing path.
- "Refactor this" means preserve behavior and ensure relevant checks pass before and after where practical.
- "Improve performance" means measure baseline, change the bottleneck, and measure or verify the result.

For multi-step tasks, state a brief plan:

1. [Step] -> verify: [check]
2. [Step] -> verify: [check]
3. [Step] -> verify: [check]

Strong success criteria let agents loop independently. Weak goals like "make it work" require clarification or a concrete assumption.

### 5. Read First, Edit Second

Understand the existing system before changing it.

Before modifying code, assets, configuration, or tests:

- Find the real entry points, call sites, data flow, ownership boundaries, and tests.
- Read neighboring code to understand naming, structure, lifecycle, and conventions.
- Search for existing helpers, extension points, prefabs, ScriptableObjects, services, validators, editor tools, and test utilities before creating new ones.
- Confirm whether a bug is in code, asset data, scene wiring, package configuration, platform settings, environment, tests, migration data, or assumptions.
- Do not infer architecture from filenames alone.

Prefer existing extension points over new patterns.

### 6. Test-Driven Changes

Use tests and focused verification to define and protect behavior.

For bugs:

- Reproduce the issue first when possible.
- Add or identify a failing test, PlayMode/EditMode scenario, or manual reproduction that captures the bug.
- Make the smallest change that turns the failing path green.

For features:

- Test externally visible behavior, not implementation details.
- Cover meaningful edge cases, not every theoretical branch.
- Keep tests deterministic, focused, and readable.

If test infrastructure is missing or unusable:

- Say so explicitly.
- Perform the best available focused manual verification.
- State exactly what was and was not verified.

Never claim tests, builds, Unity compilation, console checks, or scene verification passed unless they actually ran or were verified by the environment.

### 7. Debugging Discipline

Diagnose before patching.

- Start with the observable failure: error text, logs, stack trace, broken scene, failing test, bad state, or incorrect gameplay behavior.
- Form one hypothesis at a time.
- Check the boundary where correct data becomes wrong.
- Prefer tracing inputs, outputs, state transitions, ownership, lifecycle, serialization, and persistence over guessing.
- Do not stack multiple speculative fixes.
- Do not silence errors, swallow exceptions, add broad null fallbacks, or add runtime repair just to make symptoms disappear.

A fix should explain why the bug happened and why the change prevents it.

### 8. Contract And Asset Safety

Protect callers, content, saves, assets, and existing behavior.

- Do not change public signatures unless necessary.
- Do not rename exported types, serialized fields, events, files, assets, scenes, addressable keys, save fields, or configuration keys without updating all consumers.
- Use `FormerlySerializedAs` when renaming serialized fields that may exist in scenes, prefabs, or assets.
- Preserve `.meta` files and GUIDs.
- For behavior changes, update direct tests, documentation, content workflows, or migration notes as needed.
- Validate untrusted input at system boundaries.
- Prefer explicit errors over silent fallback behavior.

When compatibility must break, say so clearly and explain the migration path.

### 9. Architecture Restraint

Design only as much architecture as the problem needs.

- Keep high cohesion and low coupling.
- Keep domain logic separate from IO, UI, transport, Unity scene glue, and framework glue where the project already follows that split.
- Introduce interfaces only when there are multiple implementations, a stable boundary, platform variation, or a testing need.
- Avoid new global mutable state, service locators, singletons, and hidden dependencies unless the project already uses that pattern.
- Do not rewrite a working subsystem to match a preferred architecture.

Good architecture reduces future change cost. Bad architecture hides simple logic behind ceremony.

### 10. Dependency Discipline

New dependencies are a cost.

Before adding a package, Unity package, plugin, service, SDK, source generator, analyzer, or runtime framework:

- Check whether the project already has a suitable library or helper.
- Confirm the dependency solves enough of the problem to justify its weight.
- Consider build size, licensing, security, maintenance, platform support, IL2CPP/AOT compatibility, console/mobile constraints, CI impact, and deployment impact.
- Avoid adding a dependency for trivial utilities.

If a dependency is necessary, use the smallest stable integration surface and get approval when the dependency changes project risk.

### 11. Error Handling

Handle realistic failures. Do not invent impossible ones.

- Handle IO, network, permissions, parsing, user input, timeouts, platform services, external APIs, and persistence failures at boundaries.
- Do not swallow exceptions without logging or returning actionable context.
- Do not convert all errors into generic "failed" messages.
- Do not add defensive null checks everywhere to hide broken invariants.
- Use assertions or clear invariant checks for states that should be impossible.
- Avoid hiding missing references or broken lifecycle order with global scene searches unless that behavior is explicitly required.

Error handling should make failures diagnosable, not invisible.

### 12. Performance

Measure before optimizing unless the issue is obvious.

- Prefer clear code until there is evidence of a bottleneck.
- Avoid obviously bad complexity in hot paths.
- Avoid allocations and expensive lookups in `Update`, `FixedUpdate`, input loops, UI refresh paths, physics loops, serialization passes, asset processors, and frequently called editor tooling.
- Do not trade readability for micro-optimizations without a measured or well-localized reason.
- When optimizing, record baseline, change, and result when practical.

Performance work is successful only when the target behavior improves without breaking correctness.

### 13. Security And Data Safety

Treat sensitive data and destructive actions carefully.

- Never log, commit, or hardcode secrets, tokens, credentials, private keys, license data, production connection strings, or personal data.
- Treat external input as untrusted: player input, save files, mod/content files, network messages, uploaded files, API requests, headers, and model output.
- Preserve authorization, authentication, ownership, permissions, and audit behavior where the project has them.
- Be careful with deletes, overwrites, bulk updates, save upgrades, asset migrations, and irreversible operations.
- Ask before destructive or broad changes unless explicitly instructed.

Security fixes should reduce risk without creating hidden behavior changes.

### 14. Documentation And Comments

Document intent, not noise.

- Do not add comments that merely repeat the code.
- Add comments for non-obvious decisions, constraints, invariants, lifecycle coupling, serialization hazards, migration reasoning, or platform-specific tradeoffs.
- Update documentation when public behavior, setup steps, commands, configuration, content workflow, or validation steps change.
- Do not rewrite unrelated documentation for style.

Good comments explain why. Code should usually explain what.

### 15. Communication

Be clear, direct, and honest.

Before coding:

- State assumptions, risks, and a short plan for non-trivial work.
- Ask when requirements are ambiguous in a way that changes implementation.

After coding:

- Summarize what changed.
- List tests or checks run.
- Mention unverified areas and remaining risks.
- Mention unrelated issues noticed, but do not fix them unless asked.

Do not present guesses as facts. Do not claim completion if verification failed.

### 16. Definition Of Done

A task is done when:

- The requested behavior is implemented.
- The solution is the smallest reasonable change.
- Relevant tests pass or manual verification is clearly reported.
- The diff contains no unrelated rewrites, formatting churn, generated noise, asset churn, or metadata churn.
- New code matches existing style.
- New code does not leave unused imports, variables, files, assets, dependencies, or dead call sites created by the change.
- Public contracts, documentation, content workflows, and direct consumers are updated when necessary.
- Known risks or follow-up work are stated honestly.

### 17. Stop Conditions

Stop and ask before continuing when:

- Requirements conflict.
- Multiple interpretations would lead to meaningfully different implementations.
- Required files, APIs, assets, credentials, package state, Unity version, SDK version, or context are missing.
- The requested change is destructive, irreversible, or security-sensitive.
- The fix requires a broad architecture change not explicitly requested.
- The change would add dependencies, alter public contracts, run migrations, change save data, or modify project-wide settings without approval.
- You cannot verify the result and the risk of being wrong is meaningful.

Stopping early is better than confidently implementing the wrong thing.

### 18. Working Indicators

These rules are working when:

- Diffs are smaller and easier to review.
- Fewer rewrites happen because assumptions were clarified up front.
- Reviews focus on product behavior, correctness, assets, tests, and contracts instead of cleanup caused by the agent.
- Bugs are reproduced before they are fixed.
- Validation is tied directly to the requested outcome.
- Agents report uncertainty and verification gaps instead of hiding them.

## Unity Asset Safety

- Preserve `.meta` files and GUIDs.
- Do not edit `Library/`, `Temp/`, `Obj/`, `Build/`, `Builds/`, `Logs/`, `.vs/`, or `UserSettings/` unless explicitly needed.
- Avoid hand-editing scene, prefab, or asset YAML unless the task requires it and the diff is easy to audit.
- When renaming serialized fields that may exist in assets, use `UnityEngine.Serialization.FormerlySerializedAs`.
- Keep runtime code out of `Editor` folders and editor-only assemblies.

## C# Rules

- Follow existing naming, formatting, async, logging, DI, event, and test patterns.
- Prefer `[SerializeField] private` for new inspector fields.
- Avoid per-frame allocations and expensive lookups in hot paths.
- Do not add production dependencies or Unity packages without explicit approval.
- Keep changes narrow and behavior-focused.

## Validation

- Prefer targeted validation over full-suite runs.
- Use Unity batchmode or Unity MCP test tools when available.
- If Unity cannot run, report the blocker and the exact validation gap.
- Do not claim Unity compilation passed unless Unity actually compiled or the Unity console was checked.

## Useful Skills

- `$unity-orient-project` for first-pass project mapping.
- `$unity-implement-csharp` for C# implementation.
- `$unity-review-changes` for review.
- `$unity-validate-project` for tests and compile checks.
- `$unity-debug-and-recover` for root-cause debugging of Unity/C# failures.
- `$unity-use-editor-mcp` for Unity Editor MCP scene, prefab, asset, and test workflows.
- `$grill-me` for hard questioning and Unity/game-dev plan stress-testing before implementation.
- `$planning` for writing `.agents/plans/active_plan.md` and `.agents/plans/task_list.md`.
- `$crossworking` for coordinating planned work through implementation, review, validation, and create-mr handoff.
- `$create-mr` for verifying, committing, pushing, and opening a Pull Request / Merge Request.
- `$teamwork-preview` for invoking a coordinated agent team on larger tasks.
- `$learn` for capturing reusable rules or skill updates after a success, correction, or repeated workflow.
