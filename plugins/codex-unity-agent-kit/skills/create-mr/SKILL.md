---
name: create-mr
description: Verify the complete task diff and perform only explicitly authorized commit, push, Pull Request, or Merge Request actions. Use when the user directly asks to commit, push, open a PR/MR, ship a change, or when game-pipeline reaches its Prepare delivery stage. Never infer remote-delivery permission from finishing implementation, crossworking, or validation.
---

# Create A Delivery Commit Or Pull Request

## Goal

Turn verified task-owned changes into exactly the delivery state the current request and repository policy authorize. Never ship unverified work, invent validation, widen the diff, hunk-stage reviewed files, or perform remote actions without direct permission.

## 1. Permission And Baseline Gate

Before staging, committing, pushing, or changing branches, require:

- Delivery trigger: a direct user request, or a recorded pipeline Prepare delivery stage. Push and PR/MR actions require fresh direct authorization.
- Recorded base branch/SHA, current task branch/workspace, source HEAD, initial staged/unstaged/untracked paths, and explicit task-owned paths.
- No pre-existing user change inside any task-owned path. Do not infer ownership at hunk level or use partial staging to work around overlap.
- A task branch/worktree suitable for delivery under repository policy. If the primary checkout was dirty before the task, deliver only from the clean task worktree.
- Repository delivery rules read and reconciled with the request.

If baseline, scope, or authorization is missing, reconstruct it from trustworthy records or stop. Do not guess in a dirty worktree.

## 2. Freeze And Verify The Complete Task

- Reuse `$crossworking`'s isolated candidate tree SHA, source HEAD, frozen task paths, and task-content fingerprint only when they still match the current task content. Without that evidence, materialize the same clean candidate using `$crossworking`'s candidate snapshot protocol before staging anything.
- Inspect the complete `base_sha..candidate_tree` diff, not only the working tree. Confirm `.agents/plans/task_list.md` items that belong to the task: implementation, simplification/no-op, candidate tree/fingerprint, final validation, review resolution, final scope, and delivery-boundary gates.
- Require validation and every required review to be green against that exact candidate tree or commit. Any unverified gap blocks delivery and must be reported, not waived.
- Scan the complete task diff for secrets and forbidden files. Never include credentials, tokens, keystores, Unity licenses, logs, `Library/`, `Temp/`, build output, or unrelated generated files.
- Verify commit identity before any commit or amend: `git config user.name`, `git config user.email`, `git var GIT_AUTHOR_IDENT`, and `git var GIT_COMMITTER_IDENT`. Stop on missing, `root`, `root@...`, `.localdomain`, or machine fallback identities.

## 3. Size And Stage

- Measure the complete `base_sha..candidate_tree` diff. Split mixed feature/refactor/format/asset churn before delivery when it cannot be reviewed as one logical change.
- Stage every task-owned path in full with `git add -A -- <paths>`. Never hunk-stage or partially stage a reviewed file.
- Run `git write-tree` after staging and require the index tree SHA to equal the reviewed candidate tree SHA before committing.
- Run `git diff --cached`, `git diff --check`, and the repository's metadata or generated-file checks before committing.

## 4. Commit Or Amend Only When Authorized

- Follow repository history policy over generic advice. If the repository or pipeline requires one squashed delivery commit, require the delivered commit's sole parent to equal the recorded base and `git rev-list --count base..HEAD` to equal `1`.
- If a previous unpushed provisional delivery commit exists after a failed post-commit build, amend it only when it is the sole task commit directly above the recorded base and repository policy permits amend. Never append a second delivery commit for the same unit.
- Use an English Conventional Commit subject. Never add AI attribution.
- Require `HEAD^{tree}` after committing to equal the reviewed candidate tree SHA, then recompute the task-content fingerprint from commit-tree blobs and confirm it matches.
- Stop after the authorized local commit unless the current request explicitly authorizes push or PR/MR creation.

## 5. Push Only When Explicitly Authorized

- Confirm remote, branch, upstream, and protected-branch policy immediately before pushing.
- Never force-push unless the user explicitly requests that destructive action and repository policy permits it.
- Report auth, protection, or remote failures exactly; do not work around them.

## 6. Open A Pull Request Only When Explicitly Authorized

Determine the target branch instead of guessing. Use an actual task title and evidence-only body:

```markdown
## Description
<What the change accomplishes and why.>

## Changes Made
- <Concrete task-owned change.>

## Verification
- [x] `<actual command>`: <actual result/evidence>.
- [ ] <Check not run>: <explicit reason>.
```

Never pre-check example commands, invent a result, or invent a PR URL.

## Stop Conditions

Stop when:

- Authorization is absent, ambiguous, or conflicts with repository policy.
- Base SHA, initial dirty state, task ownership, candidate tree, or task-content fingerprint cannot be established.
- Any task-owned path overlaps pre-existing user work.
- Final validation/review candidate tree or task-content fingerprint does not match the staged index tree and delivered commit tree.
- Identity, credentials, remote, branch, or target branch is invalid.
- Tests/build/compilation fail for an unexplained reason.

## Final Response

Report authorized actions actually completed, branch, local commit hash when created, candidate/commit tree SHA, task-content fingerprint, source HEAD, verification evidence, and skipped or blocked actions with reasons. Report a PR URL only when it exists.

## Reference

Read `references/git-conventions.md` for message format, branch naming, secret checks, and attribution rules. Repository delivery policy overrides generic commit-count guidance.
