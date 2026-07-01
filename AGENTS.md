# AI Agents Kit Repository Instructions

## Purpose

This repository stores a portable Codex environment kit for Unity and C#/ASP.NET game development. Keep the kit reusable, conservative, and free of secrets.

## Layout Contract

- `plugins/codex-unity-agent-kit/skills/` is the single source of truth for skills. Templates never embed skill copies; installers copy from the plugin at install time.
- The canonical skill sets (unity / backend / shared) live in `scripts/kit-common.ps1`. Adding or renaming a skill means updating that file, the README skill list, and the relevant template `AGENTS.md` routing table.
- `global/agents/*.toml` is the source for agent definitions; template copies under `templates/*/.codex/agents/` must stay byte-identical (validated by `scripts/validate-kit.ps1`).
- The full engineering discipline lives only in `global/AGENTS.md`. Template `AGENTS.md` files carry a short core-discipline summary plus stack specifics - do not re-duplicate the full rulebook.

## Editing Rules

- Prefer small, reviewable edits.
- The kit is international: English only, everywhere. No non-English text in skills, templates, documentation, code, comments, or commit messages. All template and plugin files stay ASCII with no exceptions (`validate-kit.ps1` enforces this).
- Do not commit credentials, OAuth tokens, Codex auth state, Unity license data, or machine-local cache paths.
- Keep skills focused: `SKILL.md` stays procedural and under ~90 lines; detailed checklists and command templates go in `references/`.
- Every skill ships `agents/openai.yaml` whose `default_prompt` references `$<skill-name>`.
- Bump `VERSION` and add a `CHANGELOG.md` entry when shipping changes that affect installed projects.

## Validation

After changing anything in the kit:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-kit.ps1
```

It checks skill frontmatter, openai.yaml completeness, reference-file integrity, manifest parsing, skill-set consistency, agent/rules duplication drift, and the ASCII policy. It must pass before committing.

Optional deeper checks when the Codex system skills are installed locally:

```powershell
python "$env:USERPROFILE\.codex\skills\.system\skill-creator\scripts\quick_validate.py" "plugins/codex-unity-agent-kit/skills/<skill-name>"
python "$env:USERPROFILE\.codex\skills\.system\plugin-creator\scripts\validate_plugin.py" "plugins/codex-unity-agent-kit"
```
