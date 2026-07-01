# Changelog

## 0.3.0 - 2026-07-01

Conventions ported from a production Unity project (SandboxWrestling) and generalized.

### Added
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
