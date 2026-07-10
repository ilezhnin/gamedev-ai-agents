---
name: crossworking
description: Coordinate a planned Unity or C#/ASP.NET task across agents through workspace baselining, implementation, focused baseline validation, behavior-preserving simplification, final validation, independent review, and a verified local handoff without committing or pushing. Use when the user asks for crossworking, teamwork, multi-agent execution, parallel workers/reviewers/testers, running an existing `.agents/plans/active_plan.md`, or executing one game-pipeline milestone. Use $codebase-audit instead for a read-only project or module audit.
---

# Crossworking

## Goal

Produce one final task diff that is implemented, simplified, validated, and independently reviewed. The parent owns decisions and scope; one writer edits; specialized agents inspect and verify. Stop at a verified local handoff; delivery belongs to the caller or a separately authorized workflow.

## Required State

Read `.agents/plans/active_plan.md` and `.agents/plans/task_list.md`. Before any writer starts, record in the plan or scoped handoff:

- Starting branch and base SHA.
- Initial staged, unstaged, and untracked paths.
- Task-owned paths and known pre-existing user changes.
- Acceptance criteria and exact baseline/final checks.
- Delivery boundary: verified handoff only. Record any separately authorized follow-up action for the caller, but do not perform it inside crossworking.

If the plan is missing, stale, or has unresolved blocking questions, use `$planning` first. A task-owned path may not already contain user changes, even if hunks look separable; narrow the scope or stop before writing. Require the local task branch to start at the recorded base without unrelated commits. When the primary checkout is dirty, create that task branch in a separate worktree and never switch or carry the mixed primary tree into the task workspace.

## Coordination Rules

- Keep one parent responsible for scope, synthesis, and user communication.
- Use the smallest useful team. Add agents only for independent work with a clear return artifact.
- Use one writer in a working tree. Parallelize implementation only in isolated worktrees with disjoint paths.
- Give reviewers the complete task diff and repository state, not the parent's conclusions or candidate list.
- Enforce read-only reviewers mechanically. For Codex, verify the effective child sandbox after parent live overrides. If it is not read-only, do not spawn it in the shared workspace: use a separately launched read-only session or sandbox that exposes only frozen read-only review inputs and cannot reach the writable task workspace, Git common directory/refs, or evidence store; otherwise stop. An OS-protected candidate worktree alone is insufficient because its shared Git metadata and sibling workspaces may still be writable. For Claude team mode, explicitly load `$unity-review` or `$backend-review` through the role's allowed `Skill` tool while Edit, Write, Bash, and MCP remain unavailable.
- Bind final validation and review to an isolated candidate tree SHA plus the commit-independent task-content fingerprint; record source HEAD separately. Any later candidate-content edit invalidates that evidence.
- Compute the provisional fingerprint from final filesystem bytes in the clean path-exclusive task workspace; compute canonical fingerprints from candidate/index/commit tree blobs using `$game-pipeline`'s pipeline-state reference. Never use a fingerprint as ownership or hunk-staging evidence.
- Keep `task_list.md` as the execution ledger, including implementation, simplification, validation, review resolution, final scope, and delivery state.
- Do not create checkpoint commits merely to mark a phase done. Repository delivery rules override generic workflow defaults.
- Do not invoke `$create-mr`, push, or open a PR/MR unless the current user request explicitly authorizes those actions and repository policy allows them.

## Team Sizing

- **Small:** parent, one worker, one validator, and one independent reviewer; run roles sequentially when the platform's concurrency limit is lower.
- **Medium:** optional context-builder, one worker, one validator, one independent reviewer.
- **Large/high-risk:** planner, scoped context-builder, one writer at a time, validator, distinct reviewers for genuinely separate risk lanes, then one fixer.
- Add asset roles only when the task needs sourced, generated, or imported assets. Add architect/oracle only for real boundary decisions or long-task drift.

## Execute Loop

1. **Workspace gate**
   - Verify the task branch, base SHA, dirty baseline, task-owned paths, and delivery boundary before editing.
   - Require a clean initial task workspace and index. If the primary checkout was dirty, confirm the task branch lives in a separate worktree and the primary checkout stayed untouched.
   - For Unity work, orient with `$unity-orient` only when the area or relevant boundaries are unfamiliar.
   - For C# backend work, orient with `$backend-orient` only when the service area, API boundary, migrations, or validation path is unfamiliar.
   - Use `$grill-me` before implementation when product, lifecycle, persistence, migration, or architecture decisions remain unclear.

2. **Context handoff**
   - For same-session delegation, send a bounded direct prompt with goal, paths, constraints, and validation; do not create duplicate files.
   - When work must cross sessions or platforms, use the `context-builder` role and write `.agents/plans/context-<work-item>.md`.
   - Create `meta-prompt-<work-item>.md` only for a manual/cross-platform handoff; it links to the context file and adds only the next-agent goal.
   - Use the `researcher` role for current external facts and `$asset-pipeline` for asset work.

3. **Implementation**
   - Assign worker-sized tasks from the plan to the stack worker: `unity-worker` with `$unity-implement`/`$unity-mcp` as needed, or `backend-worker` with `$backend-implement`.
   - Require: changes made, deliberate non-changes, checks run, failures/skips, and open questions.

4. **Focused baseline**
   - Run the cheapest check that demonstrates the implementation's intended behavior before cleanup. This is simplification entry evidence, not final-fingerprint evidence when the cleanup changes content.
   - Do not claim Unity compilation without a real Unity compile or console check. Do not claim backend validation without the exact `dotnet` or service command that ran.

5. **Simplification**
   - Run `$simplify-change` on the completed task diff.
   - Accept a no-op when no evidence-backed simplification exists.
   - Keep the pass task-scoped and neutral or negative in production complexity.
   - Require the skill to rerun the focused check after every accepted simplification batch. That post-simplification result is the focused evidence bound to its provisional source-workspace fingerprint; treat the fingerprint as provisional until candidate materialization.

6. **Isolated candidate snapshot**
   - Follow `references/candidate-snapshot.md`: materialize a detached worktree from the base plus complete task-owned files only, stage them inside that candidate, and record its `git write-tree` SHA and task-content fingerprint without committing.
   - Require the candidate fingerprint to equal simplification's provisional source-workspace fingerprint; a mismatch means the copy/scope changed and blocks downstream evidence.
   - Do not reuse delivery-grade validation from the shared dirty checkout. Preserve any candidate with unexpected mutations.

7. **Final validation**
   - Use the stack validation skill and test-runner against the isolated candidate for exact plan checks: `$unity-validate`/`unity-test-runner` for Unity, or `$backend-validate`/`backend-test-runner` for C# backend.
   - Record commands, results, candidate tree SHA, task-content fingerprint, source HEAD, logs/evidence, and unverified gaps. For Unity, also record the exact editor version.

8. **Independent review**
   - The parent prepares the complete read-only review packet required by the stack review skill, including base SHA, source HEAD, candidate tree SHA, frozen task paths, complete `base..candidate-tree` diff, and task-content fingerprint.
   - Assign `unity-reviewer` with `$unity-review` or `backend-reviewer` with `$backend-review` explicitly named, the packet path, and fresh repository state. Do not rely only on role skill preloads, because some team/teammate modes do not apply them.
   - Use one reviewer by default. Add parallel reviewers only for distinct high-risk lanes such as serialization/lifecycle, security/data loss, or deterministic networking.
   - Classify findings into blockers, accepted fixes, deferred improvements, and rejected feedback.

9. **Fix loop**
   - Apply accepted fixes through one worker.
   - After every accepted content edit, re-run `$simplify-change` even when the result is a recorded no-op, then recompute its provisional source-workspace fingerprint.
   - Re-materialize the candidate and require its canonical fingerprint to equal the new provisional fingerprint, then re-run affected validation and independent review. Stop after three rounds or earlier when no blockers remain.

10. **Verified handoff**
   - Verify the candidate tree/fingerprint, complete task diff from the recorded base, final task paths, validation, review resolution, and unrelated changes.
   - Record whether the diff is ready for the caller's Prepare delivery stage or a separately requested `$create-mr` run.
   - Do not commit, amend, push, open a PR/MR, or invoke another delivery workflow inside crossworking.

## Stop Conditions

Stop and ask or report a blocker when:

- Required product, dependency, schema, asset, save, network, or architecture decisions are not approved.
- Any task-owned path contains pre-existing user changes, or the task branch contains unrelated commits after the base.
- Multiple writers would share a working tree.
- Baseline or final validation fails for an unrelated or unexplained reason.
- Simplification would alter behavior or a protected contract.
- Review finds a blocker requiring user approval.
- Final task scope cannot be separated from unrelated work.

## Final Report

Report:

- Plan, base SHA, task-owned paths, and pre-existing changes.
- Agents/phases actually run.
- Implementation and simplification result, including a justified no-op.
- Final validation evidence, candidate tree SHA, task-content fingerprint, and source HEAD.
- Review findings fixed, deferred, or remaining.
- Verified handoff state and the next allowed delivery action. State explicitly that crossworking created no commit or PR.

## Reference

Read `references/candidate-snapshot.md` before final validation/review. Read `references/context-handoff.md` only when a durable cross-session or cross-platform handoff is required.
