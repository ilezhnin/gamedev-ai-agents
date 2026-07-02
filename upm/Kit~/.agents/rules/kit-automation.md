---
trigger: always_on
---

# Post-Edit Automation (rendered from kit canon)

After creating, editing, moving, or deleting project files in this task, run:

```
powershell -NoProfile -ExecutionPolicy Bypass -File .agents/scripts/check-unity-meta.ps1
```

Fix every reported issue before finishing the task. Do not skip this check.
