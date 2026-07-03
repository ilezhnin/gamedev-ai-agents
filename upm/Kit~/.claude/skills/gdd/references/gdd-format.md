# Game Design Contract Format

Write `docs/design/game-design.md` with this structure. It is a living contract: update it in place, move discarded ideas to Later / Cut, never keep history inline.

```markdown
# <Game / Feature Title>

## Pillars
- <The fantasy in one sentence.>
- <Genre, platform, session length, target feel.>

## Core Loop
<The 30-second player cycle: verbs, feedback, reward. One paragraph or a 3-6 step list.>

## Mechanics
| Mechanic | Behavior | Owning module | Milestone |
| --- | --- | --- | --- |
| <Jump> | <short behavioral description> | <Assets/.../GameMovement> | M1 |

## Systems
<Progression, economy, AI, save - each with its owning module and the state it owns.>

## Balance Data
| Parameter | Default | Range | Lives in |
| --- | --- | --- | --- |
| <JumpHeight> | <2.5> | <1.5 - 4.0> | <MovementConfig ScriptableObject> |

## Assets
| Asset | Placeholder | Final | Pipeline |
| --- | --- | --- | --- |
| <Player model> | <capsule primitive> | <TBD> | <$asset-pipeline: reuse/source/generate/integrate> |

## MVP
- [ ] <Mechanic or system that must ship for the core loop to be fun-testable.>

## Milestones

### M1 - <Playable skeleton>
- Scope: <mechanics rows from the table>
- Acceptance: <player-visible checks QA can run in PlayMode>
- Playable when: compiles, PlayMode clean, <mechanic> reachable in-game.

## Later / Cut
- <Descoped item - one-line reason.>
```

Rules:

- Every mechanics row references a module-map owner; proposing a new module is an explicit decision for the architect role.
- Every balance parameter names the data asset that will hold it; implementation creates that asset, not constants.
- Every asset row names a placeholder path and whether sourcing, generation, or Unity integration needs `$asset-pipeline`.
- Acceptance criteria must be verifiable in PlayMode or by an automated test - never "feels good".
- The MVP checklist is the auto-mode termination condition for `$game-pipeline`; keep it short and honest.
