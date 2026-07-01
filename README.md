# Codex Gamedev AI Agents

Portable Codex environment for Unity, C#, and ASP.NET game development. The kit is a source repository: project templates, 22 reusable skills, custom agents, rules, a local plugin marketplace, and manifest-based installers with a real update/uninstall story.

Platforms: OpenAI Codex and Anthropic Claude Code as equals, Windows-first with WSL support, plus a Cursor pointer. One canon, two rendered adapter layers - switching platforms loses nothing.

## Layout

```text
AGENTS.md                  kit-repo editing rules and validation
VERSION / CHANGELOG.md     semver + release notes
global/
  AGENTS.md                full engineering discipline (global profile)
  unity-codex.config.toml  Codex profile
  canon/                   SINGLE SOURCE OF TRUTH: roles.json, permissions.json, hooks.json
templates/
  unity-project/           AGENTS.md, ARCHITECTURE.md, CODE_STYLE.md, DEPENDENCIES.md,
                           CLAUDE.md, .cursor/, .codex/config.toml
  csharp-aspnet-project/   same shape for ASP.NET
plugins/
  codex-unity-agent-kit/   the plugin: 22 skills (single source of truth)
.agents/plugins/           local marketplace pointing at the plugin
scripts/                   installers (render platform adapters from canon), update/uninstall,
                           validate-kit, doctor, check-unity-meta
```

## Platform Independence

The kit treats platforms as render targets. All knowledge and all state live in neutral repository files; `.codex/` and `.claude/` are thin adapters rendered from `global/canon/` at install time and are never edited by hand:

| Concern | Canon | Codex render | Claude Code render |
| --- | --- | --- | --- |
| Instructions | `AGENTS.md` + contracts | native | via `CLAUDE.md` pointer |
| Skills | `plugins/.../skills/` | `.agents/skills/` | `.claude/skills/` mirror |
| Subagent roles | `canon/roles.json` | `.codex/agents/*.toml` | `.claude/agents/*.md` |
| Permissions | `canon/permissions.json` | `.codex/rules/default.rules` | `.claude/settings.json` |
| Hooks | `canon/hooks.json` | `.codex/hooks.json` | `.claude/settings.json` |
| Work state / memory | `.agents/plans/`, `.agents/learnings.md`, `docs/tickets/` | shared | shared |

Durable state never lives in platform storage, so switching Codex <-> Claude Code mid-task loses nothing: the next agent resumes from `.agents/plans/` and the repo contracts. `doctor.ps1` reports when the two layers drift; installers' `-Update` re-syncs both.

## Skills

Unity (`$unity-...`):

| Skill | Purpose |
| --- | --- |
| `unity-orient` | Map an unfamiliar Unity project: version, packages, asmdefs, tests, risks |
| `unity-implement` | Safe C# changes: serialization, lifecycle, asmdef boundaries |
| `unity-tests` | Bootstrap and author EditMode/PlayMode tests, humble-object refactors |
| `unity-debug` | Root-cause debugging: reproduce, localize, fix, guard; rendering triage |
| `unity-review` | Code-owner review of Unity diffs with severity/confidence classification |
| `unity-validate` | Cheapest sufficient validation: compile, EditMode, PlayMode, console |
| `unity-mcp` | Drive the Unity Editor through MCP: scenes, prefabs, tests, screenshots |
| `unity-merge` | Scene/prefab/asset merge conflicts: UnityYAMLMerge + manual YAML audit |
| `unity-build` | Player builds: batchmode, IL2CPP triage, Addressables ordering, CI |
| `unity-upgrade` | Staged editor/package upgrades with churn triage |
| `unity-profile` | Measure-first performance loop with numeric budgets |

C# backend (`$backend-...`):

| Skill | Purpose |
| --- | --- |
| `backend-orient` | Map an ASP.NET solution: SDK, projects, DI, endpoints, EF, config, tests |
| `backend-implement` | Safe backend changes: contracts, auth, persistence, migrations |
| `backend-debug` | Root-cause backend debugging with an ASP.NET failure triage table |
| `backend-review` | Service-owner review: security, data integrity, STRIDE pass |
| `backend-validate` | Targeted dotnet build/test, migration and contract checks |

Shared:

| Skill | Purpose |
| --- | --- |
| `planning` | Writes `.agents/plans/active_plan.md` + `task_list.md` before execution |
| `crossworking` | Delivery loop across agents: plan -> implement -> validate -> review -> PR |
| `arch-audit` | Module architecture audit -> dependency-ordered refactor backlog (SOLID/KISS/DRY lens) |
| `grill-me` | Relentless plan and design stress-testing before implementation |
| `create-mr` | Verify, commit, push, open the PR/MR; conventional commits |
| `learn` | Capture reusable lessons into AGENTS.md / learnings / skills |

## Install Into A Unity Project

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-unity-project-template.ps1 -TargetProject "<path-to-unity-project>"
```

Copies the template tree (`AGENTS.md`, `ARCHITECTURE.md`, `CODE_STYLE.md`, `DEPENDENCIES.md`, `CLAUDE.md`, `.cursor/rules/agents.mdc`, `.codex/config.toml`, `.agents/plans/.gitignore`), installs the 17 Unity+shared skills into both `.agents/skills/` (Codex) and `.claude/skills/` (Claude Code), renders both platform adapter layers from the canon (`.codex/` agents + rules + hooks; `.claude/` agents + settings), and places `.agents/scripts/check-unity-meta.ps1`. Writes `.agents/kit-manifest.json` (kit version + per-file hashes).

The target must contain `Assets/` and `ProjectSettings/` (override with `-AllowNonUnityTarget`). Restart Codex or open a new thread from the project after installing.

## Install Into A C# ASP.NET Project

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-csharp-aspnet-project-template.ps1 -TargetProject "<path-to-backend-project>"
```

Copies the backend template tree (including `ARCHITECTURE.md`, `CODE_STYLE.md`, and `DEPENDENCIES.md`), installs the 11 backend+shared skills into both platform skill locations, and renders both adapter layers from the canon. The target must contain a `.sln`, `.slnx`, or `.csproj` (override with `-AllowNonDotnetTarget`).

## Update, Preview, Uninstall

All installers share the same semantics:

- Plain run: copies new files, skips existing ones (warns how many were skipped).
- `-Update`: refreshes files you have not modified (hash matches the manifest), keeps locally modified files with a `KEEP` notice, and removes unmodified files the kit no longer ships.
- `-Force`: overwrites everything.
- `-WhatIf`: previews any of the above without writing.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-unity-project-template.ps1 -TargetProject "<path>" -Update
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\uninstall-project-template.ps1 -TargetProject "<path>"
```

Uninstall removes kit files whose hash still matches the manifest, keeps your modified copies (delete them too with `-Force`), and cleans up empty directories.

## Global Profile

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-global-profile.ps1
```

Installs into `$env:CODEX_HOME` (default `~/.codex`): the `unity-codex` profile (run Codex with `codex --profile unity-codex`), custom agents, and rules.

- `global/AGENTS.md` (the full 18-section engineering discipline) is installed as the inert `AGENTS.unity-template.md` by default. Activate it with `-InstallAgentsMd` - your existing `~/.codex/AGENTS.md` is backed up first.
- `-InstallSkills` copies all 22 skills to both `~/.agents/skills` (documented user-scope location) and `~/.codex/skills` (legacy compatibility).
- `-InstallClaude` installs the Claude Code global layer: all skills to `~/.claude/skills` and the agent roles to `~/.claude/agents`.
- `-InstallWslSkills` installs the full profile (skills, config, rendered agents and rules) into the WSL Codex home for the VS Code extension running Codex through WSL. Use `-WslCodexHome` to override detection.
- `-Update` / `-Force` / `-WhatIf` work as for project installs.

## Use As A Plugin

The repo-local marketplace at `.agents/plugins/marketplace.json` points to `plugins/codex-unity-agent-kit`. If Codex does not discover it automatically:

```powershell
codex plugin marketplace add "<path-to-this-kit>"
```

Also useful: `codex plugin marketplace list`, `... upgrade`, `... remove`.

## Utilities

```powershell
# Kit self-lint: frontmatter, openai.yaml, references, manifests, skill sets, drift, ASCII policy.
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-kit.ps1

# Environment health: git/gh/dotnet/UNITY_EDITOR/Unity Hub/YAMLMerge/kit version, with fix commands.
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\doctor.ps1 -TargetProject "<path>"

# Unity meta/GUID hygiene (installed into projects; also wired as a post-edit hook).
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\check-unity-meta.ps1 -ProjectRoot "<path>" -Full
```

## How Configuration Layers

1. `~/.codex/AGENTS.md` (global, optional) - full engineering discipline.
2. Project `AGENTS.md` (from the template) - Tech Stack manifest, module map, boundaries, skill routing - plus the project contracts `ARCHITECTURE.md`, `CODE_STYLE.md`, and `DEPENDENCIES.md`.
3. Rendered platform adapters: `.codex/` (config, agents, rules, hooks; trusted projects only) and `.claude/` (agents, settings, skills mirror).
4. `.agents/skills/` - project-scope skills; `.agents/learnings.md` - project lessons captured by `$learn`; `.agents/scripts/` - platform-neutral automation scripts.

Both platforms get a working post-edit hook that runs `.agents/scripts/check-unity-meta.ps1` after edits in Unity projects. Project hooks require trust review via `/hooks` in Codex. A commented `[mcp_servers.unity]` block in the Unity template's `.codex/config.toml` shows where to wire an MCP-for-Unity server for `$unity-mcp`; Claude Code reads MCP servers from `.mcp.json`.

## What Does Not Transfer

Never commit or copy as part of this kit: Codex auth files and API keys, OAuth tokens, machine-specific Unity license state, user-specific cloud environments, hook trust state. Keep secrets in environment variables, the OS keychain, or the normal Codex auth flow.

## Versioning

Semver in `VERSION`, releases described in `CHANGELOG.md`. Installed projects record their kit version in `.agents/kit-manifest.json`; `doctor.ps1` reports when a project is behind. MIT license.
