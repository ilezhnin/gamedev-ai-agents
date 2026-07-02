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
- Project contracts when present: `AGENTS.md` at the root (module map, routing); `ARCHITECTURE.md`, `CODE_STYLE.md`, `DEPENDENCIES.md` under `.agents/` (kit default) or at the root; `.agents/learnings.md`.
- `Packages/` subdirectories: embedded packages carry their own asmdefs, tests, and metas.

## Search Patterns

Use `rg --files` first, then targeted `rg`:

```text
rg --files -g "*.cs" -g "*.asmdef" -g "*.asmref" -g "*.unity" -g "*.prefab" -g "*.asset"
rg "class TargetName|interface TargetName|enum TargetName" Assets
rg "SerializeField|FormerlySerializedAs|CreateAssetMenu" Assets
rg "Update\\(|FixedUpdate\\(|OnEnable\\(|OnDisable\\(|OnDestroy\\(" Assets
```

Scenes, prefabs, and assets - query, do not read wholesale:

```text
# Which scenes/prefabs reference a script (by its .meta guid)?
rg -l "guid: <guid-from-script-meta>" Assets -g "*.unity" -g "*.prefab" -g "*.asset"

# Where does a serialized field or object name appear in YAML?
rg "m_Name: TargetName|targetFieldName:" Assets -g "*.unity" -g "*.prefab"

# Which prefabs nest a given prefab?
rg -l "guid: <prefab-meta-guid>" Assets -g "*.prefab" -g "*.unity"
```

Entry points and composition:

```text
rg "static void Main|RuntimeInitializeOnLoadMethod|InitializeOnLoad" Assets
rg "DontDestroyOnLoad|SceneManager.LoadScene" Assets
rg "AddComponent<|GetComponent<" Assets --count-matches   # hotspots of runtime wiring
```

## Assembly Map

For each relevant `.asmdef`, note: name, runtime/editor/test, references, and whether `Assembly-CSharp` (no asmdef) still owns code. Cross-assembly changes need this map first; `rg "\"references\"" -A 10 <asmdef>` is usually enough.

## Validation Discovery

- Test framework present? `com.unity.test-framework` in the manifest + `Tests/` asmdefs.
- Project-specific scripts: `Assets/Editor/**/Build*.cs`, CI configs, `.agents/scripts/`.
- `UNITY_EDITOR` env var or Unity Hub install matching `ProjectVersion.txt` for batchmode runs.

## Output Template

Report only what helps the next step:

- Unity version and render pipeline:
- Relevant packages:
- Relevant assemblies:
- Candidate files (one line each on why):
- Serialization or asset risks:
- Validation options:
- Recommended next action:
