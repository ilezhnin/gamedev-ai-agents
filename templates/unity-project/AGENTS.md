# Unity Project Instructions

## Project Shape

This repository is a Unity project. Assume the root contains `Assets/`, `Packages/`, and `ProjectSettings/`.

## Tech Stack

Declare the project's real stack so agents stop guessing. Replace the placeholders and delete rows that do not apply:

- Unity: <version from ProjectSettings/ProjectVersion.txt; render pipeline: URP / HDRP / Built-in>
- Async: <coroutines / UniTask / Awaitable; bans, e.g. "async void banned outside event handlers">
- Input: <new Input System / legacy Input Manager>
- UI: <UGUI / UI Toolkit; text: TMP / other>
- Convention-defining packages: <Addressables, Cinemachine, Odin, R3, DOTween, ...>
- Networking / multiplayer: <none / NGO / Mirror / Photon / custom>

Maintenance rule: when code uses a technology not listed here, ask the user whether to add it to this list.

## Module Map And Feature Routing

Declare module owners so features land in the right place. Replace the examples with the project's real modules:

- <Audio, ambience, hit/landing sounds> -> <Assets/.../Scripts/GameAudio>
- <Input, devices, shortcuts, cursor policy> -> <Assets/.../Scripts/GameInput>
- <UI windows and screens> -> <Assets/.../Scripts/View/UI/Windows/<WindowName>>
- <Persistence, saves, migrations> -> <Assets/.../Scripts/GameStates>

Rules:

- Before adding a feature, find the existing owner. Do not create a parallel `Manager`, `Service`, `System`, or `Utils` when a domain module already owns the responsibility.
- New top-level module folders require an explicit decision.
- Cross-module features integrate through a small adapter or port at the boundary, not by reaching into another module's internals.
- Each module keeps one public API and entry point so it can be replaced, extended, or tested alone.
- Maintenance rule: when a module appears, disappears, or changes owner, update this map.

## Discovery

- Read `ProjectSettings/ProjectVersion.txt` before assuming Unity version behavior.
- Read `Packages/manifest.json` before assuming packages are present; `DEPENDENCIES.md` explains why each package exists.
- Read `CODE_STYLE.md` before writing or reviewing C#.
- Read `.agents/learnings.md` when it exists - it holds project-specific lessons.
- Use `rg --files` before broad file reads; inspect relevant `.asmdef` files before cross-assembly changes.
- Check nearby tests before adding a new test style.

## Documentation Layout

- Project-wide contracts live at the root: `AGENTS.md`, `CODE_STYLE.md`, `DEPENDENCIES.md`, and `ARCHITECTURE.md` when the project has one.
- Module documentation lives next to the module in `<Module>/Documentation/*.md`, written as living docs: they describe the current state, not history.
- `docs/authoring/` - living content-authoring guides. `docs/qa/` - manual and regression checklists. `docs/tickets/` - implementation plans, architecture audits (from `$arch-audit`), and historical notes; a ticket is never a current contract.
- When behavior changes, update the owning doc in place; move superseded plans to `docs/tickets/`.

## Core Discipline

The kit's global profile (`~/.codex/AGENTS.md`, installed from the kit's `global/AGENTS.md`) carries the full engineering discipline. These are the load-bearing rules that apply even without it:

- State assumptions and risks before editing; when interpretations diverge meaningfully, ask instead of silently choosing.
- Minimum code that solves the task. No speculative abstractions, configurability, or new patterns beside existing ones.
- Surgical changes: touch only what the task requires, remove orphans your change created, match existing style and architecture.
- Read first, edit second: find real entry points, call sites, serialized usages, and tests before changing them.
- Reproduce bugs before fixing; fix root causes, never hide symptoms behind fallbacks, broad catches, or global scene searches.
- Preserve contracts: public APIs, serialized fields (use `FormerlySerializedAs`), asset GUIDs, save data, addressable keys.
- New dependencies and packages need explicit approval.
- Measure before optimizing; keep `Update`/`FixedUpdate`/UI-refresh paths allocation-free.
- Never log or commit secrets; treat player input, saves, mods, and network messages as untrusted.
- Report honestly: what changed, what was verified, what remains unverified. Never claim unrun validation.
- English only in every artifact: code, comments, docs, commit messages, branch names, learnings. Converse with the user in the user's language, but write into the repository only in English.
- Stop and ask when requirements conflict, a change is destructive or irreversible, or you cannot verify a risky result.

## Unity Asset Safety

- Preserve `.meta` files and GUIDs.
- Do not edit `Library/`, `Temp/`, `Obj/`, `Build/`, `Builds/`, `Logs/`, `.vs/`, or `UserSettings/` unless explicitly needed.
- Avoid hand-editing scene, prefab, or asset YAML unless the task requires it and the diff is easy to audit.
- Keep runtime code out of `Editor` folders and editor-only assemblies, and editor code out of runtime assemblies.
- Run `.codex/scripts/check-unity-meta.ps1` (installed by the kit) when in doubt about meta/GUID hygiene.

## Validation

- Prefer targeted validation over full-suite runs: compile check, focused EditMode/PlayMode tests, Unity console check.
- Use Unity batchmode or Unity MCP test tools when available; `$unity-validate` picks the cheapest sufficient level.
- Do not claim Unity compilation passed unless Unity actually compiled or the console was checked.

## Boundaries

- Always: preserve `.meta` files and GUIDs; run focused validation after edits; keep `.agents/plans/` artifacts current during coordinated work; report unverified gaps.
- Ask first: adding packages; changing `ProjectSettings/`; renaming serialized fields; save-schema changes; deleting assets; broad refactors; anything irreversible.
- Never: commit `Library/`, `Temp/`, build output, or secrets; regenerate or hand-edit GUIDs to "fix" conflicts; force-push shared branches; silence errors to make symptoms disappear; credit the AI agent as author or co-author anywhere - headers, commits, docs, changelogs.

## Skill Routing

Route by situation before acting. No task is "too small for a skill" - routing keeps behavior predictable. If you are about to "just quickly implement it", check this table first.

| Situation | Skill |
| --- | --- |
| Unfamiliar project or feature area, need the right files | `$unity-orient` |
| Unclear requirements, risky design, plan needs stress-testing | `$grill-me` |
| Module became spaghetti, needs an architecture audit and refactor backlog | `$arch-audit` |
| Task needs a written plan or agent handoff | `$planning` |
| Implement or refactor C# | `$unity-implement` |
| Bootstrap or author tests, especially in legacy code | `$unity-tests` |
| Errors, failing tests, broken scenes or behavior | `$unity-debug` |
| Scene/prefab/asset merge conflict | `$unity-merge` |
| Drive the Unity Editor: scenes, prefabs, PlayMode, screenshots | `$unity-mcp` |
| Performance complaint or budget miss | `$unity-profile` |
| Player build, batchmode build, CI build | `$unity-build` |
| Unity editor or package upgrade | `$unity-upgrade` |
| Review a diff, PR, or branch | `$unity-review` |
| Choose and run the right checks | `$unity-validate` |
| Coordinate a planned task across agents to a PR | `$crossworking` |
| Commit, push, and open the PR/MR | `$create-mr` |
| Capture a reusable lesson | `$learn` |
