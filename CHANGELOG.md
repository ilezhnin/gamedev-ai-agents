# Changelog

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
