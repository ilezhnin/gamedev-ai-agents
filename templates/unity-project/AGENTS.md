# Unity Project Instructions

## Project Shape

This repository is a Unity project. Assume the root contains `Assets/`, `Packages/`, and `ProjectSettings/`.

Declare the project-owned source and asset roots so agents know where project-authored work belongs and which imported folders are off limits. Replace this illustrative tree with the project's real layout:

```text
Assets/
|-- <ProjectRoot>/              # Project-authored game code, data, scenes, presets
|   |-- Scripts/                # Project-authored C# modules
|   |   |-- <ModuleName>/       # One runtime/editor capability
|   |   |   |-- Api/            # Stable public contracts, when the module exposes them
|   |   |   |-- Core/           # Lifecycle, orchestration, internal services
|   |   |   |-- Model/          # Plain data, IDs, requests, results, snapshots
|   |   |   |-- View/           # Unity-facing presentation and adapters
|   |   |   |-- Diagnostics/    # Read-only debug views, probes, and snapshots
|   |   |   |-- Documentation/  # Living module docs
|   |   |   |-- Tests/          # EditMode/PlayMode tests near the owner
|   |   |   `-- <SubFeature>/   # Optional smaller capability with its own shape
|   |   `-- Editor/             # Project-wide editor tooling
|   |-- Generated/              # Generated project output; read-only unless changing the generator
|   |-- Data/                   # Project-authored ScriptableObjects, catalogs, presets
|   |-- ComponentPresets/       # Optional component presets and authoring defaults
|   |-- Scenes/                 # Project-owned entry, menu, gameplay, and test scenes
|   `-- Art/                    # Project-authored art assets
|-- StreamingAssets/            # Runtime external content, JSON, mods, user-editable data
|-- Resources/                  # Bootstrap-critical synchronous assets only
|-- Settings/                   # Unity/render-pipeline assets; ask before broad changes
|-- Plugins/                    # Imported vendor/plugin code; do not edit unless asked
|-- 3rd Party/                  # Imported asset-store/vendor packages
`-- <ImportedSdkOrSampleRoot>/   # SDKs, samples, generated vendor assets owned elsewhere
```

Rules:

- Treat folders outside the declared project-owned roots as imported packages, samples, generated output, or engine-owned files unless this section says otherwise.
- Treat `<ProjectRoot>/Scripts/<ModuleName>` as the default home for project C# work; new top-level modules require an explicit decision.
- Do not hand-edit generated output; update the generator, source schema, or documented generation command.
- Keep runtime, editor-only, content, scene, and art ownership explicit when adding or moving folders.
- Maintenance rule: when a root folder appears, disappears, or changes ownership, update this layout in the same change.

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

## Runtime Startup Pipeline

Document the real startup path before changing scenes, composition roots, bootstraps, installers, generated-system registration, or first-frame runtime initialization. Replace the placeholders with the project-specific flow:

- Entry scenes and boot scenes: <...>
- Composition roots / bootstraps / installers: <...>
- Runtime lifecycle hosts: <...>
- Generated-system or feature registration points: <...>
- Required refresh commands before runtime changes: <...>

Rules:

- New runtime features must be registered in the owning startup or lifecycle point when the stack requires explicit registration.
- Do not add a second startup path, global singleton, scene scan, or fallback loader to bypass an existing bootstrap.
- If a feature cannot be wired because the owning registration point is unclear, stop and ask.

## Feature Or Module Template

Declare the expected folder shape for new features or modules. Replace this example with the project's real pattern and remove parts that do not apply:

```text
<FeatureOrModuleName>/
  Api/
  Core/
  Model/
  View/
  Diagnostics/
  Documentation/
  Tests/
```

Rules:

- Copy the nearest established feature shape before adding a new one.
- The template must name any required registration point, authoring guide, generated-code boundary, and test location.
- Generated files are read-only unless the task is to change the generator; update the generation command instead.
- Maintenance rule: when the project changes its feature shape, update this template in the same change.

## Discovery

- Read `ProjectSettings/ProjectVersion.txt` before assuming Unity version behavior.
- Read `Packages/manifest.json` before assuming packages are present; `.agents/DEPENDENCIES.md` explains why each package exists.
- Read `.agents/CODE_STYLE.md` before writing or reviewing C#; read `.agents/ARCHITECTURE.md` before module work, refactors, or adding public APIs.
- Read `.agents/learnings.md` when it exists - it holds project-specific lessons.
- Use `rg --files` before broad file reads; inspect relevant `.asmdef` files before cross-assembly changes.
- Check nearby tests before adding a new test style.

## Documentation Layout

- Project-wide contracts: `AGENTS.md` at the root; `ARCHITECTURE.md`, `CODE_STYLE.md`, and `DEPENDENCIES.md` in `.agents/`.
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
- Run `.agents/scripts/check-unity-meta.ps1` (installed by the kit) when in doubt about meta/GUID hygiene.

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
| New game or feature idea, needs a design contract first | `$gdd` |
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
| Run the staged game pipeline: stage, milestone, or full auto | `$game-pipeline` |
| Commit, push, and open the PR/MR | `$create-mr` |
| Capture a reusable lesson | `$learn` |
