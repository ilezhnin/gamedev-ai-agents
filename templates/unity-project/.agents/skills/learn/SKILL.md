---
name: learn
description: Reflect on recent development work to capture reusable rules, skill updates, or process corrections. Use when the user asks to learn from a completed task, remember a correction, update reusable Codex behavior, add a rule after a mistake or success, improve the Unity agent kit from experience, or decide whether a lesson belongs in AGENTS.md, rules, an existing skill, or a new skill.
---

# Learn

## Goal

Convert one concrete success, correction, bug, review finding, or repeated workflow into durable guidance without polluting the kit with one-off notes.

This skill does not blindly add memory. It decides whether a lesson is real, reusable, and safe to encode.

## Workflow

1. **Collect evidence**
   - Read the current request, final outcome, relevant diffs or files, validation results, review comments, plans, and user corrections.
   - If the lesson depends on a specific project, read that project's AGENTS/README/config before generalizing.
   - Do not infer a broad rule from a single ambiguous event.

2. **State the lesson**
   - Write the lesson as: "When <trigger/context>, do <behavior>, because <evidence/risk>."
   - Include the smallest useful scope: one project, Unity projects, C# implementation, all Codex work, or a specific skill.

3. **Choose destination**
   - `templates/unity-project/AGENTS.md`: Unity project instructions that should be copied into future Unity projects.
   - `global/AGENTS.md`: broad user preferences that should apply across projects.
   - `global/rules/*.rules`: terse recurring behavior rules for Codex profiles.
   - Existing skill `SKILL.md`: procedural improvements for an established workflow.
   - New skill: only when there is a repeatable task category with clear triggers and enough workflow detail.
   - No write: when the lesson is too local, speculative, already covered, or unsafe to preserve.

4. **Apply narrowly**
   - Make the smallest edit that captures the reusable behavior.
   - Prefer updating an existing skill or rule over creating another skill.
   - Keep wording imperative and testable.
   - Preserve ASCII unless the target file already uses another style.

5. **Validate**
   - Run `quick_validate.py` after changing any skill.
   - Run `validate_plugin.py` after changing plugin metadata.
   - If validation tooling needs temporary dependencies, keep them outside the repo and report that explicitly.

6. **Report**
   - State what was learned, where it was recorded, and what was deliberately not recorded.

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

## Destination Heuristics

- **Project-specific Unity workflow**: update `templates/unity-project/AGENTS.md`.
- **Reusable Unity/C# execution procedure**: update `$unity-implement-csharp`, `$unity-validate-project`, `$unity-review-changes`, `$planning`, `$crossworking`, or `$teamwork-preview`.
- **Plan critique behavior**: update `$grill-me`.
- **MR behavior**: update `$create-mr`.
- **Future learning behavior**: update `$learn`.
- **General user preference**: update `global/AGENTS.md` only when it should apply everywhere.

## Output Shape

Use this compact format in the final response:

```text
Learned: <the durable lesson>
Recorded in: <file path or "not recorded">
Why there: <scope reasoning>
Validation: <commands run or skipped reason>
Not recorded: <nearby ideas intentionally left out>
```

If the correct outcome is no write, say that directly and explain the evidence gap.
