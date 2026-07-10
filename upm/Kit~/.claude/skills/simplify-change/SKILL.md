---
name: simplify-change
description: Perform a behavior-preserving simplification pass over a completed change by removing proven duplication, speculative abstractions or configuration, dead wrappers, unnecessary indirection, and accidental complexity. Use after implementation and a focused baseline check but before final validation and review, when the user asks to simplify, clean up, deduplicate, trim, or de-overengineer code, or when crossworking or game-pipeline reaches its simplification gate. Do not use for broad architecture redesigns, behavior changes, or read-only audits.
---

# Simplify Change

## Goal

Make the completed task smaller and easier to understand without changing observable behavior. Prefer deletion, directness, and reuse of the existing owner. A justified no-op is a successful outcome.

## Entry Gate

Proceed only when all are true:

- The task scope, base revision, task-owned paths, and pre-existing dirty paths are known.
- Implementation is complete enough to inspect as one coherent diff.
- Behavior-affecting candidates have a focused test, manual/editor observation, or equivalent behavioral baseline. A compile-only baseline permits only mechanically provable compile-time cleanup; otherwise record a no-op.
- The relevant call sites, tests, serialized usages, and project architecture/style contracts are available.

If there is no task diff, use `$arch-audit` for a refactor backlog or `$codebase-audit` for a read-only risk report. If behavior is broken, use the stack debug skill before simplifying.

## Workflow

1. **Inspect evidence**
   - Read every task-owned state from the recorded base through source HEAD plus staged, unstaged, untracked, renamed, mode-changed, and deleted paths. Confirm no task-owned path contains pre-existing user edits; never infer ownership at hunk level.
   - Inspect direct consumers and tests before proposing deletion or consolidation.
   - Separate production code from tests, documentation, generated files, and assets.

2. **Select only proven candidates**
   - Remove dead code, stale compatibility wrappers with no consumers, redundant branches, duplicate state, and duplicate policy that must evolve together.
   - Collapse a one-use interface, facade, factory, helper, or configuration layer only when it protects no real boundary, invariant, test seam, or platform variation.
   - Reuse the existing domain owner instead of creating a parallel manager, service, system, utility, registry, or adapter chain.
   - Keep a candidate when deletion would hide intent, couple unrelated policies, or weaken a real boundary.

3. **Apply one narrow pass**
   - Use one stack-specialized worker and one writer at a time.
   - Stay inside task-touched paths unless the user explicitly approved a wider cleanup.
   - Preserve public APIs, serialized fields, asset GUIDs, save/network schemas, deterministic ordering, lifecycle behavior, error semantics, and authored content.
   - Do not add packages, settings, generic frameworks, speculative extension points, fallback behavior, mass formatting, or unrelated renames.

4. **Check the complexity budget**
   - Require production code to stay neutral or shrink in lines and concepts. Explain any unavoidable production-code growth and reject it when the same behavior can stay simpler.
   - Never delete or weaken tests, diagnostics, validation, comments that explain invariants, or living documentation to improve the count.
   - Count removed owners, branches, abstractions, and duplicated rules as stronger evidence than line count alone.

5. **Recheck the changed tree**
   - Re-run the focused baseline checks after every accepted simplification batch.
   - Record the resulting provisional source-workspace task-content fingerprint with the canonical path/mode/raw-byte algorithm, plus exact commands/results. The caller must confirm it matches the later isolated candidate fingerprint; later task-content edits invalidate this focused evidence.
   - Do not consume the caller's final validation or independent-review gates. `$crossworking`/`$game-pipeline` run one initial downstream gate set after this skill; accepted later edits rerun only the invalidated gates.

6. **Hand off downstream gates**
   - Return the final diff scope, provisional source-workspace fingerprint, retained-risk notes, and focused-check evidence to the parent.
   - The parent runs final repository validation and gives a read-only reviewer the acceptance criteria and complete final diff, not this skill's candidate list or expected verdict.
   - If the final reviewer finds behavior drift or false deduplication, apply the accepted fix through one worker and invalidate affected evidence.

## Cross-Agent Contract

- Parent: owns scope, candidate acceptance, downstream validation/review, and final synthesis.
- Worker (`unity-worker` or `backend-worker`): performs the single simplification pass and reruns the focused baseline check.
- Downstream validator and reviewer (`unity-test-runner`/`backend-test-runner`, `unity-reviewer`/`backend-reviewer`): run the initial gate set after this skill returns; this skill does not spawn duplicate gates, while accepted later edits trigger the caller's normal rerun.

Do not add a permanent simplifier role or fan out overlapping cleanup writers. Parallelize only independent read-only candidate discovery when the diff is large enough to justify it.

## Stop Conditions

Stop and report rather than simplify when:

- A candidate changes product behavior, public or serialized contracts, save/network data, asset identity, or architecture ownership.
- Required call sites or validation are unavailable and the deletion is risky.
- The candidate can affect runtime behavior but only compile evidence is available.
- The worktree baseline cannot distinguish task changes from unrelated user changes.
- The pass grows abstractions, configuration, or production code without a necessary compatibility reason.
- Remaining suggestions are taste-only or move complexity without removing it.

## Final Report

Report:

- Scope and baseline used.
- What was deleted, collapsed, or deliberately retained and why.
- Production-code balance and concepts removed.
- Focused-check commands/results and the resulting provisional source-workspace fingerprint, pending candidate match.
- Required downstream validation/review and remaining risks.
- `No safe simplifications found` when the correct result is a no-op.
