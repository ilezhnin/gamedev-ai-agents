# AI Agents Kit Repository Instructions

## Purpose

This repository stores a portable Codex environment kit for Unity and C# projects. Keep the kit reusable, conservative, and free of secrets.

## Editing Rules

- Prefer small, reviewable edits.
- Keep all template files ASCII unless a target project explicitly requires otherwise.
- Do not commit credentials, OAuth tokens, Codex auth state, Unity license data, or machine-local cache paths.
- Keep skills focused. Put detailed checklists in `references/` and keep `SKILL.md` procedural.
- Validate skills after editing them.
- Validate plugin manifests after editing plugin metadata.
- When adding Unity project rules, prefer `templates/unity-project/AGENTS.md` over global instructions unless the behavior should apply to every repository.

## Validation

After changing skills:

```powershell
python <path-to-skill-creator>/scripts/quick_validate.py "plugins/codex-unity-agent-kit/skills/<skill-name>"
```

After changing the plugin:

```powershell
python <path-to-plugin-creator>/scripts/validate_plugin.py "plugins/codex-unity-agent-kit"
```
