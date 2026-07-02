---
name: unity-profile
description: Do evidence-based Unity performance work by measuring a baseline, fixing the single top cost, and verifying with numbers. Use when the game stutters or hitches, frame rate is below target, GC spikes appear, memory grows, loads are slow, draw calls balloon, or anyone asks to "optimize" something without a profile in hand.
---

# Unity Profile And Optimize

## Overview

Performance work without measurement is guessing. Every change must be justified by a captured cost and verified by re-measuring the same scenario. Report numbers, never adjectives.

## Workflow

1. **Measure a baseline**
   - Pick the tool that answers the question: Profiler window (or a profiler capture via unity-mcp when available) for frame costs; ProfilerRecorder counters inside a PlayMode test for repeatable numbers; Memory Profiler snapshots (two, then diff) for memory and leaks; Frame Debugger for draw calls and overdraw; Physics Debugger for collider and contact counts.
   - Fix the scenario: same scene, same actions, enough frames to be stable. Save the numbers before touching code.
   - Profile where the question lives. Editor numbers lie for player-only costs (IL2CPP vs Mono, stripping, device GPU, IO, thermals). If the complaint is about the player, use a development build on the target device; see references.

2. **Identify the top cost**
   - Decide CPU-bound vs GPU-bound first: main thread dominated by `Gfx.WaitForPresent` (or `WaitForTargetFPS`) means GPU-bound or vsync-capped; dominated by script/render markers means CPU-bound.
   - Name ONE top cost with evidence: marker name, ms, thread, GC bytes, counts. "It feels slow" is not a diagnosis.

3. **Fix one bounded thing**
   - Apply exactly one fix per cycle: cache lookups (`GetComponent`, `Find`, `Camera.main`), pool spawned objects, remove per-frame allocations (strings, LINQ, closures, boxing), batch/atlas, add LOD/culling, make loads async. No drive-by refactors while measuring.

4. **Verify against the baseline**
   - Re-run the identical scenario and compare to the saved numbers: "4.2 ms -> 1.1 ms on marker X, GC 2.4 KB/frame -> 0". If the numbers did not improve, revert the change and say so.

5. **Guard the win**
   - Add a PlayMode performance test with a budget assertion (ProfilerRecorder snippet in references), or record the agreed budget where the project keeps such docs, so the win cannot silently regress.

## Performance Triage

Symptom to first tool:

- **GC spikes / periodic hitches**: Profiler GC Alloc column, or ProfilerRecorder "GC Allocated In Frame"; find the per-frame allocators, not the collection itself.
- **Main-thread stalls**: Timeline view to see what blocks; narrow the repro first, then Deep Profile only the narrow capture (deep profiling distorts whole-scene numbers).
- **GPU-bound vs CPU-bound**: `Gfx.WaitForPresent` dominant = GPU (resolution, overdraw, shader cost); script time dominant = CPU.
- **Overdraw / draw calls**: Frame Debugger; check SRP Batcher compatibility of shaders/materials, then batching and instancing.
- **UI cost**: `Canvas.SendWillRenderCanvases` / layout markers; split canvases by change frequency, avoid Layout Groups and per-frame element toggling in hot paths.
- **Physics cost**: Fixed Timestep vs frame rate (FixedUpdate can run multiple times per frame), collider counts and mesh colliders, non-alloc query variants.
- **Loading hitches**: synchronous `Resources.Load` or Addressables `.WaitForCompletion` on the main thread; move to async and spread instantiation across frames.

## Budgets

Agree numeric budgets before optimizing, not after: ms/frame at target FPS (16.6 ms at 60), GC B/frame in steady state (approximately 0), draw calls, memory ceiling, load seconds. Table template in `references/performance-budgets.md`. Without a budget, "optimized" has no pass/fail.

## Stop Conditions

Stop and ask before:

- Optimizing anything you cannot measure (no profiler access, no development build, no target device). State exactly what remains unmeasured instead of guessing.
- Fixes requiring an architecture change, a package addition (including Memory Profiler), or ProjectSettings changes (Fixed Timestep, quality levels, graphics settings).
- Changes that would alter gameplay behavior, simulation determinism, or visual quality beyond an agreed tolerance.

## Final Report

- Baseline: tool, scenario, numbers (marker, ms, GC bytes, counts) and where measured (editor / dev build / device).
- Diagnosis: the single top cost, with evidence.
- Fix: the one change made and files touched.
- After: same-scenario numbers with the delta vs baseline.
- Guard: performance test added or budget documented.
- Unmeasured: what could not be captured and why.

## Reference

Read `references/performance-budgets.md` for the budget table template, the ProfilerRecorder PlayMode test snippet, and device capture setup.
