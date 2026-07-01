---
name: create-mr
description: Prepare, verify, commit, push, and open a GitHub Pull Request / Merge Request for completed workspace changes.
---

# Create a Merge Request (Pull Request)

**System Goal:** You are tasked with preparing, committing, pushing, and opening a Pull Request for the changes made in the current workspace.

Follow these strict guidelines when executing this task.

## 1. Verify the Current State

Before creating the PR, verify the integrity of the codebase and the working tree.

- **Branch:** Confirm the current branch with `git branch --show-current`.
- **Git Status:** Run `git status` and identify every changed, staged, untracked, or deleted file.
- **Diff Review:** Inspect `git diff` and `git diff --staged` before staging or committing anything.
- **Linting:** Ensure there are no linting errors, for example `npm run lint` in `gui-node`.
- **Tests:** Ensure tests pass, for example `npm run test` in `gui-node` or `go test ./...` in `exec-node`.
- **Build / Typecheck:** Run the project's relevant build or typecheck command when available.
- **Secrets Check:** Do not commit `.env`, credentials, API keys, tokens, private keys, logs, local config, build output, or unrelated generated files.

If verification cannot be run, do not pretend it passed. State exactly what could not be verified and why.

## 2. Commit the Changes

If changes are not yet committed:

- **Surgical Commits:** Commit only what is strictly necessary to solve the task. Do not include unrelated files or opportunistic refactoring.
- **No Adjacent Cleanup:** Do not reformat, rename, reorganize, or refactor code that is unrelated to the requested change.
- **Stage Intentionally:** Use targeted staging such as `git add <file>` or `git add -p` when only part of a file belongs to the PR.
- **Commit Message Format:** Follow conventional commits:
  - `feat: [description]` for new features.
  - `fix: [description]` for bug fixes.
  - `chore: [description]` for maintenance or non-user-facing changes.

Before committing, confirm that every staged line traces directly to the user's request.

## 3. Branch Verification

Ensure you are on a branch that follows the project's branch naming conventions:

- `feat/task-name`
- `fix/task-name`
- `chore/task-name`

If you are on `main`, stop immediately, create a new branch, and move the uncommitted changes there.

Use a short, descriptive task name. Do not use vague branch names such as `changes`, `updates`, `work`, or `misc`.

## 4. Push the Branch

Push the branch to the remote origin using the GitHub CLI or git commands:

```bash
git push -u origin <branch-name>
```

If the branch already exists remotely, use a normal push. Do not force-push unless the user explicitly asks and the risk is understood.

## 5. Create the Pull Request

Use the GitHub CLI (`gh pr create`) to open the pull request. Ensure the PR title and body are highly descriptive and formatted cleanly in Markdown.

Before creating the PR, determine the repository default branch when needed:

```bash
gh repo view --json defaultBranchRef
```

### PR Title

The title must match the primary commit message, for example:

```text
fix: resolve webhook signature validation
```

### PR Body Template

Use the following structure for the PR body:

```markdown
## Description
Provide a concise overview of what this PR accomplishes and why it is necessary.

## Changes Made
- Point 1 (e.g., Added `X` dependency to `package.json`)
- Point 2 (e.g., Fixed impurity in `reviews/page.tsx` by migrating `useMemo` to `useState`)

## Verification
Explain how the changes were verified to work:
- [x] Linting passes without errors.
- [x] Tests run successfully (including coverage if applicable).
- [x] Local verification / manual testing steps performed.
```

If any verification step was not run, replace the checked item with an explicit note:

```markdown
- [ ] Tests not run: <reason>
```

## Execution Example

```bash
gh pr create \
  --title "fix: resolve webhook signature validation" \
  --body "## Description
Fixes an issue where valid webhooks were being rejected due to incorrect payload hashing.

## Changes Made
- Updated \`hmac.New\` logic in \`exec-node/src/core/auth\`.
- Added a failing unit test that now passes.

## Verification
- [x] \`go test ./src/core/auth\` passes.
- [x] Tested locally against simulated GitHub events.
"
```

## Stop Conditions

Stop and ask for clarification before committing, pushing, or opening the PR if:

- The working tree contains unrelated changes and it is unclear which files belong to this PR.
- The current branch is protected, shared, or unsuitable for the task.
- Tests or linting fail for reasons that are not clearly caused by the current task.
- Creating the PR requires credentials, permissions, or repository access that is not available.
- The PR target branch is ambiguous.

## Final Response

After the PR is created, report:

- PR URL.
- Branch name.
- Commit hash or short commit hash.
- Verification commands that passed.
- Verification commands that were skipped or failed, with reasons.
