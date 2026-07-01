# Unity Performance Budgets And Capture

## Budget table template

Agree these numbers with the owner before optimizing, then copy the filled table into the project's docs. Adjust tiers to the project's actual targets.

| Metric | Mobile min-spec | Mobile high-end | Desktop | Measured with |
|---|---|---|---|---|
| Frame time (ms) | 33.3 (30 FPS) | 16.6 (60 FPS) | 16.6 or 8.3 | Profiler on device |
| Main-thread scripts (ms) | <= 10 | <= 6 | <= 8 | PlayerLoop markers |
| GC alloc steady state (B/frame) | 0 | 0 | 0 | "GC Allocated In Frame" |
| SetPass calls / draw calls | project-specific | project-specific | project-specific | Frame Debugger / Rendering stats |
| Total memory (MB) | device tier limit | device tier limit | target-spec limit | Memory Profiler snapshot |
| Scene/level load (s) | agree per flow | agree per flow | agree per flow | stopwatch marker or test |

Steady state means gameplay after warmup; loads and one-shot spikes get their own line, not an excuse.

## ProfilerRecorder PlayMode budget test

Requires `com.unity.test-framework` (a `Unity.Profiling` recorder works in players and editor since 2020.2). Put it in a PlayMode test asmdef.

```csharp
using System.Collections;
using NUnit.Framework;
using Unity.Profiling;
using UnityEngine.TestTools;

public class FrameBudgetTests
{
    [UnityTest]
    public IEnumerator SteadyState_HasNoPerFrameGcAlloc()
    {
        // Arrange: load the target scene and reach steady state here.
        for (int i = 0; i < 30; i++) yield return null; // warmup

        using var gcAlloc = ProfilerRecorder.StartNew(ProfilerCategory.Memory, "GC Allocated In Frame");
        long total = 0;
        const int frames = 120;
        for (int i = 0; i < frames; i++)
        {
            yield return null;
            total += gcAlloc.LastValue;
        }
        long avg = total / frames;
        Assert.LessOrEqual(avg, 0, $"Avg GC alloc per frame: {avg} B over {frames} frames");
    }
}
```

Variants:

- Frame time: `ProfilerRecorder.StartNew(ProfilerCategory.Internal, "Main Thread", 15)` and average `GetSample(i).Value` (nanoseconds).
- A specific marker: `ProfilerRecorder.StartNew(ProfilerCategory.Scripts, "MyMarkerName")` for code instrumented with `ProfilerMarker`.
- Counter names vary by version; enumerate what exists with `ProfilerRecorderHandle.GetAvailable(...)` rather than guessing.
- Keep budget assertions slightly looser than the target (e.g. budget + 10-20%) so CI noise does not produce flaky failures; the budget table stays the real goal.

## Capturing on the target (development build)

Editor numbers lie for: IL2CPP vs Mono cost, stripping effects, device GPU and fill rate, storage IO, thermal throttling, and editor-only overhead. Confirm player-facing wins on the target tier.

1. Build with Development Build + Autoconnect Profiler enabled (or connect manually: Profiler window > target dropdown > device IP). This is a build option, not a ProjectSettings change.
2. Run the fixed scenario on the device; capture with the Profiler window connected to the player. Use unity-mcp profiler tooling for editor-side captures when it is available.
3. Deep Profile only a narrowed repro; it inflates all timings and makes whole-scene numbers meaningless.
4. Memory: take a snapshot, run the suspected leak path, take a second snapshot, and diff. The Memory Profiler package (`com.unity.memory-profiler`) may be absent; adding it needs approval.
5. GPU questions on device: Frame Debugger can connect to a development player; for hard GPU cases name the platform GPU profiler (RenderDoc, Xcode GPU capture, etc.) as the next step rather than guessing.

Record with every capture: device/tier, build type (editor, dev build, release), Unity version, and the exact scenario, or the before/after comparison is invalid.
