---
name: teamwork-preview
description: Invoke and coordinate an agent team for larger development tasks. Use when the user asks for teamwork, a team of agents, autonomous multi-agent execution, parallel workers or reviewers, a large Unity/C# or ASP.NET backend feature, or an end-to-end flow from planning through implementation, validation, review, fixes, and Pull Request / Merge Request handoff.
---

# Teamwork Preview

## Goal

Coordinate a practical agent team without losing control of scope. This skill is the user-facing "team of agents" entrypoint; for execution details, reuse `$planning`, `$crossworking`, Unity/backend skills, and `$create-mr` instead of duplicating their workflows.

The parent agent remains responsible for decisions, synthesis, and final reporting.

## Default Flow

1. **Plan**
   - If `.agents/plans/active_plan.md` and `.agents/plans/task_list.md` are missing or stale, use `$planning` first.
   - If the plan contains unresolved blocking questions, ask the user before starting implementation.
   - Use `$grill-me` before implementation when the plan has unclear product value, Unity lifecycle risk, persistence risk, migration risk, or high design uncertainty.

2. **Orient**
   - For Unity projects, use `$unity-orient-project` before assigning work.
   - For C# backend projects, identify solution/project files, API/service boundaries, persistence/configuration/auth risks, tests, and validation commands.
   - Identify assemblies, scenes/prefabs/assets, generated files, tests, validation commands, risky serialized data changes, migrations, and public API changes.

3. **Execute**
   - Use `$crossworking` as the delivery loop.
   - Use one writer in a working tree at a time unless the user explicitly requests isolated worktrees and the tooling supports them.
   - Prefer one implementation worker for narrow tasks and a small team for larger tasks: context scout, worker, validator, reviewers, fixer, MR agent.

4. **Review**
   - Run reviewers with fresh repository context and independent angles.
   - Typical angles: correctness/regression, validation quality, maintainability, Unity lifecycle/serialization, performance, security, and PR scope.
   - Do not let reviewers edit code. Apply accepted fixes through a writer/fixer pass.

5. **Validate**
   - Run the plan's exact checks where feasible.
   - For Unity, prefer focused EditMode/PlayMode tests, compile checks, Unity console checks, MCP test runs, or documented validation blockers.
   - For C# backend, prefer targeted `dotnet build`, `dotnet test`, migration checks, contract checks, or documented service blockers.

6. **Ship**
   - Use `$create-mr` only after the working tree, diff scope, validation, and review state are acceptable.
   - Never create or claim an MR if branch, credentials, remote, tests, or unrelated changes are unresolved.

## Team Assembly

Choose the smallest team that can safely complete the task.

- **Small task**: parent agent plus one worker-style implementation pass plus validation.
- **Medium task**: planner/context scout, one worker, one validator, two reviewers.
- **Large task**: planner/context scout, one writer at a time, validator, three reviewers, fixer, MR agent.

Use multi-agent tools when available. If they are unavailable, run the same phases sequentially and say that the teamwork preview was executed as a parent-controlled sequence.

## Unity/C# Defaults

- Respect real project paths and local instructions. Do not confuse real Unity projects with prototype folders when AGENTS instructions distinguish them.
- Preserve `.meta` files and serialized field compatibility.
- Avoid adding packages, dependencies, broad managers, global scene searches, or silent runtime repair without approval.
- Keep runtime/editor assembly boundaries intact.
- Treat Unity validation honestly: do not claim compilation passed unless Unity compiled or the Unity console was checked.
- Treat backend validation honestly: do not claim builds, tests, migrations, or smoke checks passed unless they actually ran.
- Preserve ASP.NET auth, API contracts, data integrity, configuration safety, and migration review.
- Use targeted tests first; broaden only when shared behavior or serialization contracts are touched.

## Stop Conditions

Stop and ask or report a blocker when:

- The plan has unanswered blocking questions.
- Implementation reveals an unapproved product, scope, dependency, schema, asset, or architecture decision.
- Multiple writers would touch the same working tree.
- Review finds a blocker needing user approval.
- Validation fails for unclear reasons.
- MR creation lacks credentials, remote access, a suitable branch, or a clean diff.

## Final Report

Report:

- Plan path and whether user review was required.
- Team/phases actually run.
- Changed files and why.
- Validation run, skipped, or blocked.
- Review outcome and remaining risks.
- MR URL or exact reason MR creation did not happen.
