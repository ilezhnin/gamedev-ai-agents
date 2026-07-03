---
name: gdd
description: Turn a game or feature idea into a game design contract - core loop, mechanics, balance data, asset needs, scope-boxed MVP, and playable milestones - grilled with the user before anything executes. Use when the user asks to make a game, design a game or a feature, write or update a GDD, or define mechanics, balance, or placeholder assets, including from a one-line idea.
---

# GDD

## Goal

Produce `docs/design/game-design.md` - the design contract the delivery pipeline executes against - plus a milestone list where every milestone ends in a playable state. Product decisions are made here and confirmed with the user in a mandatory grill; downstream stages (`$planning`, `$crossworking`) execute without re-opening them. This skill never starts execution: it ends by asking the user how to proceed.

## Workflow

1. Read `AGENTS.md` (module map), `ARCHITECTURE.md`, and existing `docs/design/` content. For a feature going into an existing game, read the owning modules first (`$unity-orient` when unfamiliar).
2. Extract the pillars from the request: the one-sentence fantasy, genre, platform, session shape. Research what the design depends on. Record every assumption this forces - dimension, perspective, controls, scope; assumptions are grill material for step 9, not settled decisions.
3. Define the core loop first - the 30-second cycle the player repeats. Every mechanic must serve it; anything that does not goes to the Later list.
4. Break the design into mechanics and systems, each mapped to an owning module from the module map or to an explicitly proposed new module.
5. Express balance as data: named parameters with defaults and tuning ranges, planned as ScriptableObjects or config assets - never hardcoded numbers.
6. List required assets with a placeholder strategy (primitives, ProBuilder, CC0 packs, generated concepts, sourced references) so implementation never blocks on missing art; plan non-trivial sourcing/generation/import to go through `$asset-pipeline`.
7. Scope-box the MVP: the smallest version where the core loop is fun-testable. Everything else moves to the Later list with a one-line reason.
8. Slice the MVP into milestones - vertical slices, each ending playable: project compiles, PlayMode enters clean, console clean, the new mechanics reachable in-game. Give each milestone acceptance criteria a QA role can verify.
9. Grill the draft with the user via `$grill-me` - always, even when the design feels obvious. A design that is obvious to the agent is not a design the user has agreed to: even a one-line idea hides decisions the user has not actually made. Derive the questions from the context and the assumptions recorded in step 2; confirm the pillars, the core loop, the MVP cut, and the milestone slicing.
10. If the grill overturns a pillar, the scope, or the MVP cut, loop back to step 2 with the corrected inputs and redo the affected research and design - do not patch the invalidated draft.
11. Write the document using the format in `references/gdd-format.md`.
12. Stop and ask. Report that the contract is ready and ask how to proceed: `$game-pipeline` stage by stage, `$game-pipeline` auto for the whole MVP, `$planning` for milestone 1 only, or park it for now. Never invoke `$game-pipeline`, `$planning`, or `$asset-pipeline` from this run - execution starts only from the user's explicit answer.

## Rules

- Milestones are vertical slices, not horizontal layers: "player moves and jumps in a graybox level", never "input system done".
- Milestone 1 is always the playable skeleton: scene loads, PlayMode enters clean, the core loop stub is reachable.
- A feature GDD for an existing game uses the same format scoped to the affected modules; do not redesign what already ships.
- No mechanic without an owning module, no parallel owners - the module map rules apply to designs too.
- The GDD is a living contract: update it in place when execution changes a decision; move discarded scope to Later / Cut.
- An ungrilled GDD is a draft, not a contract: the step 9 grill is a gate, not a suggestion, no matter how obvious the design looks.

## Stop Conditions

Writing the document ends the run - present the GDD and the mode question, then wait for the answer. Also stop and ask when the grill exposes a product decision only the user can make, or when the grill invalidates the request itself - restate the corrected idea and confirm it before redesigning.

## Exit Criteria

Finish with: the GDD path, the milestone count, the decisions the grill confirmed or changed, unresolved blocking questions if any, and the explicit mode question - `$game-pipeline` stage by stage, `$game-pipeline` auto, `$planning` for milestone 1 only, or stop here. Execution never starts in the same run.
