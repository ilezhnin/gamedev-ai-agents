# Gamedev AI Agents Kit Repository Instructions

## Purpose

This repository stores a portable AI-agent kit (Codex, Claude Code, Google Antigravity) for Unity and C#/ASP.NET game development. Keep the kit reusable, conservative, and free of secrets. The install scripts target Windows (PowerShell 5.1 and pwsh 7); other platforms are out of scope for now.

## Layout Contract

- `plugins/codex-unity-agent-kit/skills/` is the single source of truth for skills. Templates never embed skill copies; installers copy from the plugin at install time.
- The canonical skill sets (unity / backend / shared) live in `scripts/kit-common.ps1`. Adding or renaming a skill means updating that file, the README skill list, and the relevant template `AGENTS.md` routing table.
- `global/canon/` (roles.json, permissions.json, hooks.json) is the single source of truth for agent roles, permissions, and hooks. The platform adapter layers - `.codex/agents/*.toml` + `.codex/rules` + `.codex/hooks.json`, `.claude/agents/*.md` + `.claude/settings.json`, and the `.agents/rules/*.md` Antigravity rules - are rendered from the canon at install time and must never be stored in the kit (`scripts/validate-kit.ps1` forbids the stored copies). The templates' static `.claude/CLAUDE.md` pointer is content, not an adapter, and is stored. The `reasoning` field currently renders only to Codex (`model_reasoning_effort`); Claude Code and Antigravity have no per-agent equivalent, so it is intentionally dropped there.
- The install layout is root-minimal by contract: template `AGENTS.md` is the only file installed into a project root (Codex/Cursor/Antigravity discovery requires it there); the other contracts live in `.agents/`, the Claude pointer in `.claude/CLAUDE.md`. Portable installs (`-Portable`, or the window toggle) git-exclude every manifest-tracked file via `.git/info/exclude`; the exclude block markers are shared between `scripts/kit-common.ps1` and `upm/Editor/KitGitExclude.cs` and must stay in sync.
- The full engineering discipline lives only in `global/AGENTS.md`. Template `AGENTS.md` files carry a short core-discipline summary plus stack specifics - do not re-duplicate the full rulebook.
- `upm/` is the Unity Package Manager wrapper. `upm/Kit~/` is a rendered artifact produced by `scripts/render-upm-payload.ps1` - never edit it by hand. Re-run the render script after changing templates, skills, or the canon; `validate-kit.ps1` fails on payload drift and on a `package.json` version that does not match `VERSION`.
- The install content sets are defined once in `scripts/kit-common.ps1` (`Install-KitUnityContent`, `Install-KitBackendContent`); installers and the payload renderer call these shared functions and must not restate the content list.

## Editing Rules

- Prefer small, reviewable edits.
- The kit is international: English only, everywhere. No non-English text in skills, templates, documentation, code, comments, or commit messages. All files under `templates/`, `plugins/`, `upm/`, and `scripts/` stay ASCII with no exceptions (`validate-kit.ps1` enforces this). Single exception: localized front pages (`README.<lang>.md`, currently `README.ru.md`) mirror `README.md` for readers - keep them in sync whenever the front page changes.
- Do not commit credentials, OAuth tokens, Codex auth state, Unity license data, or machine-local cache paths.
- Keep skills focused: `SKILL.md` stays procedural and under 130 lines (`validate-kit.ps1` enforces this); detailed checklists and command templates go in `references/`.
- Every skill ships `agents/openai.yaml` whose `default_prompt` references `$<skill-name>`.
- Bump `VERSION` and add a `CHANGELOG.md` entry when shipping changes that affect installed projects.

## Validation

After changing anything in the kit:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-kit.ps1
```

It checks per-skill structure (frontmatter, openai.yaml, reference integrity, size budget), skill-set consistency, canon parsing and rendering for all three platforms, the rendered-only guard (no stored adapters), hook targets, docs path references, README EN/RU structural parity, the CHANGELOG entry for the current version, the ASCII policy, and UPM package name/version lock-step plus `Kit~` payload drift. It must pass before committing; CI (`.github/workflows/validate.yml`) runs it on every push and pull request.

Optional deeper checks when the Codex system skills are installed locally:

```powershell
python "$env:USERPROFILE\.codex\skills\.system\skill-creator\scripts\quick_validate.py" "plugins/codex-unity-agent-kit/skills/<skill-name>"
python "$env:USERPROFILE\.codex\skills\.system\plugin-creator\scripts\validate_plugin.py" "plugins/codex-unity-agent-kit"
```
