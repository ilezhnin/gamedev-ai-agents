---
name: unity-mcp
description: Drive the Unity Editor through MCP safely. Use when Unity MCP tools are available and the task involves scenes, GameObjects, components, prefabs, assets, cameras, UI, packages, console logs, PlayMode, EditMode tests, screenshots, or editor automation beyond plain file edits.
---

# Unity Use Editor MCP

## Overview

Use Unity MCP with a resource-first workflow: inspect editor state and project context before mutating scenes, assets, scripts, or play mode.

## Workflow

1. Discover Unity MCP tools and resources available in the current session.
2. If multiple Unity instances are connected, select the intended instance before tool calls.
3. Read editor state first. Wait if Unity is compiling, reloading, busy, or not ready for tools.
4. Read project info and console errors before mutating anything.
5. Inspect scene hierarchy, GameObjects, components, assets, or tests with paged queries.
6. Use batch operations for independent repeated changes.
7. After editing scripts or assets with filesystem tools (outside the editor), request an asset database refresh through MCP: an unfocused editor does not auto-refresh, and without it the compilation you are waiting for never starts.
8. After script edits, wait for compilation and check console errors before attaching new components or running tests.
9. Verify visual or scene changes with screenshots when the outcome is spatial or UI-driven.
10. Save changed scenes/assets only when the task intends persistent Unity state changes.

## Guardrails

- Never mutate a scene or prefab based only on a guessed object name. Resolve the object, path, or instance id first.
- Check the console after major changes and before final response.
- Keep paged queries small enough to avoid huge payloads.
- Prefer project assets and reflected APIs over remembered Unity API details.
- Do not assume packages such as TMP, Input System, Cinemachine, ProBuilder, URP, or HDRP are present. Detect them first.
- Treat screenshots as verification, not decoration.
- Check play mode before persistent edits: scene changes made during PlayMode are lost when it stops. Stop play mode first; PlayMode observations are evidence, not edits.
- Prefer purpose-built tools over in-editor code execution. Run arbitrary C# only for one-off queries or checks no dedicated tool covers, never for destructive operations: its safety checks are not a sandbox, and executed code is not saved into the project.

## Recovery

- If Unity is busy, compiling, or reloading, wait and reread editor state instead of retrying blind.
- If the connection drops during a domain reload, wait briefly and reconnect.
- If a stale file or SHA error appears, reread the file or asset state before retrying the edit.
- If a tool payload fails validation, inspect the component or resource schema and adapt field names and types.
- If a mutation went wrong, use the editor's undo through MCP before rebuilding the state by hand.
