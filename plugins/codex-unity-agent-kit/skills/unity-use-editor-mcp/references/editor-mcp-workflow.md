# Unity Editor MCP Workflow

## Resource Order

1. List Unity instances when routing is ambiguous.
2. Read editor state.
3. Read project info.
4. Read console errors and warnings.
5. Inspect scene hierarchy, selected GameObjects, assets, cameras, packages, or tests.
6. Mutate with tools.
7. Verify with console, screenshots, test jobs, or refreshed resources.

## Script Changes

After creating or editing scripts through MCP or filesystem tools:

1. Wait until `isCompiling` or equivalent editor state is false.
2. Check console errors with stack traces.
3. Only then attach new components, run tests, or enter PlayMode.

## Scene and Prefab Changes

- Resolve target GameObject by id/path, not by guessed name.
- Use paged hierarchy queries for large scenes.
- Prefer batch operations for repeated independent changes.
- Capture screenshots for camera, UI, spatial layout, lighting, or visual tasks.
- Save scenes or prefabs only when persistence is expected.

## Recovery

- If Unity is busy, wait and reread editor state.
- If connection drops during domain reload, wait briefly and reconnect.
- If a stale file or SHA error appears, reread the file or asset state before retrying.
- If a tool payload fails, inspect the component/resource schema and adapt field names or types.
