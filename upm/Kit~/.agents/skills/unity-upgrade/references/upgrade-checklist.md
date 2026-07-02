# Unity Upgrade Checklist

Windows PowerShell templates. Run from the Unity project root. Point `$env:UNITY_EDITOR` at the TARGET editor executable for each stage.

## Snapshot before anything

```powershell
git status --porcelain                       # must be empty
git switch -c upgrade/unity-<target>
New-Item -ItemType Directory -Force Logs | Out-Null
Copy-Item ProjectSettings/ProjectVersion.txt Logs/ProjectVersion.before.txt
Copy-Item Packages/packages-lock.json Logs/packages-lock.before.json
git rev-parse HEAD > Logs/upgrade-base-commit.txt
```

## Staged upgrade order

| Stage | Move                                       | Risk   | Gate before next stage                 |
| ----- | ------------------------------------------ | ------ | -------------------------------------- |
| 1     | current -> latest patch of same minor      | low    | compile + EditMode                      |
| 2     | -> next minor                              | medium | compile + EditMode + PlayMode           |
| 3     | -> next major (one at a time, prefer LTS)  | high   | full ladder + key scenes + build check  |

Repeat stage 3 once per major. Commit after every green gate. Never fold feature work into a stage commit.

## Editor stage: first open and compile check

```powershell
& $env:UNITY_EDITOR -batchmode -quit -accept-apiupdate -projectPath (Get-Location).Path -logFile "Logs/Upgrade-editor.log"
Select-String -Path "Logs/Upgrade-editor.log" -Pattern "error CS|Compilation failed|API Updater|obsolete" -CaseSensitive:$false
Get-Content ProjectSettings/ProjectVersion.txt        # confirm the version actually moved
```

Prefer an interactive first open when a desktop session is available so API Updater prompts and import progress are visible; `-accept-apiupdate` is the headless equivalent. The first import can take a long time; do not kill the process on a timeout without checking the log tail.

## Package stage: one bump at a time

Edit exactly one entry in `Packages/manifest.json`, then:

```powershell
& $env:UNITY_EDITOR -batchmode -quit -projectPath (Get-Location).Path -logFile "Logs/Upgrade-pkg-<name>.log"
git diff -- Packages/packages-lock.json               # only the requested package and its declared deps should move
```

Changelog of the currently cached version (the target version's changelog lives on docs.unity3d.com):

```powershell
Get-Content (Get-ChildItem "Library/PackageCache/com.unity.<name>@*/CHANGELOG.md" | Select-Object -First 1) -TotalCount 80
```

## Churn diff triage

```powershell
git status --porcelain | Measure-Object -Line                          # churn size
git diff --stat -- "*.meta" | Select-Object -Last 3                    # .meta churn volume
git diff -- "*.meta" | Select-String -Pattern '^[+-]guid:'             # ANY hit is a red flag
git diff -- "*.unity" "*.prefab" "*.asset" |
    Select-String -Pattern '^[+-].*serializedVersion' | Select-Object -First 5
git diff --stat -- "*.unity" "*.prefab"                                # concentrated churn = read it by hand
```

Safe churn is uniform: the same one-or-two-line change repeated across hundreds of files. Concentrated churn (few files, many lines) or any deleted component/reference block requires a manual read before commit.

## Validation ladder per stage

Minimum gate is a clean compile:

```powershell
& $env:UNITY_EDITOR -batchmode -quit -projectPath (Get-Location).Path -logFile "Logs/Stage-compile.log"
Select-String -Path "Logs/Stage-compile.log" -Pattern "error CS|Compilation failed" -CaseSensitive:$false
```

Then run EditMode/PlayMode using the unity-validate command templates, open key scenes through unity-mcp, and delegate a player build to unity-build when the stage gate requires it.

## Reporting wording

- "Stage 1 (2022.3.10f1 -> 2022.3.62f1): compile clean, EditMode passed, churn committed (uniform importer bumps)."
- "Stage blocked: API Updater left 12 errors in Assets/ThirdParty/<vendor>; stopping per stop conditions."
- "packages-lock diff shows a transitive bump of com.unity.burst that was not requested; investigating before commit."
- "Compile not verified: UNITY_EDITOR not set and target editor not installed."
