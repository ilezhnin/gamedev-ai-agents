---
name: game-pipeline
description: Run the gamedev delivery pipeline over GDD milestones - define, plan, build, test, review, ship - stage by stage, per milestone, or fully automatic from one prompt. Use when the user asks to build a game or feature end to end, run the next pipeline stage or milestone, continue or resume the pipeline, check pipeline status, or take a GDD all the way to a PR or release build.
---

# Game Pipeline

## Goal

Execute the game design contract milestone by milestone through fixed stages, keeping all state in repository files so any platform (Codex, Claude Code, Antigravity) can resume at any point. One prompt can run one stage, one milestone, or the whole MVP.

## Stages

| # | Stage | Skills | Lead role | Gate to pass |
| --- | --- | --- | --- | --- |
| 1 | Define | `$gdd` | game-designer | GDD exists; milestones have acceptance criteria |
| 2 | Plan | `$planning`, `$grill-me` on risk | planner | No unresolved blocking questions |
| 3 | Build | `$crossworking` -> `$unity-implement`, `$unity-mcp` | workers | Increment compiles and is committed |
| 4 | Test | `$unity-validate`, `$unity-tests` | qa, test-runner | Acceptance criteria pass; console clean |
| 5 | Review | `$unity-review` | reviewers | No blocking findings after the fix loop |
| 6 | Ship | `$create-mr`; release milestones add `$unity-build` | pr-submitter, devops | PR opened / build artifact produced |

The producer role keeps pipeline state current. The architect role arbitrates when a milestone forces a structural decision. Role contracts come from the kit canon; the role hierarchy rule applies.

## State

`.agents/plans/pipeline.md` is the single source of pipeline truth (format in `references/pipeline-state.md`): current milestone and stage, per-stage gate results with evidence, blockers, and the decision log. Create it when the pipeline starts, update it after every stage, and resume from it - never from chat memory.

## Modes

- **Stage mode** (default): run the current stage, update state, report, stop. The user advances the pipeline explicitly.
- **Milestone mode** ("run milestone N", "next milestone"): run stages 2-6 for one milestone without stopping between green gates.
- **Auto mode** ("auto", "the whole game", "turnkey"): loop milestones until the MVP checklist in the GDD is complete. Stop only on stop conditions.

In every mode: work on a task-local branch and commit after each green milestone (crossworking rules), so a broken state reverts to last-known-good instead of unwinding by hand.

## Stop Conditions

Stop, record the blocker in `pipeline.md`, and surface it to the user when: the GDD or plan has unresolved blocking questions; the same gate fails twice on the same cause; validation fails for reasons outside the current milestone; a structural decision contradicts `ARCHITECTURE.md`; required assets, packages, or credentials are missing; or any crossworking stop condition fires.

## Rules

- Never skip a gate because a change "looks small" - the gates are the pipeline.
- Every milestone ends playable: compiles, PlayMode enters clean, console clean, the milestone's mechanics reachable in-game. Capture PlayMode evidence (console output, screenshot via `$unity-mcp`) into the Test stage record.
- Auto mode never invents scope: anything not in the GDD goes to the Later list and the pipeline continues.
- Descope decisions belong to the producer against the MVP definition; quality is never the cut.

## Exit Criteria

Report per run: milestone and stage executed, gate results with evidence, the updated state file, and the next stage or the exact blocker. In auto mode add: milestones completed, MVP checklist state, and PR / build links.
