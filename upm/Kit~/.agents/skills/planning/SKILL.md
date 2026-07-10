---
name: planning
description: Build a concrete implementation plan and execution checklist before coding or cross-agent execution. Use when the user asks to plan a task, prepare work for crossworking, create `.agents/plans/active_plan.md` or `.agents/plans/task_list.md`, clarify requirements before implementation, plan asset work, or coordinate a change for workers, simplification, validation, review, and delivery handoff.
---

# Planning

## Goal

Turn an incoming task into two local planning artifacts that downstream agents can execute without guessing:

- `.agents/plans/active_plan.md` - the implementation plan and verification strategy.
- `.agents/plans/task_list.md` - the execution ledger used by crossworking, reviewers, validators, and delivery checks.

Planning must expose uncertainty early. Do not implement while using this skill unless the user explicitly asks to continue into implementation.

## Workflow

1. Read the user request, current thread context, repository instructions, README files, and the smallest useful set of relevant source files.
2. For Unity projects, use `$unity-orient` (`unity-explorer` role) when the project or feature area is unfamiliar or ownership/boundaries must be mapped; always respect `.meta` files, assembly boundaries, serialization, lifecycle, and validation constraints.
3. For C# backend or ASP.NET projects, use `$backend-orient` (`backend-explorer` role) when service boundaries, API contracts, auth/data/configuration risks, migrations, or focused `dotnet` validation commands are not already clear.
4. Identify decisions that materially affect scope, architecture, data migration, tests, public API, dependencies, generated assets, asset licenses/provenance, import settings, or PR risk.
5. For Unity asset-heavy tasks, route the sourcing/generation/import slice through `$asset-pipeline` and name the expected asset-scout, asset-creator, or unity-asset-integrator handoff in the plan.
6. Ask concise questions only when the answer changes the plan in a meaningful way. If the work can proceed with a safe assumption, state the assumption in the plan instead of blocking.
7. Create `.agents/plans/` when missing. If `.agents/plans/.gitignore` is missing, create it with exactly two lines - `*` and `!.gitignore` - so transient plan files stay out of commits unless the project already tracks them intentionally.
8. Write or replace `.agents/plans/active_plan.md` and `.agents/plans/task_list.md`.
9. If there are unresolved blocking questions, stop after writing the artifacts and tell the user exactly what must be answered before crossworking or implementation starts.

## Active Plan Format

Use this structure for `.agents/plans/active_plan.md`:

```markdown
# <Task Title>

<One concise paragraph describing the requested outcome and the implementation intent.>

## User Review Required
> [!IMPORTANT]
> - <Blocking question, migration approval, dependency approval, or "None.">

## Assumptions
- <Safe assumption that can be changed later.>

## Workspace Baseline
- Base branch: <branch>
- Base SHA: <commit>
- Source HEAD: <commit before task content is materialized>
- Initial staged paths: <none or linked snapshot>
- Initial unstaged paths: <none or linked snapshot>
- Initial untracked paths: <none or linked snapshot>
- Task workspace: <clean primary checkout | separate worktree path>
- Task-owned paths: <explicit allowlist>
- Overlap check: <confirmed no task-owned path contains pre-existing work; never infer ownership by hunk, or blocker>
- Delivery boundary: <local handoff only | authorized local commit | exact user-authorized remote actions>

## Proposed Changes

### [Area / System]
* **[NEW|MODIFY|DELETE]** [`path/to/file`](./path/to/file)
  - <Specific change to make.>

## Agent Work Plan
1. <Worker-sized implementation step.>
2. <Testing or generated-code step.>
3. <Review/fix step.>

## Verification Plan

### Automated Tests
* **<Name>**: `<exact command>`

### Manual Verification
1. <Concrete manual check, if needed.>

## Risks And Constraints
- <Risk, invariant, or boundary.>

## Boundaries
- Always: <checks or behaviors that run without asking, e.g. focused tests after edits.>
- Ask first: <changes needing approval, e.g. schema/package/serialized-data changes.>
- Never: <hard limits, e.g. editing Generated/, committing secrets, force-push.>

## Handoff Notes
- <What crossworking, workers, simplification, validators, reviewers, and delivery checks must know.>
```

Use `[NEW]`, `[MODIFY]`, and `[DELETE]` tags so workers can scan the plan quickly. Group changes by subsystem instead of by chronology.

## Checklist Format

Use this structure for `.agents/plans/task_list.md`:

```markdown
* [ ] Blocking questions in `active_plan.md` are answered or explicitly accepted as assumptions.
* [ ] Base branch, base SHA, source HEAD, task workspace, separate staged/unstaged/untracked baselines, task-owned paths, and delivery permission are recorded.
* [ ] Task-owned paths contain no pre-existing user changes; no hunk ownership or partial staging is planned.
* [ ] The branch prefix matches repository policy when a delivery branch or commit will be created.
* [ ] Planned file changes are tagged with `[NEW]`, `[MODIFY]`, or `[DELETE]`.
* [ ] Required generated-code, migration, asset, or schema steps are called out.
* [ ] Asset sourcing, generation prompts, license/provenance, import settings, and replacement risks are called out when assets are part of the work.
* [ ] Required static, metadata, compile, and test commands are included for all touched services or Unity assemblies.
* [ ] Manual verification steps are concrete enough for another agent to perform.
* [ ] Known risks and constraints are documented in `active_plan.md`.
* [ ] The plan has been copied to `.agents/plans/active_plan.md` and the checklist to `.agents/plans/task_list.md`.
* [ ] Implementation is complete only on task-owned paths.
* [ ] `$simplify-change` completed or recorded an evidence-backed no-op.
* [ ] A clean isolated candidate tree was materialized from the base plus complete task-owned paths.
* [ ] Final validation and review evidence are bound to source HEAD, candidate tree SHA, and the commit-independent task-content fingerprint.
* [ ] Independent review blockers are resolved or explicitly accepted by the user.
* [ ] Final diff scope excludes unrelated user changes and secrets.
* [ ] Delivery stopped at the exact permission boundary recorded in the plan.
```

Add task-specific checklist items when needed. Leave ambiguous or unverified items unchecked and explain the gap in the plan.

## Clarification Rules

- Ask before planning destructive changes, production data migrations, new dependencies, public API changes, broad refactors, or unclear product scope.
- Do not ask for facts that can be found in the repository with targeted inspection.
- If the user gives partial answers, update the plan and leave remaining unresolved items in `User Review Required`.
- If a question is useful but not blocking, put it under `Assumptions` or `Risks And Constraints` and keep the plan executable.

## Exit Criteria

Finish with a short summary that names the two artifact paths, states whether user review is required, and identifies the recommended next skill: usually `$crossworking` for execution, `$asset-pipeline` for asset sourcing/generation/import, or `$grill-me` for stress-testing the plan.
