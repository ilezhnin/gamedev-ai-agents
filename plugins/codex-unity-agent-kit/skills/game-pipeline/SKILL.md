---
name: game-pipeline
description: Run the gamedev delivery pipeline over GDD milestones - define, plan, assets, build, test, review, ship - stage by stage, per milestone, or fully automatic from one prompt. Use when the user asks to build a game or feature end to end, run the next pipeline stage or milestone, continue or resume the pipeline, check pipeline status, prepare milestone assets, or take a GDD all the way to a PR or release build.
---

# Game Pipeline

## Goal

Execute the game design contract milestone by milestone through fixed stages, keeping all state in repository files so any platform (Codex, Claude Code, Antigravity) can resume at any point. One prompt can run one stage, one milestone, or the whole MVP. The pipeline executes an approved contract; it never creates or approves one on its own.

## Entry Gate

Check before running any stage:

- No `docs/design/game-design.md` -> do not improvise a design: offer to create the contract with `$gdd` and stop. `$gdd` ends with the user's mode answer; the pipeline starts from that answer.
- GDD exists but the user never confirmed it (no approval in the `pipeline.md` decision log and none in the current conversation) -> ask the user to review it - through the `$gdd` grill when it was never grilled - and stop until approved.
- Mode consent: stage mode is the default. Milestone and auto modes run only when the user names them in the current request; wording inside the original game idea is not consent. When the intended mode is unclear, ask.
- Record the approval and the chosen mode in the `pipeline.md` decision log when the pipeline starts.

## Stages

| # | Stage | Skills | Lead role | Gate to pass |
| --- | --- | --- | --- | --- |
| 1 | Define | `$gdd` | game-designer | GDD grilled with and approved by the user; milestones have acceptance criteria |
| 2 | Plan | `$planning`, `$grill-me` on risk | planner | No unresolved blocking questions |
| 3 | Assets | `$asset-pipeline` when milestone needs art/content | asset-scout, asset-creator, unity-asset-integrator | Required placeholders or briefs exist; provenance/import risks recorded |
| 4 | Build | `$crossworking` -> `$unity-implement`, `$unity-mcp` | unity-worker | Increment compiles and is committed |
| 5 | Test | `$unity-validate`, `$unity-tests` | qa, unity-test-runner | Acceptance criteria pass; console clean |
| 6 | Review | `$unity-review` | unity-reviewer | No blocking findings after the fix loop |
| 7 | Ship | `$create-mr`; release milestones add `$unity-build` | pr-submitter, devops | PR opened / build artifact produced |

The producer role keeps pipeline state current. The architect role arbitrates when a milestone forces a structural decision. Role contracts come from the kit canon; the role hierarchy rule applies.

## State

`.agents/plans/pipeline.md` is the single source of pipeline truth (format in `references/pipeline-state.md`): current milestone and stage, per-stage gate results with evidence, blockers, and the decision log. Create it when the pipeline starts, update it after every stage, and resume from it - never from chat memory.

## Modes

- **Stage mode** (default): run the current stage, update state, report, stop. The user advances the pipeline explicitly.
- **Milestone mode** ("run milestone N", "next milestone"): run stages 2-7 for one milestone without stopping between green gates.
- **Auto mode** ("auto", "turnkey", "run the whole MVP" - named by the user in the current request): loop milestones until the MVP checklist in the GDD is complete. Stop only on stop conditions.

In every mode: work on a task-local branch and commit after each verified increment (crossworking rules); every milestone ends committed, so a broken state reverts to last-known-good instead of unwinding by hand.

## Stop Conditions

Stop, record the blocker in `pipeline.md`, and surface it to the user when: the Entry Gate fails (missing or unapproved GDD); the GDD or plan has unresolved blocking questions; the same gate fails twice on the same cause; validation fails for reasons outside the current milestone; a structural decision contradicts `ARCHITECTURE.md`; required assets, asset licenses/provenance, packages, or credentials are missing; or any crossworking stop condition fires.

## Rules

- Never skip a gate because a change "looks small" - the gates are the pipeline.
- Every milestone ends playable: compiles, PlayMode enters clean, console clean, the milestone's mechanics reachable in-game. Capture PlayMode evidence (console output, screenshot via `$unity-mcp`) into the Test stage record.
- Auto mode never invents scope: anything not in the GDD goes to the Later list and the pipeline continues.
- Descope decisions belong to the producer against the MVP definition; quality is never the cut.

## Exit Criteria

Report per run: milestone and stage executed, gate results with evidence, the updated state file, and the next stage or the exact blocker. In auto mode add: milestones completed, MVP checklist state, and PR / build links.
