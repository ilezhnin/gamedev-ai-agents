# Context Handoff Format

The context-builder role must produce two artifacts in `.agents/plans/` so the next agent (planner, worker, reviewer, asset role - on any platform) starts working without re-researching the same ground.

## `context.md`

- Relevant files with line ranges and the key code fragments, each with one line of why it matters.
- Important patterns the project already uses (validators, services, prefab wiring, test styles).
- Asset constraints when relevant: existing art roots, placeholder strategy, license/provenance notes, import settings, and `.agents/plans/asset-brief.md`.
- Dependencies, constraints, and implementation risks confirmed from sources - not guesses.
- Keep it condensed and informative: no raw dumps, but do not drop load-bearing files for brevity.

## `meta-prompt.md`

A compact contract for the next agent:

```markdown
# Goal
The concrete result the next agent must produce.

# Context / Evidence
Relevant files, prior decisions, constraints, and facts confirmed from sources.

# Success Criteria
What must be true for the task to count as done.

# Hard Constraints
Only real invariants (e.g. no code changes for review tasks, escalate when a decision is missing).

# Suggested Approach
Short direction, not a step-by-step script - unless a step is a genuine requirement.

# Validation
Targeted checks to run, or the best available verification when full validation is impossible.

# Stop / Escalation Rules
When to ask, when evidence is sufficient, when to stop researching and hand off.

# Resolved Questions and Assumptions
Conclusions already reached and assumptions accepted.
```

## Rules

- Read everything needed for real understanding before writing: imports, call sites, tests, fixtures, config, docs. Not just the first match.
- If the task references a URL, issue, PR, plan, or design doc - study it before the handoff.
- Delegate external research (APIs, library behavior, current best practices) to the `researcher` role when local sources are insufficient.
- Delegate asset sourcing, generation, or Unity import details to `$asset-pipeline`; link its asset brief instead of duplicating it.
- State information gaps explicitly instead of creating false confidence.
