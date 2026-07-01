---
name: crossworking
description: Coordinate a planned task across agents from planning through implementation, review, validation, and create-mr handoff. Use when the user asks for crossworking, multi-agent execution, an agent team, workers plus reviewers/testers, running an existing `.agents/plans/active_plan.md`, or taking a planned task all the way to a Pull Request / Merge Request.
---

# Crossworking

## Goal

Run a controlled delivery loop for a task that has a plan or needs one. The parent agent stays responsible for decisions, while workers implement, reviewers inspect, validators test, and create-mr prepares the Pull Request / Merge Request.

## Required Artifacts

Read these first when present:

- `.agents/plans/active_plan.md`
- `.agents/plans/task_list.md`

If either file is missing, stale, or too vague to execute, use `$planning` first and stop for user review when the plan contains blocking questions.

## Coordination Rules

- Keep one parent agent in charge of scope, decisions, synthesis, and final reporting.
- Use subagent or multi-agent tools when they are available. If they are not available, execute the same phases sequentially in the parent thread and report that delegation was unavailable.
- Use only one writer in a working tree at a time. Split implementation across multiple workers only when the tasks are independent and isolated worktrees or equivalent safeguards are available.
- Review agents must inspect fresh repository state and current diffs. They must not rely only on parent-thread summaries.
- Do not let reviewers edit code. Use a writer/fixer pass for accepted fixes.
- Keep `.agents/plans/task_list.md` current as phases complete or blockers appear.
- Do not create a PR/MR while tests are failing, blocking review findings remain, or unrelated working-tree changes are unresolved.

## Workflow

1. **Plan gate**
   - Read `active_plan.md` and `task_list.md`.
   - If `User Review Required` contains unresolved blocking items, ask the user and stop.
   - If the task is Unity-specific, use relevant kit skills for orientation, implementation, review, validation, or Unity MCP work.
   - If the task is C# backend or ASP.NET-specific, use relevant kit skills for implementation, review, validation, auth/data/configuration risk, and migration checks.

2. **Context pass**
   - Gather only the context workers need: relevant files, ownership boundaries, commands, risks, and acceptance criteria.
   - Update the plan if inspection changes the expected files, risks, or verification commands.

3. **Implementation pass**
   - Assign worker-sized tasks from `Agent Work Plan`.
   - Prefer one implementation worker unless the plan clearly separates independent file sets.
   - Require each worker to report changed files, validation run, failed or skipped checks, and open questions.

4. **Validation pass**
   - Run the exact automated checks from `Verification Plan` when feasible.
   - For Unity projects, prefer focused EditMode/PlayMode tests, compile checks, Unity console checks, or Unity MCP validation when available.
   - For C# backend projects, prefer targeted `dotnet build`, `dotnet test`, migration checks, contract checks, or documented service blockers.
   - Record commands and results in the final synthesis and, when useful, in the checklist.

5. **Review pass**
   - Run parallel reviewers with fresh context when tools allow it.
   - Choose review angles based on the change. Common angles are correctness/regression, tests/validation, maintainability, Unity lifecycle/serialization, API contract, auth/data integrity, performance, and security.
   - Synthesize findings into blockers, fixes to apply now, optional improvements, and feedback to ignore or defer.

6. **Fix loop**
   - Apply only accepted fixes through one writer.
   - Re-run focused validation.
   - Repeat review up to 3 rounds by default, stopping earlier when no blockers or must-fix items remain.

7. **create-mr handoff**
   - Use `$create-mr` when that skill is available.
   - If `$create-mr` is not available, follow the repository PR/MR process if one exists. Otherwise stop with a clear blocker that the create-mr capability is missing.
   - Before the handoff, verify branch name, working tree status, diff scope, tests, skipped checks, and unrelated changes.
   - Never invent a PR URL. If credentials, remotes, or permissions are missing, report the blocker exactly.

## Agent Team Shape

Use this default team unless the repository or tools provide better named agents:

- **Planner**: applies `$planning`, updates `active_plan.md`, and tracks uncertainty.
- **Context scout**: maps relevant files, patterns, dependencies, and validation commands.
- **Worker**: writes code and tests for the approved plan.
- **Validator**: runs compile, test, lint, generated-code, or Unity checks.
- **Reviewers**: inspect the diff from independent angles without editing.
- **Fixer**: applies accepted review fixes.
- **MR agent**: runs `$create-mr` or the project PR/MR workflow.

## Stop Conditions

Stop and ask or report a blocker when:

- The plan has unresolved blocking questions.
- The implementation requires a product, scope, dependency, schema, asset, or architecture decision not approved in the plan.
- The working tree contains unrelated changes and ownership is unclear.
- Validation fails for reasons not clearly caused by the current task.
- Review finds a blocker that needs user approval.
- PR/MR creation lacks credentials, remote access, a suitable branch, or the create-mr capability.

## Final Report

Report the outcome compactly:

- Plan used: path and whether it changed.
- Agents/phases run: planner, worker, validators, reviewers, fixer, create-mr.
- Changes made: files and intent.
- Validation: commands passed, failed, or skipped with reasons.
- Review: blockers fixed, optional items deferred, remaining risks.
- MR: URL, branch, commit hash, or the exact blocker preventing MR creation.
