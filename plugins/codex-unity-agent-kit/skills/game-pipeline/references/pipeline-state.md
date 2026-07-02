# Pipeline State Format

`.agents/plans/pipeline.md` is the resumable state of one pipeline run. Any agent on any platform must be able to continue the pipeline from this file, the GDD, and the plan artifacts alone.

```markdown
# Pipeline: <Game / Feature Title>

- GDD: docs/design/game-design.md
- Branch: <feat/...>
- Mode: <stage | milestone | auto>
- Current: <M2 / Build>

## Milestones
| Milestone | Plan | Build | Test | Review | Ship |
| --- | --- | --- | --- | --- | --- |
| M1 <name> | done | done | done | done | done <PR link or commit> |
| M2 <name> | done | in progress | - | - | - |

## Blockers
- <none, or: blocker - owner - decision needed>

## Decision Log
- <date>: <decision, deciding role, one-line reason>

## Stage Records

### M2 / Build
- <commands run, results, commit hashes, evidence paths (console dumps, screenshots)>
```

Rules:

- One row per milestone; stage cells hold `-`, `in progress`, `done`, or `blocked`.
- Every `done` needs evidence in the matching Stage Record: the exact command and result, a commit hash, a PR link, or a screenshot path.
- Blockers are never deleted - they get resolved with a note that names the resolving decision.
- Rewrite tables freely; the Decision Log is append-only.
- The file lives in `.agents/plans/` (kept out of commits by the plans `.gitignore`); it is working state, not documentation - durable design decisions belong in the GDD.
