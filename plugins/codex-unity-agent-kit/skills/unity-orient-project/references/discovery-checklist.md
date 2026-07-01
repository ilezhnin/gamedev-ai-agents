# Unity Discovery Checklist

Use this when the project is unfamiliar or has more than one assembly/package.

## Root Signals

- `ProjectSettings/ProjectVersion.txt`: Unity editor version.
- `Packages/manifest.json`: render pipeline, Input System, test framework, TMP, Cinemachine, addressables, networking, ECS, localization.
- `Packages/packages-lock.json`: exact package versions.
- `Assets/**/*.asmdef`: runtime/editor/test assembly boundaries.
- `Assets/**/Tests/**`: test layout and naming.
- `ProjectSettings/EditorBuildSettings.asset`: scenes included in builds.
- `ProjectSettings/ProjectSettings.asset`: scripting backend, API compatibility, input mode, active color space.

## Search Patterns

Use `rg --files` first, then targeted `rg`:

```text
rg --files -g "*.cs" -g "*.asmdef" -g "*.asmref" -g "*.unity" -g "*.prefab" -g "*.asset"
rg "class TargetName|interface TargetName|enum TargetName" Assets
rg "SerializeField|FormerlySerializedAs|CreateAssetMenu" Assets
rg "Update\\(|FixedUpdate\\(|OnEnable\\(|OnDisable\\(|OnDestroy\\(" Assets
```

## Output Template

Report only what helps the next step:

- Unity version:
- Relevant packages:
- Relevant assemblies:
- Candidate files:
- Serialization or asset risks:
- Validation options:
- Recommended next action:
