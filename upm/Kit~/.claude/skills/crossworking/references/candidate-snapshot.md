# Isolated Candidate Snapshot

Use this protocol for delivery-grade final validation and review when the primary checkout contains any pre-existing dirty work.

## Preconditions

- Record base branch/SHA, current source HEAD, exact task-owned paths, and initial dirty paths.
- A task-owned file or asset may not contain pre-existing user changes. Do not use hunk ownership or partial staging to work around overlap.
- The local task branch starts at the recorded base and contains no unrelated commits.
- The task workspace started with a clean index. If the primary checkout was dirty, the local task branch lives in a separate worktree and the primary checkout was never switched or used for staging.
- Task-owned paths are deliverable repository paths. Ignored planning/evidence artifacts are not candidate content; if a requested deliverable is ignored by repository policy, stop instead of force-adding it silently.

## Materialize

1. Create a temporary detached Git worktree outside the primary checkout at the recorded base SHA.
2. Copy each present task-owned file from the recorded clean-initialized task workspace/worktree byte-for-byte into the same relative path in the candidate; remove each task-owned path deleted by the task. Include `.meta` pairs and untracked task files. Never source candidate content from the dirty primary checkout.
3. Verify every non-task path still matches the base worktree. Do not copy unrelated dirty files, `Library/`, `Temp/`, logs, build output, or user settings.
4. In the candidate only, confirm no present task-owned deliverable is ignored (`git check-ignore`) and no ignored file exists under `Assets/`, `Packages/`, or `ProjectSettings/`; a delivery-grade candidate must derive entirely from Git plus the explicit staged task paths.
5. Expand the task-owned path set against the union of base and current content, freeze the normalized repository-relative file paths as a UTF-8 JSON array in persistent ignored evidence storage, then stage every path in full with `git add -A -- <paths>`.
6. Run `git write-tree` and record that candidate tree SHA without creating a commit or branch. Compute the canonical task-content fingerprint from the frozen JSON path set and candidate-tree blobs; record source HEAD separately. `$unity-validate` must independently reproduce that value before it starts Unity.

The candidate tree SHA identifies the entire deliverable repository snapshot. The task-content fingerprint identifies the frozen task-owned content. Both must remain stable through final validation and review.

## Validate And Review

- Run final Unity validation against the candidate worktree, never the shared dirty checkout.
- Capture the protected-path content manifest before Unity and in a `finally` postflight after Unity, including failed runs.
- Materialize the reviewer packet from `base_sha` to candidate tree SHA plus the task metadata/fingerprint. Read-only reviewers inspect the candidate paths and packet.
- Apply accepted fixes in the recorded task workspace through the single writer, then discard only a clean candidate and materialize a new one. Never patch the candidate as the source of truth.

## Handoff And Cleanup

- Preserve and report a candidate with unexpected source, asset, package, or settings mutations; do not auto-revert or delete it.
- A clean candidate may be removed only after logs/results/review evidence are copied to ignored plan storage.
- At delivery, the staged index tree and final commit tree must both equal the reviewed candidate tree SHA. A mismatch invalidates validation/review and blocks the commit.
