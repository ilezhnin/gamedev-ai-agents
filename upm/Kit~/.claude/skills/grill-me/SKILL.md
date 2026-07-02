---
name: grill-me
description: Relentlessly stress-test a user's plan, design, architecture, feature idea, game mechanic, Unity/C# implementation strategy, migration, or technical decision through focused questions until assumptions, tradeoffs, scope, lifecycle, risks, and next steps are clear. Use when the user says "grill me", "stress-test this", "roast my plan", "interrogate this design", asks for rigorous critique in any language, or wants to be questioned before planning or implementation.
---

# Grill Me

## Goal

Interrogate the plan or design until shared understanding is reached. Do not implement, draft a final plan, or agree prematurely while important decision branches remain open.

For game projects, stress-test both product intent and implementation reality: the player-facing value, production scope, owning systems, Unity lifecycle, content pipeline, save/network compatibility, determinism, performance, and validation path.

## Preflight Context

Before asking the first decision question, collect baseline context from sources already available to the agent.

- Use the current thread, loaded instructions, project `AGENTS.md`, `.codex`, `.agents`, README files, architecture/style/dependency docs, package manifests, config files, nearby module docs, and existing code.
- If working in a codebase, search before asking. Prefer `rg` and targeted file reads.
- Do not ask for project facts that are already visible in docs or code: target platform, Unity version, stack, package choices, folder ownership, style rules, testing commands, real project path, or hard constraints.
- Respect user-known project paths and local instructions when present. For example, do not confuse real Unity projects with prototype folders if `AGENTS.md` distinguishes them.
- If a baseline fact is missing and materially changes the questioning path, ask a short preflight question before the decision tree.
- If several baseline facts are missing, ask at most 3 short preflight questions together. This exception is only for baseline context, not for design decisions.
- If a missing baseline fact appears mid-grill and changes earlier assumptions, stop, name the missed context, update the model, and continue from the corrected branch.

Useful baseline facts:

- Target platform and runtime environment: desktop, mobile, console, web, editor tooling, live service, local prototype.
- Scale and frequency: active objects, entities, UI rows, content files, ticks, saves, network messages, asset size, memory budget.
- Existing implementation, rejected prior attempts, and nearby owning modules.
- Dependencies and packages actually present in the project.
- Non-negotiable constraints: public APIs, content formats, deadlines, performance budgets, save/network compatibility, editor workflows, or design-system rules.

## Question Loop

- Ask one decision question at a time.
- If a structured user-input tool is available, prefer it for decision questions with 2-3 options. Put the recommended option first and mark it as recommended in the label.
- If no structured user-input tool is available, ask one concise plain-chat question and include the recommended answer plus alternatives.
- Make each next question depend on the previous answer. Drop branches that no longer matter.
- If the answer can be found in code or docs, go find it instead of asking the user.
- Keep preambles to 1-2 short lines when context is needed.
- Do not ask menu questions without a recommendation. If no recommendation is possible, inspect context or state the unknown that blocks the recommendation.
- Do not answer for the user's free-form "Other" path. Treat it as an escape hatch for information you did not model.
- Track an honest 0-100% understanding confidence. When it is below ~70%, say so in one line with the reason before the next question.
- Treat "whatever you think is best", "sounds good", and silence as non-answers, not agreement. Re-ask as a concrete choice between named options.

Structured decision question shape:

```yaml
question: "Specific decision question ending with a question mark?"
header: "ShortTag"
multiSelect: false
options:
  - label: "Recommended option (Recommended)"
    description: "Why this is the default: 1-2 concrete sentences."
  - label: "Alternative option"
    description: "When this is better and what tradeoff it creates."
```

## Game And Unity Coverage

For Unity/C# game work, keep grilling until the relevant branches below are closed.

- Player value: what changes for the player, why it is worth building, what tension or payoff it adds, and how it avoids busywork.
- Game loop fit: how the feature affects progression, rewards, economy, difficulty, pacing, idle/offline behavior, retention, and failure states.
- Scope: what is in, what is out, what is deferred, what is prototype-only, and what must not be polished yet.
- Ownership: which module, system, scene, prefab, ScriptableObject, service, file, or content contract owns the behavior.
- API shape: names, inputs, outputs, typed errors/results, config, serialization, public surface, migration, and compatibility wrappers.
- Unity lifecycle: creation, `Awake`/`OnEnable`/initialization, update/tick path, teardown, reload, domain reload, scene load, prefab wiring, editor-only boundaries.
- Data and content: source of truth, authoring path, validation, defaults, missing reference behavior, asset migration, content versioning, and localization if relevant.
- Determinism and multiplayer: tick-driven behavior, seeded randomness, stable ordering, replay/rollback/network payloads, and avoiding render-frame or Unity side-effect authority.
- Persistence: save schema, migration, backward compatibility, default values, offline behavior, and broken-save recovery.
- Performance: hot paths, allocations, object counts, UI virtualization, asset loading, batching, pooling ownership, memory budget, and platform-specific constraints.
- Failure behavior: fail loud for broken required references, invalid content, missing catalog entries, impossible states, and external operation failures. Do not hide root causes behind silent fallback.
- Integration: UI/view, animation, audio, input, physics, jobs/async, editor tooling, diagnostics, tests, and user-facing debug visibility.
- Verification: Unity refresh/compile, console errors, focused EditMode/PlayMode tests, source scans, `git diff --check`, manual scene/prefab checks, or documented blocker.

## Challenge Rules

- Do not flatter or agree for momentum. If a user answer conflicts with code, docs, constraints, or itself, raise the conflict with concrete evidence.
- Challenge only real problems. A preference is not a problem unless it violates a requirement or creates a clear risk.
- If the user rejects a recommendation, update the working model and do not keep offering the same recommendation.
- If a decision depends on current external facts, package behavior, or unstable API details, verify them with the appropriate current source before recommending.
- If a fallback, shortcut, runtime repair, broad manager, global scene search, or workaround hides the root cause, call that out explicitly.
- Do not invent dependencies, stacks, platforms, or architectural cleanup. Use what the project already has unless the user explicitly chooses a change.

## Stop Conditions

Continue until the important branches are closed or the user explicitly asks to stop, plan, summarize, or implement - in any language.

Understanding test: when you can predict the user's answers to your next three questions, the grill has converged - offer to summarize instead of continuing.

Do not stop only because the next question is uncomfortable. The skill exists to expose hidden assumptions before code is written.

## Output When Asked To Stop

When the user asks for a plan, summary, or implementation direction, produce a concise decision record:

- Confirmed decisions.
- Out of scope: what is explicitly NOT being built. Half of misalignment is silent disagreement about scope - this line is mandatory.
- Open questions, if any.
- Rejected alternatives and why.
- Risks and mitigations.
- Implementation order or next actions.
- Verification needed.
