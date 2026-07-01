# Gamedev AI Agents

Portable Codex agent kit for Unity, C#, and ASP.NET game-development projects.

The kit includes project templates, reusable Codex skills, custom agents, validation rules, installer scripts, and a local Codex plugin package. It is meant to help Codex orient in a project, plan work, implement changes, review diffs, validate builds/tests, and prepare GitHub handoffs.

## What's Included

```text
global/                         Global Codex profile, agents, and rules
templates/unity-project/         Unity project Codex template
templates/csharp-aspnet-project/ ASP.NET project Codex template
plugins/codex-unity-agent-kit/   Local Codex plugin with bundled skills
.agents/plugins/                 Repo-local plugin marketplace entry
scripts/                         Installer scripts
```

## Install In A Unity Project

Run from this repository:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-unity-project-template.ps1 -TargetProject "<path-to-unity-project>"
```

This copies the Unity project template into the target project:

- `AGENTS.md`
- `.codex/config.toml`
- `.codex/agents/*.toml`
- `.codex/rules/*.rules`
- `.agents/skills/*`

Restart Codex or open a new Codex thread from the Unity project after installation.

## Install In A C# ASP.NET Project

Run from this repository:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-csharp-aspnet-project-template.ps1 -TargetProject "<path-to-backend-project>"
```

This copies the ASP.NET project template into the target project:

- `AGENTS.md`
- `.codex/config.toml`
- `.codex/agents/*.toml`
- `.codex/rules/*.rules`
- selected `.agents/skills/*`

Restart Codex or open a new Codex thread from the backend project after installation.

## Use As A Codex Plugin

The repo-local marketplace is at `.agents/plugins/marketplace.json` and points to `plugins/codex-unity-agent-kit`.

If Codex does not discover the marketplace automatically, add it manually:

```powershell
codex plugin marketplace add "<path-to-this-repository>"
```

## Install As A Global Profile

Copy global defaults to your Codex home:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-global-profile.ps1
```

Install the kit skills globally as well:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-global-profile.ps1 -InstallSkills
```

For the VS Code Codex extension when it runs Codex through WSL, install the same skills into the WSL Codex home:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-global-profile.ps1 -InstallWslSkills
```

Use `-Force` when you want to overwrite existing local skill copies:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-global-profile.ps1 -InstallSkills -Force
```

## Skills

Unity-focused skills:

- `$unity-orient-project`
- `$unity-implement-csharp`
- `$unity-review-changes`
- `$unity-validate-project`
- `$unity-debug-and-recover`
- `$unity-use-editor-mcp`

C# / ASP.NET skills:

- `$csharp-backend-implement`
- `$csharp-backend-review`
- `$csharp-backend-validate`

Shared workflow skills:

- `$planning`
- `$crossworking`
- `$teamwork-preview`
- `$create-mr`
- `$grill-me`
- `$learn`

## Typical Workflow

1. Install the template or plugin.
2. Open Codex from the target project.
3. Ask Codex to use the relevant skill, for example `$unity-orient-project`, `$planning`, or `$csharp-backend-validate`.
4. Run validation before handing off a change.
