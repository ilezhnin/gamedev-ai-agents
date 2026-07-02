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
7. After script edits, wait for compilation and check console errors before attaching new components or running tests.
8. Verify visual or scene changes with screenshots when the outcome is spatial or UI-driven.
9. Save changed scenes/assets only when the task intends persistent Unity state changes.

## Guardrails

- Never mutate a scene or prefab based only on a guessed object name. Resolve the object, path, or instance id first.
- Check the console after major changes and before final response.
- Keep paged queries small enough to avoid huge payloads.
- Prefer project assets and reflected APIs over remembered Unity API details.
- Do not assume packages such as TMP, Input System, Cinemachine, ProBuilder, URP, or HDRP are present. Detect them first.
- Treat screenshots as verification, not decoration.

## Reference

Read `references/editor-mcp-workflow.md` for the resource order, verification loop, and recovery checklist.
