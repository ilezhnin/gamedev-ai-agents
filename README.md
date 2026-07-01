# Codex Unity Agent Kit

Portable Codex setup for Unity, C#, and ASP.NET backend work. This repository is a source kit: it contains project templates, reusable skills, a local plugin marketplace, custom agents, and installer scripts.

## Layout

```text
AGENTS.md
global/
  AGENTS.md
  unity-codex.config.toml
  agents/
  rules/
templates/
  unity-project/
    AGENTS.md
    .codex/
    .agents/
  csharp-aspnet-project/
    AGENTS.md
    .codex/
    .agents/
plugins/
  codex-unity-agent-kit/
.agents/
  plugins/
scripts/
```

## Use In A Unity Project

Apply the project template:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-unity-project-template.ps1 -TargetProject "<path-to-unity-project>"
```

The script copies:

- `AGENTS.md`
- `.codex/config.toml`
- `.codex/agents/*.toml`
- `.codex/rules/*.rules`
- `.agents/skills/*`

Included skills:

- `$unity-orient-project`
- `$unity-implement-csharp`
- `$unity-review-changes`
- `$unity-validate-project`
- `$unity-debug-and-recover`
- `$unity-use-editor-mcp`
- `$grill-me` - Unity/game-dev plan grilling and decision stress-testing
- `$planning` - creates `.agents/plans/active_plan.md` and `.agents/plans/task_list.md`
- `$crossworking` - coordinates planning, workers, validation, review, and create-mr handoff
- `$create-mr` - verifies, commits, pushes, and opens a Pull Request / Merge Request
- `$teamwork-preview` - invokes a coordinated agent team for larger tasks
- `$learn` - captures reusable rules or skill updates from completed work

Restart Codex or open a new thread from the Unity project after copying.

## Use In A C# ASP.NET Project

Apply the backend project template:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-csharp-aspnet-project-template.ps1 -TargetProject "<path-to-backend-project>"
```

The script copies:

- `AGENTS.md`
- `.codex/config.toml`
- `.codex/agents/*.toml`
- `.codex/rules/*.rules`
- selected `.agents/skills/*`

Included backend skills:

- `$csharp-backend-implement`
- `$csharp-backend-review`
- `$csharp-backend-validate`

It also includes shared skills used by larger workflows: `$planning`, `$crossworking`, `$teamwork-preview`, `$create-mr`, `$grill-me`, and `$learn`.

Restart Codex or open a new thread from the backend project after copying.

## Use As A Plugin

The repo-local marketplace is at `.agents/plugins/marketplace.json` and points to `plugins/codex-unity-agent-kit`.

Install the marketplace in Codex only if the app does not discover it automatically:

```powershell
codex plugin marketplace add "<path-to-this-kit>"
```

## Use As A Global Profile

Copy global defaults to your Codex home:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-global-profile.ps1
```

To also install the kit skills globally:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-global-profile.ps1 -InstallSkills
```

For the VSCode Codex extension when it runs Codex through WSL, install the same skills into the WSL Codex home:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-global-profile.ps1 -InstallWslSkills
```

Use `-Force` when you intentionally want to overwrite existing local skill copies, including an existing WSL-global `grill-me`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-global-profile.ps1 -InstallWslSkills -Force
```

This creates or updates a `unity-codex.config.toml` profile and copies reusable custom agents/rules. Optional skill installation copies the plugin skills into the selected Codex home. It does not copy credentials or app authorizations.

Globally installed skills include the Unity set plus:

- `$csharp-backend-implement` - implements ASP.NET and C# backend changes safely
- `$csharp-backend-review` - reviews backend diffs for correctness, security, data integrity, and validation gaps
- `$csharp-backend-validate` - selects and runs focused backend build, test, migration, and API validation

## What Does Not Transfer

Do not commit or copy these as part of this kit:

- Codex auth files and API keys
- OAuth tokens for GitHub, Gmail, Calendar, Figma, or other apps
- machine-specific Unity license state
- user-specific cloud environments
- hook trust state

Keep secrets in environment variables, OS keychain, or the normal Codex auth flow.
