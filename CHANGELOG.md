# Changelog

## 0.4.18 - 2026-07-10

### Added
- Added the shared `simplify-change` skill and wired it into Unity and backend installs as a mandatory behavior-preserving cleanup gate before final validation and review.
- Added usage telemetry regression tests for exact session IDs, Codex lineage replay, long-context pricing, V2 snapshots, and compact fail-closed footers.

### Changed
- Pinned canonical role model tiers for Codex and Claude renderers, including Claude Fable full IDs, Haiku without unsupported effort overrides, read-only tool restrictions, and Antigravity model routing policy.
- Reworked `crossworking`, `game-pipeline`, `planning`, `gdd`, and `create-mr` around path-exclusive ownership, isolated candidate trees, task-content fingerprints, authorized delivery boundaries, and no duplicate validation/review orchestration.
- Moved game design contracts to scoped `.agents/plans/*-gdd.md` working artifacts instead of repository design docs.

### Fixed
- Hardened Unity validation/build references with exact editor verification, immutable evidence attempts, protected-content mutation guards, postflight in `finally`, and detached reviewed-commit build worktrees.
- Replaced stale/latest usage footer fallback with exact-session fail-closed behavior, full session IDs, model+effort accounting, per-request long-context pricing, and replay-aware Codex rollout snapshots.

## 0.4.17 - 2026-07-08

### Added
- Started the Usage Analytics V2 migration with a local v2 event log, rebuildable current-session view, and footer support for reading current logical-session usage from the v2 view before falling back to legacy reports.
- Added V2 current-session model, agent, tool, and health rendering to the Unity usage panel, plus a Rebuild V2 action.
- Added an idempotent V1 history migration path that imports legacy `history.jsonl` rows as historical V2 events without making them the current session.

### Changed
- Tightened Unity script organization contracts around subsystem-first module layout, fixed layer-folder vocabulary, legal single-layer subsystems, legal grouping folders inside layers, and exact folder/namespace/usings mirroring.
- Updated Unity implementation, review, architecture-audit, and read-only codebase-audit skills to enforce those structure rules and to read project overlays before judging folder or namespace changes.
- Changed Unity boundary guidance so asmdefs remain the default enforcement mechanism, while documented asmdef-less projects are audited through source-scan guard tests instead of being automatically flagged for missing per-module asmdefs.

### Fixed
- Fixed Codex Desktop usage session totals so long-lived rollout files no longer make the visible current-session footer inherit old Codex turns and costs.
- Fixed V2 tool analytics to count completed Codex tool operations instead of double-counting begin/end event pairs.

## 0.4.16 - 2026-07-07

### Changed
- Expanded `codebase-audit` with explicit lanes for overengineering, silent fallbacks that mask root causes, and Unity runtime authoring that should live in scenes, prefabs, or assets.
- Expanded `arch-audit` to flag speculative abstractions, dishonest fallback behavior, and runtime object/component/UI setup that belongs in stable Unity authoring assets.

## 0.4.15 - 2026-07-07

### Fixed
- Usage footer output is now platform and session scoped. The reporter writes platform-specific and session-specific report files, and the visible footer accepts `-Platform codex`, `-Platform claude`, or `-Platform gemini` while auto-selecting the current session when the client exposes a session/thread id. Parallel Codex and Claude sessions in the same project no longer show each other's latest turn.

## 0.4.14 - 2026-07-07

### Added
- Added `.agents/scripts/usage-footer.ps1`, a visible final-response usage footer helper that reads the latest usage report and renders brief or full Markdown for agents to paste into their own replies.

### Changed
- Project and global instructions now require agents to append usage stats to every final response: brief for simple answers, full after skills, subagents, edits, validation, commits, PR/MR work, or multi-step workflows. This no longer depends on Codex, Claude Code, VS Code, or other clients rendering hook `systemMessage` output.
- Usage reporting docs now distinguish the hook collection path (`.agents/usage/last-report.md` and history) from the visible final-response path (`usage-footer.ps1`).

## 0.4.13 - 2026-07-07

### Added
- Added the shared `codebase-audit` skill for read-only whole-project issue audits across Unity and C#/ASP.NET projects. The audit covers code quality, bugs, vulnerabilities, security checks, rollback/save/GGPO readiness, and strict determinism, uses subagents for broad lanes when available, and writes a separate report without modifying project files.

### Changed
- Routed Unity and backend project templates, review skills, architecture audits, and crossworking away from delivery/review workflows and toward `codebase-audit` when the user asks for a read-only project audit report. Unity and backend installs now both include the new shared skill.

## 0.4.12 - 2026-07-03

### Added
- Unified usage reporting across Claude Code, Codex, and Gemini CLI. The same `.agents/scripts/usage-report.ps1` now auto-detects hook input and emits a post-turn `systemMessage` for Claude transcript usage, Codex rollout `token_count` events, and Gemini CLI local telemetry. The persistent Unity panel history now includes `gemini` as a first-class platform alongside `claude` and `codex`.
- Gemini CLI adapter rendering: installers now generate `.gemini/settings.json` from the hook canon, enabling local telemetry output under `.agents/usage/` and wiring an `AfterAgent` usage hook without storing rendered Gemini settings in templates.

### Changed
- Codex hooks now use a Codex-specific `powershell.exe` command path so WSL-based Codex sessions can run the Windows-focused kit scripts without requiring `pwsh` inside WSL. The reporter converts `/mnt/<drive>/...` and common WSL transcript paths to Windows-readable paths before parsing.
- Usage price refresh now keeps Gemini model prices from the LiteLLM feed, with bundled fallback prices for common Gemini 2.5 models.

## 0.4.11 - 2026-07-03

### Added
- Usage and cost reporting for Claude Code sessions: a canonical `Stop` hook runs `usage-report.ps1` (shipped to `.agents/scripts/` for both stacks), which incrementally parses the local session transcripts - main agent plus every subagent - and prints per-model, per-role token usage with an API-equivalent cost estimate, wall time, and agent parallelism after each turn. Usage is deduplicated per request, cache writes are priced per TTL (5m vs 1h), and everything is computed from local files: zero extra tokens, zero API calls.
- Price data ships as a bundled snapshot (`usage-prices.json`, including time-limited promo overrides) and refreshes in a detached background pass from the LiteLLM community feed into `.agents/usage/prices.cache.json`. When a refresh fails or data goes stale, the report says so explicitly instead of presenting outdated estimates as current.

### Changed
- Canonical hooks support an optional `platforms` field: the usage reporter renders only into the Claude Code settings adapter and stays out of Codex hooks and Antigravity automation rules. Claude hook entries without a matcher (lifecycle events like `Stop`) now omit the `matcher` key.
- Global and template instructions pin a professional communication style: engineering-log tone, concrete actions and results, no filler or playful narration, outcome-first summaries.

## 0.4.10 - 2026-07-03

### Changed
- The `gdd` skill now gates the design contract on a mandatory `grill-me` pass with the user: assumptions recorded while drafting become grill questions, a failed grill loops the design back to research with the corrected inputs, and the run always ends by asking whether to execute via `game-pipeline` (staged or auto), plan milestone 1 only, or stop - it never starts execution itself.
- The `game-pipeline` skill now has an entry gate: without a design contract it offers to create one with `gdd` and stops; an unapproved contract blocks execution; milestone and auto modes require the user to name them in the current request (wording in the original idea prompt is not consent); approvals and the chosen mode land in the pipeline decision log.
- The `game-designer` role carries the same guarantees: the grill is mandatory before the GDD is final, and the role never starts the delivery pipeline on its own.

## 0.4.9 - 2026-07-03

### Changed
- Skill role routing now names every canonical role explicitly at least once. Orientation, review, validation, planning, and crossworking skills now bind explorer, reviewer, and test-runner roles without relying on wildcard-only references.

## 0.4.8 - 2026-07-03

### Added
- Added first-class asset pipeline support for Unity projects: the `asset-pipeline` skill covers local reuse, public asset sourcing, image-generation handoffs, Unity import/setup, provenance, licensing, and validation. The game pipeline now has an Assets stage before Build, and GDD/planning/crossworking/grill-me/review workflows route asset-heavy work through the new pipeline.
- Added canonical roles for asset work and handoff context: `asset-scout`, `asset-creator`, `unity-asset-integrator`, and `context-builder`, rendered to Codex, Claude Code, and Antigravity from the shared canon.

## 0.4.7 - 2026-07-03

### Fixed
- Commit identity safeguards now block auto-generated fallback authors such as `root@...` or `.localdomain`: global instructions, the PR/MR shipping skill, git conventions, and `validate-kit.ps1` all require a real configured project identity before commits or amends.

## 0.4.6 - 2026-07-03

### Added
- Unity project instructions now include an ASCII project-owned layout template for `Assets/<ProjectRoot>/Scripts/<ModuleName>` modules, module docs/tests, Unity content roots, and imported SDK/plugin roots so installed projects can document where agents should work and which roots are off limits.

## 0.4.5 - 2026-07-03

### Added
- Unity project templates now ask projects to document the runtime startup pipeline and the expected feature/module folder shape, including explicit registration points, generated-code boundaries, refresh commands, and test locations.
- The Unity architecture contract now states the content-loading default: use Addressables or the declared async content pipeline for loadable content, and reserve `Resources/` for bootstrap-critical synchronous assets with a documented reason.

## 0.4.4 - 2026-07-03

### Fixed
- Unity Package Manager updates now automatically apply the kit payload update to already-installed projects. The automatic pass uses the same manifest/hash semantics as the Update button: unmodified kit files are refreshed, local edits are kept, stale shipped files are removed, and portable git-exclude entries are refreshed when portable mode is already active.
- High-responsibility planning, architecture, design, consistency, and production roles now use the highest canonical reasoning tier. Codex agents render that as `model_reasoning_effort = "xhigh"`; Claude Code subagents now render `effort` frontmatter and map the maximum tier to `max`. Execution, research, validation, and shipping roles stay at medium unless their risk profile justifies high.

## 0.4.3 - 2026-07-03

### Fixed
- Project and optional global Codex configs no longer set `model_reasoning_effort = "medium"`, so new chats keep the user's selected reasoning level instead of being reset by the kit layer. Per-agent reasoning in the rendered Codex agent TOMLs is unchanged.

## 0.4.2 - 2026-07-01

### Fixed
- Re-adding the package within the same editor session no longer skips the setup window. The once-per-session latch lives in SessionState, which survives domain reloads, so after a remove + re-add the bootstrap stayed silent until the editor restarted (the "do not open automatically" preference was never involved). A `registeredPackages` watcher now resets the latch when this package is freshly added and re-runs the prompt, which still opens only when the kit is missing or older than the package.

## 0.4.1 - 2026-07-01

### Fixed
- Removing the package through the Package Manager left every installed kit file behind. A `registeringPackages` watcher (raised before the package assemblies unload - afterwards the kit's code no longer exists in the project) now offers to remove the installed files with the usual uninstall semantics (locally modified files are kept) and clears the portable git-exclude block. The window's "Remove Package Reference" sets a session flag so the portable flow still keeps the files, and batch mode never deletes files on package operations - it logs the manual uninstall paths instead.

## 0.4.0 - 2026-07-01

Root-minimal install layout and portable (no-trace) installs.

### Added
- Portable installs (no trace in the repo): `-Portable` on the project installers and a "Portable install" toggle in the Agent Kit window list every manifest-tracked kit file in the repository's `.git/info/exclude` - a local, never-committed ignore file - so nothing shows in `git status` and `.gitignore` stays untouched. The block refreshes automatically on later installs/updates, uninstall removes it, nested project targets get repo-relative prefixes, and the transient `.agents/plans/` directory is excluded as a directory (its own `.gitignore` re-includes itself, which overrides file-level entries). The window also gained "Remove Package Reference": drops the package entry from `Packages/manifest.json` and the lock file via the Package Manager API - installed kit files keep working, and re-adding the package restores update/uninstall.

### Changed
- Near-single-folder install layout: `ARCHITECTURE.md`, `CODE_STYLE.md`, and `DEPENDENCIES.md` moved from the project root into `.agents/`, and `CLAUDE.md` moved to `.claude/CLAUDE.md` (a documented auto-load location; parent-relative `@../AGENTS.md` imports verified against a live Claude Code session). `AGENTS.md` is now the only root file the kit ships - the discovery contracts of Codex, Cursor, and Antigravity require it there. Existing installs migrate on `-Update`/window Update via the stale-file sweep; locally edited contracts at the old root locations are kept with a warning and should be moved into `.agents/` manually. The dead `project_doc_fallback_filenames = ["CLAUDE.md"]` entry was dropped from both template Codex configs, and validate-kit's rendered-only guard now forbids only the rendered `.claude` parts (agents, settings.json, skills), allowing the static template `CLAUDE.md` pointer.

## 0.3.0 - 2026-07-01

Conventions ported from a production Unity project (SandboxWrestling) and generalized.

### Added
- Gamedev studio roles in the canon, rendered to all platforms like the existing roles: `game-designer` (Unity stack: owns the GDD - core loop, mechanics with module owners, balance as data, scope-boxed MVP, playable milestones) plus shared `producer` (pipeline state, stage gates, descope-before-quality-cuts), `architect` (read-only guardian of the ARCHITECTURE.md contract, arbitrates boundary decisions), `devops` (CI, batchmode builds, release discipline: validation -> version -> changelog -> tag -> artifact), and `qa` (acceptance and exploratory testing with PlayMode/MCP evidence, distinct from the automated test-runner roles). Crossworking's team shape and the role hierarchy rule now include them.
- Game delivery pipeline skills: `gdd` turns an idea into `docs/design/game-design.md` (design contract with a milestone list where every milestone ends playable), `game-pipeline` executes it through gated stages - define -> plan -> build -> test -> review -> ship - with state in `.agents/plans/pipeline.md` and three modes: stage-by-stage, per milestone, and fully automatic from one prompt until the GDD's MVP checklist is done.
- Unity Package Manager install path: `upm/` ships an editor package installable via `Add package from git URL...` (`?path=/upm`). A setup window (`Window -> Agent Kit -> Setup`, opened automatically when the kit is missing or outdated) installs, updates, force-reinstalls, and uninstalls the kit files with the same manifest and hash semantics as the PowerShell installers, plus a dry-run preview. The payload (`upm/Kit~`, hidden from the asset importer) is pre-rendered by `scripts/render-upm-payload.ps1`; `validate-kit.ps1` fails on payload drift and on `package.json` version mismatch.
- Google Antigravity as a third first-class platform, rendered from the same canon: `AGENTS.md` and `.agents/skills/` are read natively (no adapter needed); agent roles ship as `.agents/rules/kit-agent-roles.md` (model_decision rule for Antigravity's dynamic orchestration - it has no static subagent format), permissions as `.agents/rules/kit-permissions.md` (always-on behavioral rule; IDE terminal lists are GUI-only), and post-edit automation as `.agents/rules/kit-automation.md` (its file-hook protocol is CLI-verified but IDE-uncertain). Platform surface verified against official codelabs and changelogs, July 2026.
- Four shared agent roles in the canon, installed for both stacks and rendered to both platforms: `planner` (produces plan artifacts, never implements), `oracle` (fresh-context drift check against inherited decisions on long tasks), `researcher` (source-backed web research brief: directions, primary sources, kept/dropped sources, gaps), `pr-submitter` (shipping agent that follows create-mr and git conventions). Crossworking gained the context-handoff format (`context.md` + `meta-prompt.md` in `.agents/plans/`), maps every team-shape slot to a concrete role, and states the hierarchy rule: specialized stack roles implement/test/review, broader-profile roles coordinate above them.
- Platform independence: `global/canon/` (roles.json, permissions.json, hooks.json) is the single source of truth; installers render both platform adapter layers from it - `.codex/agents/*.toml` + `.codex/rules` + `.codex/hooks.json` for Codex and `.claude/agents/*.md` + `.claude/settings.json` (permissions + hooks) for Claude Code - and mirror skills into `.claude/skills/`. Stored platform copies removed from the kit (validate-kit guards against their return); `check-unity-meta.ps1` moved to the neutral `.agents/scripts/`; global installer gained `-InstallClaude`; doctor reports layer drift; durable-state rule added to the global discipline (all work state lives in repo files, so switching platforms loses nothing).
- `ARCHITECTURE.md` templates for both project types - the single project-wide architecture contract: modular standard with ports/adapters and typed outcomes, module shape (`Api/Core/Model/View/Diagnostics/Documentation/Tests`), asmdef boundary enforcement (Unity) / composition and DI rules (backend), layer rules, state-command-result ownership, determinism and replay, content catalogs, snapshots and cache invalidation, serialization compatibility, external-SDK adapters, testing requirements, governance. Wired into template AGENTS.md discovery, implement skills, and arch-audit (audits run against the project contract).
- `arch-audit` skill: whole-module architecture audit through a SOLID/KISS/DRY/SRP and anti-overengineering lens, producing a dependency-ordered refactor backlog (stable task IDs, severity, non-goals, acceptance criteria) in `docs/tickets/`, with refactor discipline and a definition of done in references.
- `CODE_STYLE.md` templates for both project types: file headers derived from the project (never the AI), namespace/usings layout, naming (`_camelCase`, `UPPER_SNAKE_CASE` contracts, `Is/Can/Has/Try` booleans), formatting, async rules, `#region` class organization, scene-first UI wiring.
- `DEPENDENCIES.md` stubs for both templates: every package documented with its reason; updated in the same change as any package change (wired into unity-upgrade, unity-implement, backend-implement).
- Template `AGENTS.md` sections: Module Map And Feature Routing (owners, no parallel Manager/Service, adapter-at-boundary) and Documentation Layout (`<Module>/Documentation/`, `docs/authoring|qa|tickets`).

### Changed
- One file - one entity is a hard, exceptionless rule across the kit: every class, struct, interface, enum, record, and delegate lives in its own file named after it; nested types are forbidden, including private ones (generated code exempt). Encoded in global AGENTS.md, both CODE_STYLE.md templates (no `Nested Types` region), implement rules, review checklists (must-fix), and the arch-audit lens.
- English-only policy: the kit is international - all artifacts (code, comments, docs, commits, branch names, learnings) are English with no exceptions; removed the non-English trigger phrases from grill-me and the ASCII allowlist from validate-kit.
- Attribution rule everywhere: the agent never credits itself as author or co-author - headers, commits, docs, changelogs, PR bodies (global AGENTS.md, git-conventions, CODE_STYLE, template boundaries).
- Global AGENTS.md: architecture restraint now names SOLID/KISS/DRY/SRP, systems/subsystems with one public API and entry point, GoF-where-it-pays, delete-before-abstracting, economical codebase growth; error handling upgraded to a fail-loud contract (typed failures, no silent fallbacks or empty-ID markers, reject invalid data at authoring time).
- Unity patterns: asmdef best practices as the kit's boundary-enforcement norm (per-module runtime/editor/tests, minimal references, propose asmdefs for outgrown Assembly-CSharp), determinism rules (tick-driven, seeded random, ordered async commits), scene-first UI wiring, fail-loud section. Backend patterns gained the fail-loud section.
- Review checklists (both stacks): overengineering and principles lens - single-implementation abstractions, parallel owners, one-caller public surface, missed reuse, SRP breaches, cleanup that grows production code.
- Commit conventions: behavioral subjects through the domain, bullet bodies with concrete changes, mention tests/docs/wiring; explicit no-AI-attribution rule.
- Audit follow-up, same day. Added: `backend-tests` skill (bootstrap .NET test infrastructure: xUnit project setup, WebApplicationFactory integration tests, Testcontainers, EF test-double guidance) routed from the backend template and listed on every skill surface; global uninstall (`uninstall-project-template.ps1 -Global` removes manifest-tracked files from `~/.codex`, `~/.agents`, `~/.claude`) with the global installer now manifest-tracking the `~/.agents` and `~/.claude` side copies so updates preserve local edits there too; CI workflow (`.github/workflows/validate.yml`) running validate-kit on every push and PR; new validate-kit checks (SKILL.md 130-line budget, hook targets shipped in the payload, docs path references, README EN/RU structural parity, CHANGELOG entry for the current version, ASCII over `scripts/`).
- Audit follow-up, fixed: deterministic payload rendering - `.claude/settings.json` and `.codex/hooks.json` now come from a kit JSON writer with stable formatting and LF, so the payload drift check passes identically under Windows PowerShell 5.1 and pwsh 7 (it failed on a clean checkout before); manifest integrity - plain re-install over an older install no longer records payload hashes for files it skipped (PowerShell and the UPM editor installer both carried the bug, which made later updates misread pristine kit files as locally modified and broke uninstall); the stale-file sweep runs on any previous install so `-Force` cannot orphan files the kit no longer ships; `render-upm-payload.ps1 -WhatIf` honors ShouldProcess instead of wiping the payload; `doctor.ps1` survives PS 5.1 with unauthenticated `gh`, verifies layer drift against manifest hashes, and distinguishes "not installed" from "layer missing"; `-InstallAgentsMd` actually activates the kit AGENTS.md after backing up; WSL home detection sets `WSL_UTF8=1`; the UPM installer survives locked/read-only files without losing manifest tracking, writes the manifest atomically, parses prerelease versions, disables plain Install when a manifest exists, and gained a per-project do-not-auto-open opt-out; `check-unity-meta.ps1` handles git renames and non-ASCII paths, scans untracked directories recursively, and forbids `obj/` anywhere in the tree; `unity-build` reference snippets compile as written (`BuildScript.BuildActiveProfile` entry point added, Addressables `using` fixed) and the GameCI Windows-image claim is current.
- Audit follow-up, consistency: install content sets defined once in kit-common (`Install-KitUnityContent` / `Install-KitBackendContent`) and shared by installers and the payload renderer; repo `AGENTS.md` layout contract rewritten around `global/canon/` (the old `global/agents/*.toml` bullet contradicted validate-kit); `game-pipeline` requires explicit invocation and uses canonical role names; unity-orient gained Stop Conditions, a Final Report, and a deeper discovery checklist; backend-review gained Quality Gates and backend-debug gained Red Flags (unity/backend families symmetric again); template `ARCHITECTURE.md` opens with an adapt-on-install preamble instead of asserting the default contract as project fact; template `CLAUDE.md` imports `@AGENTS.md`; dead `project_doc_fallback_filenames` entries dropped; `unity-mcp` recovery checklist folded into the skill; skill cross-references use `$name` notation consistently; Windows-only scope stated explicitly in README and repo AGENTS.md; plugin.json marketplace descriptions mention `gdd`, `game-pipeline`, and `backend-tests`; RU README parity drops fixed.

## 0.2.0 - 2026-07-01

Audit-driven overhaul.

### Changed
- Normalized skill names to `<domain>-<action>`: `unity-orient`, `unity-implement`, `unity-review`, `unity-validate`, `unity-debug`, `unity-mcp`, `backend-implement`, `backend-review`, `backend-validate`. Agent TOMLs renamed to match (`unity-worker`, `backend-*`).
- Merged `teamwork-preview` into `crossworking` (team sizing, grill-me gate, unified triggers); removed the separate skill.
- Rewrote `create-mr`: removed foreign Node/Go examples, added trigger phrases, plan-contract check, change-size gates, and `references/git-conventions.md`.
- Rewrote `learn` to work both inside the kit and inside installed projects; added the `.agents/learnings.md` convention.
- Fixed Unity test commands: `-quit` must not be combined with `-runTests`; added `-nographics` and exit-code notes.
- Fixed the backend smoke-check template to run the API as a background process.
- Slimmed template `AGENTS.md` files to stack specifics plus a core-discipline summary, a Tech Stack manifest, Always/Ask-first/Never boundaries, and a skill routing table. The full discipline lives in `global/AGENTS.md`.
- Installers rewritten: manifest-based installs (`.agents/kit-manifest.json`), `-Update` mode that refreshes unmodified files and preserves local edits, `-WhatIf` support, hard target validation, and summaries. Unity template no longer embeds duplicated skill copies - all installs copy from the plugin source of truth.
- Global skills now install to both `~/.agents/skills` (documented location) and `~/.codex/skills` (legacy); WSL install now delivers the full profile.

### Added
- New skills: `backend-orient`, `backend-debug`, `unity-merge`, `unity-build`, `unity-upgrade`, `unity-profile`, `unity-tests`.
- Skill hardening: rationalizations-to-reject, red flags, finding classification (severity x confidence), STRIDE threat-model pass, dependency vulnerability triage, rendering triage, save-migration rules, grill-me confidence mechanics.
- Scripts: `validate-kit.ps1` (kit self-lint), `doctor.ps1` (environment health), `uninstall-project-template.ps1`, `check-unity-meta.ps1` (meta/GUID hygiene, wired as a Unity project hook), `kit-common.ps1` (shared library and canonical skill sets).
- Cross-platform adapters in both templates: thin `CLAUDE.md` and `.cursor/rules/agents.mdc` pointing at `AGENTS.md`.
- Working `hooks.json` in the Unity template (post-edit meta check); removed the dead stub from the backend template.
- Repo hygiene: `VERSION`, `CHANGELOG.md`, `LICENSE`, `.gitignore`.

## 0.1.0

Initial kit: Unity/backend skills, project templates, plugin marketplace, global profile, PowerShell installers.
