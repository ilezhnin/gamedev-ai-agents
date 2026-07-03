---
name: create-mr
description: Prepare, verify, commit, push, and open a GitHub Pull Request / Merge Request for completed workspace changes. Use when the user asks to create a PR/MR, commit and push finished work, ship a change, open a pull request, or when crossworking reaches its handoff step and the working tree holds verified changes.
---

# Create a Merge Request (Pull Request)

## Goal

Turn verified workspace changes into a clean branch, commit, push, and Pull Request. Never ship unverified work, never invent verification results, and never widen the diff beyond the task.

## 1. Verify the Current State

- **Branch:** `git branch --show-current`. If on `main`/`master` or another protected branch, create a task branch first and move uncommitted changes there.
- **Commit identity:** check `git config user.name`, `git config user.email`, `git var GIT_AUTHOR_IDENT`, and `git var GIT_COMMITTER_IDENT` before committing or amending. Stop if the identity is missing, `root`, `root@...`, `.localdomain`, or another auto-generated machine fallback.
- **Status and diff:** `git status`, then inspect `git diff` and `git diff --staged` before staging anything.
- **Plan contract:** if `.agents/plans/task_list.md` exists for this task, confirm its checklist items are done or explicitly waived; if `.agents/plans/active_plan.md` names verification commands, prefer those.
- **Validation:** run the project's checks. For Unity work use `$unity-validate` (compile/EditMode/PlayMode); for ASP.NET work use `$backend-validate` (`dotnet build`, targeted `dotnet test`, `dotnet format --verify-no-changes` when the repo uses it). Otherwise use commands documented by the repo or CI.
- **Secrets check:** never commit `.env`, `appsettings.*.json` with real values, user-secrets state, credentials, tokens, keystores, Unity license files, logs, `Library/`, build output, or unrelated generated files.

If verification cannot run, do not pretend it passed. State exactly what could not be verified and why.

## 2. Size the Change

- Up to ~100 changed lines: reviewable in one sitting - proceed.
- ~300 lines: acceptable only when it is one logical change - state why it belongs together.
- ~1000+ lines or mixed concerns (feature + refactor + formatting + asset churn): split before opening the PR. Strategies: stacked branches, by file group, shared code first, or vertical feature slices.
- Unity asset churn (scenes, prefabs, `.meta`) counts toward review load: call it out separately in the PR body and keep unrelated asset diffs out.

## 3. Commit the Changes

- Commit only what traces to the task. Use targeted staging (`git add <file>`, `git add -p`) when a file mixes concerns.
- Follow Conventional Commits (`feat:`, `fix:`, `chore:`, and the full type set in `references/git-conventions.md`). Imperative mood, no vague messages like "Fix bug" or "Phase 1".
- Each commit should leave the project compiling. Squash noisy checkpoint commits before pushing when the repo prefers a clean history.

## 4. Branch and Push

- Branch names: `feat/<task-name>`, `fix/<task-name>`, `chore/<task-name>`. Short, descriptive; never `changes`, `updates`, `work`, `misc`.
- Push with `git push -u origin <branch-name>`. Do not force-push unless the user explicitly asks and understands the risk.

## 5. Create the Pull Request

Determine the target branch when unclear: `gh repo view --json defaultBranchRef`. Then `gh pr create` with a title matching the primary commit message and this body:

```markdown
## Description
Concise overview of what this PR accomplishes and why.

## Changes Made
- Point 1 (e.g., Added `FormerlySerializedAs` to renamed field in `Assets/Scripts/Player/Health.cs`)
- Point 2 (e.g., Fixed ownership check in `src/Api/Endpoints/Inventory.cs`)

## Verification
- [x] `dotnet test tests/Api.Tests` passes.
- [x] Unity EditMode tests pass (TestResults/EditMode.xml).
- [ ] PlayMode tests not run: <reason>
```

Every unchecked verification item needs an explicit reason. Never invent a PR URL.

## Stop Conditions

Stop and ask before committing, pushing, or opening the PR when:

- The working tree contains unrelated changes and ownership is unclear.
- The current branch is protected, shared, or unsuitable.
- Tests, builds, or Unity compilation fail for reasons not clearly caused by this task.
- Credentials, remote access, or `gh` auth are missing - report the exact blocker.
- The PR target branch is ambiguous.

## Final Response

Report: PR URL, branch name, commit hash, verification commands that passed, and anything skipped or failed with reasons.

## Reference

Read `references/git-conventions.md` for the full commit type set, branch naming, atomic-commit rules, and breaking-change markers.
