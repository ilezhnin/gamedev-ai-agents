---
name: gdd
description: Turn a game or feature idea into a game design contract - core loop, mechanics, balance data, asset needs, scope-boxed MVP, and playable milestones - before planning and implementation. Use when the user asks to make a game, design a game or a feature, write or update a GDD, define mechanics, balance, placeholder assets, or start the game pipeline from a one-line idea.
---

# GDD

## Goal

Produce `docs/design/game-design.md` - the design contract the delivery pipeline executes against - plus a milestone list where every milestone ends in a playable state. Product decisions are made here; downstream stages (`$planning`, `$crossworking`) execute without re-opening them.

## Workflow

1. Read `AGENTS.md` (module map), `ARCHITECTURE.md`, and existing `docs/design/` content. For a feature going into an existing game, read the owning modules first (`$unity-orient` when unfamiliar).
2. Extract the pillars from the request: the one-sentence fantasy, genre, platform, session shape. Ask only questions whose answer changes the design; state safe assumptions instead of blocking.
3. Define the core loop first - the 30-second cycle the player repeats. Every mechanic must serve it; anything that does not goes to the Later list.
4. Break the design into mechanics and systems, each mapped to an owning module from the module map or to an explicitly proposed new module.
5. Express balance as data: named parameters with defaults and tuning ranges, planned as ScriptableObjects or config assets - never hardcoded numbers.
6. List required assets with a placeholder strategy (primitives, ProBuilder, CC0 packs, generated concepts, sourced references) so implementation never blocks on missing art; route non-trivial sourcing/generation/import through `$asset-pipeline`.
7. Scope-box the MVP: the smallest version where the core loop is fun-testable. Everything else moves to the Later list with a one-line reason.
8. Slice the MVP into milestones - vertical slices, each ending playable: project compiles, PlayMode enters clean, console clean, the new mechanics reachable in-game. Give each milestone acceptance criteria a QA role can verify.
9. Stress-test with `$grill-me` when the design has unclear product value, scope risk, asset/licensing risk, or persistence/multiplayer implications.
10. Write the document using the format in `references/gdd-format.md`, then hand off: `$game-pipeline` to run the stages, `$asset-pipeline` for asset-heavy milestone prep, or `$planning` for milestone 1 directly.

## Rules

- Milestones are vertical slices, not horizontal layers: "player moves and jumps in a graybox level", never "input system done".
- Milestone 1 is always the playable skeleton: scene loads, PlayMode enters clean, the core loop stub is reachable.
- A feature GDD for an existing game uses the same format scoped to the affected modules; do not redesign what already ships.
- No mechanic without an owning module, no parallel owners - the module map rules apply to designs too.
- The GDD is a living contract: update it in place when execution changes a decision; move discarded scope to Later / Cut.

## Exit Criteria

Finish with: the GDD path, the milestone count, unresolved blocking questions if any, and the recommended next step - `$game-pipeline` to execute, or `$planning` for milestone 1.
