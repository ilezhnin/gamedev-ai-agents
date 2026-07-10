---
name: game-pipeline
description: Run the game delivery pipeline over approved GDD milestones through define, plan, assets, one cross-agent execute loop, and policy-compliant delivery handoff. Use when the user asks to build a game or feature end to end, run or resume a pipeline stage or milestone, check pipeline status, prepare milestone assets, or execute an approved GDD. Simplification is a required late execute subgate before final validation and review.
---

# Game Pipeline

## Goal

Execute an approved game-design contract milestone by milestone without nesting duplicate orchestrators. The pipeline owns milestone state; `$crossworking` owns each milestone's single implementation-to-review execute loop.

## Entry Gate

Check before any stage:

- Select the GDD recorded in `.agents/plans/pipeline.md`. When starting a run, locate the intended `.agents/plans/*-gdd.md`; if several candidates exist and context does not identify one, ask instead of guessing.
- Compute and record the GDD content hash. Approval applies only to that exact hash. Any GDD edit invalidates approval until the user reviews the changed contract.
- Require evidence that the GDD was grilled and approved by the user. If missing, route to `$gdd` and stop.
- Default to stage mode. Milestone and auto modes run only when named in the current request.
- Record the starting branch, base SHA, source HEAD, task workspace, separate staged/unstaged/untracked baselines, task-owned paths, approved GDD hash, and chosen mode before a writer starts.

## Stages

| # | Stage | Skills | Lead role | Gate |
| --- | --- | --- | --- | --- |
| 1 | Define | `$gdd` | game-designer | Selected GDD hash grilled and approved by the user |
| 2 | Plan | `$planning`; `$grill-me` only for unresolved risk | planner | No blocking questions; plan hash recorded |
| 3 | Assets | `$asset-pipeline` when required | asset-scout, asset-creator, unity-asset-integrator | Approved assets/brief or explicit no-asset result |
| 4 | Execute | one `$crossworking` run | unity-worker, unity-test-runner, unity-reviewer | Post-simplification focused recheck, validation, and review/fix subgates green on one final task-content fingerprint; the earlier baseline is simplification entry evidence |
| 5 | Prepare delivery | `$create-mr` only for explicitly authorized commit/push/PR actions; `$unity-build` only for an explicitly requested player build | pr-submitter; devops only for the requested build | Authorized delivery uses the exact reviewed candidate; no unauthorized remote action |

`$simplify-change` is mandatory inside Execute after the focused baseline and before final validation/review. A recorded no-op passes when no safe evidence-backed simplification exists.
Every accepted review or validation fix re-enters that simplification gate, permits a new no-op, and establishes the provisional fingerprint that the rematerialized candidate must match.

During Assets, the parent owns the asset brief and schedules scout, creator, and integrator sequentially for persistent writes as required by `$asset-pipeline`; the listed roles are not concurrent writers.

The producer updates state and enforces gates but cannot change approved scope. Scope cuts are proposals until the user approves a revised GDD hash.

## Execute Subgates

For every milestone, `$crossworking` reports distinct evidence for:

1. Implementation complete on task-owned paths.
2. Focused behavior/compile entry baseline for simplification.
3. Simplification result, production-complexity balance, and focused recheck on the resulting provisional fingerprint.
4. Final Unity validation, exact editor version, source HEAD, isolated candidate tree SHA, and task-content fingerprint.
5. Independent review plus resolved blocker IDs.

Do not invoke another Test or Review workflow after a successful Execute gate; those checks already belong to the one crossworking loop. Run the pipeline's single Prepare delivery stage only when the selected mode includes it.

Prepare delivery first verifies the requested delivery action is authorized by the current user request and repository policy. When a commit is authorized, the commit tree must equal the reviewed candidate. If a player build was explicitly requested, `$unity-build` builds that exact reviewed commit from a separate clean detached linked worktree with the exact-editor and protected-content guard from `$unity-validate`. It may not make any repository change at this stage. Missing build code or any required source, asset, package, or setting change returns the task to Execute for one-writer implementation, a new candidate tree, validation, and review.

If such a return happens after an authorized local delivery commit was created but not pushed, mark that commit provisional. On the next green Prepare delivery, `$create-mr` may amend that same sole task commit only when repository policy permits amend and the branch still has the exact single-task-commit shape; it must not append a second delivery commit or retain the failed tree. Then rerun the explicitly requested player build from a fresh detached linked worktree. Prepare delivery is not green until that build and its mutation guard pass.

## State

Use `.agents/plans/pipeline.md` as the resumable run state. Follow `references/pipeline-state.md`. Chat memory, a commit, or a screenshot alone is never stage evidence.

## Modes

- **Stage:** run one current stage, record evidence, report, and stop.
- **Milestone:** run Plan, Assets, and Execute for one named milestone. Stop with a validated/reviewed milestone unless the current request explicitly names it as a delivery unit.
- **Auto:** loop Plan, Assets, and Execute until the approved MVP checklist is complete, then run Prepare delivery once for the whole MVP.
- **Explicit delivery:** run Prepare delivery for the named validated unit. `$create-mr` performs only the commit, push, or PR/MR actions explicitly authorized in the current request and compatible with repository policy.

A separately delivered milestone is terminal for that task branch. Before another milestone can enter Plan/Execute, the user must integrate or otherwise ratify the delivered state, record the resulting branch/SHA as a fresh base, and start a new task branch/worktree. Never stack another milestone delivery on the delivered branch or silently rewrite/rebase it.

## Stop Conditions

Stop, record the blocker, and surface it when:

- The selected GDD is missing, unapproved, or its hash differs from the approved hash.
- The plan has blocking questions or implementation would exceed approved scope.
- Any task-owned path overlaps pre-existing staged, unstaged, or untracked work; do not infer ownership at hunk level.
- A non-Execute stage fails twice for the same cause. Execute retries and stop limits belong only to `$crossworking`; the pipeline accepts its green or blocked result without a second counter.
- Validation fails for an unexplained or out-of-scope reason.
- A structural decision conflicts with project contracts.
- Required assets, provenance, packages, credentials, or user decisions are missing.
- Any `$crossworking` stop condition fires.

## Rules

- Never skip a gate because a change looks small.
- Every milestone ends playable: real compile/console evidence, clean relevant logs, and reachable acceptance behavior.
- Store stage-specific evidence. A screenshot cannot prove compilation or automated tests; a commit cannot prove review.
- Later task-content edits invalidate validation/review evidence until rerun on the new task-content fingerprint; commits that preserve the fingerprint do not.
- Auto mode never invents scope. Put new ideas into Later; require user approval for MVP cuts or additions.
- Do not use checkpoint commits as gate evidence.
- Invoke `$create-mr` in Prepare delivery only for the exact delivery action authorized by the current request and compatible repository policy. Push and PR/MR actions require a fresh direct user request.
- After a separately delivered milestone, stop the pipeline until the user provides or confirms the new integrated base; continuation uses a fresh task branch/worktree and a new baseline record.

## Exit Criteria

Report the selected GDD path/hash, milestone/stage, exact gate evidence, source HEAD, candidate tree SHA, task-content fingerprint, updated state path, and next allowed action or blocker. Mention a commit, build, or PR only when it actually exists.
