---
name: learn
description: Reflect on recent development work to capture reusable rules, skill updates, or process corrections. Use when the user asks to learn from a completed task, remember a correction, add a rule after a mistake or success, update project instructions or the agent kit from experience, or decide whether a lesson belongs in AGENTS.md, learnings, a skill, or nowhere.
---

# Learn

## Goal

Convert one concrete success, correction, bug, review finding, or repeated workflow into durable guidance without polluting instructions with one-off notes.

This skill does not blindly add memory. It decides whether a lesson is real, reusable, and safe to encode.

## Workflow

1. **Collect evidence**
   - Read the current request, final outcome, relevant diffs or files, validation results, review comments, plans, and user corrections.
   - Do not infer a broad rule from a single ambiguous event.

2. **State the lesson**
   - Write the lesson as: "When <trigger/context>, do <behavior>, because <evidence/risk>."
   - Include the smallest useful scope: this project, Unity projects, C# backend work, or all work.

3. **Detect the context**
   - **Inside the kit repository** (the repo containing `plugins/codex-unity-agent-kit`): kit files are editable directly - see Kit Destinations.
   - **Inside a target project** (a Unity or ASP.NET repo where the kit was installed): edit project-local files only - see Project Destinations. Skill copies under `.agents/skills/` are refreshed by kit updates; note in the entry when a lesson should also be promoted into the kit source.

4. **Apply narrowly**
   - Make the smallest edit that captures the reusable behavior.
   - Prefer updating an existing rule, learnings entry, or skill over creating a new skill.
   - Keep wording imperative and testable.

5. **Validate**
   - Inside the kit repository, run `scripts/validate-kit.ps1` after changing skills or manifests.
   - In a target project, re-read the edited file to confirm it stays consistent with neighboring rules.

6. **Report**
   - State what was learned, where it was recorded, and what was deliberately not recorded.

## Project Destinations (inside a target project)

- `AGENTS.md`: durable project rules - conventions, commands, constraints every future session needs.
- `.agents/learnings.md`: dated, narrower lessons in the "When X, do Y, because Z" format; create the file when missing. Kit updates surface these entries as candidates to promote into the kit.
- Project skill copy under `.agents/skills/<skill>/SKILL.md`: only for procedure fixes needed immediately; flag for promotion so the kit source gets the same fix.

## Kit Destinations (inside the kit repository)

- `templates/unity-project/AGENTS.md` or `templates/csharp-aspnet-project/AGENTS.md`: rules every future project of that type should inherit.
- `global/AGENTS.md`: broad engineering discipline that applies across all projects.
- `global/rules/*.rules`: terse allow/prompt/forbid command rules for Codex profiles.
- Existing skill `SKILL.md` in `plugins/codex-unity-agent-kit/skills/`: procedural improvements - Unity lessons into `$unity-*` skills, backend lessons into `$backend-*` skills, planning/review/shipping lessons into `$planning`, `$crossworking`, `$grill-me`, `$create-mr`.
- New skill: only when there is a repeatable task category with clear triggers and enough workflow detail.
- No write: when the lesson is too local, speculative, already covered, or unsafe to preserve.

## Learning Filters

Record a lesson only when at least one is true:

- The user explicitly corrected agent behavior.
- The same issue is likely to recur across Unity/C# work.
- A review or test exposed a process gap.
- A successful workflow should become the default.
- The lesson prevents data loss, broken assets, invalid commits, or misleading validation claims.

Do not record:

- Secrets, tokens, auth state, license data, or machine-local cache paths.
- One-off facts that belong in the current task plan.
- Broad preferences from weak evidence.
- Rules that contradict higher-priority AGENTS or system instructions.
- Tool-specific behavior that may change unless it is verified from current docs or local behavior.

## Output Shape

Use this compact format in the final response:

```text
Learned: <the durable lesson>
Recorded in: <file path or "not recorded">
Why there: <scope reasoning>
Promotion: <"kit candidate" if a project lesson should reach the kit, else "none">
Not recorded: <nearby ideas intentionally left out>
```

If the correct outcome is no write, say that directly and explain the evidence gap.
