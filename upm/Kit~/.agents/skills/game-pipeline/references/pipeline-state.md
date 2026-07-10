# Pipeline State Format

`.agents/plans/pipeline.md` is the resumable state of one active pipeline run.

```markdown
# Pipeline: <Game / Feature Title>

- GDD: .agents/plans/<slug>-gdd.md
- GDD hash: <sha256>
- Approved GDD hash: <sha256 or none>
- Approval: <date and user decision reference>
- Base branch: <branch>
- Base SHA: <commit>
- Initial staged paths: <none or linked snapshot>
- Initial unstaged paths: <none or linked snapshot>
- Initial untracked paths: <none or linked snapshot>
- Task workspace: <clean primary checkout | separate worktree path>
- Task-owned paths: <explicit path list>
- Mode: <stage | milestone | auto>
- Current: <M2 / Execute / Simplify>
- Final task-content fingerprint: <sha256, or pending>
- Frozen task-path set: <persistent ignored UTF-8 JSON path and sha256, or pending>
- Source HEAD: <primary task-branch HEAD when candidate was materialized>
- Candidate tree SHA: <reviewed `git write-tree` value, or pending>
- Delivery boundary: <local handoff only | authorized local commit | exact user-authorized push/PR/build actions>

## Milestones
| Milestone | Plan | Assets | Implement | Simplify | Validate | Review |
| --- | --- | --- | --- | --- | --- | --- |
| M1 <name> | done | done | done | done (no-op) | done | done |
| M2 <name> | done | in progress | - | - | - | - |

## Delivery
- Unit: <M1 | MVP | none>
- State: <not requested | ready | provisional local commit | local commit prepared | pushed | PR opened | build produced | blocked>
- Commit/build/PR: <actual identifier or none>
- Continuation: <not applicable | terminal on this task branch; awaiting user-ratified integrated base>

## Blockers
- <none, or: blocker - owner - decision needed>

## Decision Log
- <date>: GDD <hash> approved by user; mode = <mode>
- <date>: <proposed scope change approved/rejected; new hash when approved>

## Stage Records

### M2 / Execute / Simplify
- Input task-content fingerprint: <value>
- Result: <changes or justified no-op>
- Production-code balance: <lines/concepts removed or retained>
- Focused recheck: <exact command and result>
```

## Task-Content Fingerprint

Use one commit-independent fingerprint across simplification, validation, review, and delivery:

1. Freeze the explicit task-owned path set. Expand owned directories against the union of the base revision and current tree so deleted files are included.
2. Sort repository-relative paths by ordinal UTF-8 bytes.
3. For each path, append UTF-8 `path`, NUL, final Git kind/mode (`100644`, `100755`, `120000`, or `deleted`), NUL, lowercase SHA-256 of the final raw bytes (or `-` for deleted), NUL.
4. SHA-256 the concatenated byte stream. Before candidate materialization, simplification may record a provisional value from final filesystem bytes in the clean path-exclusive task workspace. The canonical Execute value is read from isolated candidate-tree blobs and must match that provisional value. Before commit read from candidate index-tree blobs; after commit read from commit-tree blobs. Candidate, index, and commit values must all match.

The fingerprint proves byte-for-byte equality only after the task set is already path-exclusive. It does not prove ownership or validate selected hunks. Do not include HEAD, commit SHA, timestamps, or validation output in it. Record base SHA, source HEAD, candidate tree SHA, and delivery commit SHA separately. The candidate tree identifies the complete clean repository snapshot, preventing unrelated dirty files or selective staging from contaminating evidence.

## Evidence Contract

- **Define:** selected GDD path, content hash, grill result, and explicit user approval for the same hash.
- **Plan:** plan path/hash, no unresolved blocking questions, exact verification commands.
- **Assets:** asset brief with provenance/import evidence, or explicit no-asset result tied to the milestone.
- **Implement:** task-owned paths, implementation summary, and real compile/behavior baseline.
- **Simplify:** changes or justified no-op, production-complexity balance, and focused recheck.
- **Validate:** required Unity version, exact commands/results, immutable candidate-tree/attempt evidence directory, logs or console evidence, metadata check, frozen task-path JSON/hash, independently reproduced task-content fingerprint, source HEAD, and isolated candidate tree SHA.
- **Review:** reviewer role, complete `base..candidate-tree` scope, finding IDs/status, and the same fingerprint/tree SHA.
- **Prepare delivery:** exact authorization and repository policy check, full-path staging only when a commit is authorized, index tree and post-commit tree both equal to the reviewed candidate tree SHA, matching task-content fingerprint, identity check, actual commit/push/PR/build identifier, requested-build exact delivery HEAD plus detached linked-worktree proof and commit-tree equality, exact Unity version, unchanged protected-content/status postflight, and exact authorization for any remote action.

A screenshot supports visual acceptance only. A commit proves repository state only. Neither substitutes for compile, tests, or review.

## Rules

- One row per milestone. Cells are `-`, `in progress`, `done`, `done (no-op)`, or `blocked`.
- Any edit to the GDD invalidates approval until its new hash is approved.
- Any candidate-tree or task-content change after validation/review invalidates those gates until rerun; a commit whose tree equals the reviewed candidate tree does not.
- Every validation/build retry writes a new evidence directory keyed by candidate tree and attempt; prior attempts are immutable and never overwritten.
- Blockers are append-resolved, not silently deleted.
- Assets may be `done` with an explicit no-asset result.
- Do not create checkpoint commits for pipeline stages; any authorized delivery commit is prepared only after all gates pass.
- A separately delivered milestone is terminal for its task branch. Resume later milestones only from a fresh recorded base and fresh local task branch/worktree after user integration or explicit ratification; never append another milestone commit to the delivered branch.
- The decision log is append-only; tables and current-state fields may be rewritten.
- The file is gitignored working state, not repository documentation.
