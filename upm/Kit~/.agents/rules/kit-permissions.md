---
trigger: always_on
---

# Command Permissions (rendered from kit canon)

- Safe without asking: `git status` - Reading git status is safe.
- Safe without asking: `git diff` - Reading git diffs is safe.
- Forbidden without an explicit user request: `git reset` - Never reset user work without an explicit request.
- Forbidden without an explicit user request: `git clean` - Never delete untracked files without an explicit request.

Antigravity's IDE terminal Allow/Deny lists are GUI-only; mirror these entries there manually when configuring the workspace.
