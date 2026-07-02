# Unity Validation Commands

Prefer project-specific commands when they exist. These templates are fallbacks.

## Windows PowerShell

Set `UNITY_EDITOR` to the full Unity executable path when possible:

```powershell
$env:UNITY_EDITOR = "<path-to-unity-editor-executable>"
```

Compile/open project in batchmode:

```powershell
& $env:UNITY_EDITOR -batchmode -nographics -quit -projectPath (Get-Location).Path -logFile "Logs/UnityCompile.log"
```

Run EditMode tests. Never combine `-quit` with `-runTests`: the editor can exit before the run finishes or results are written. The Test Framework exits on its own and sets the exit code:

```powershell
New-Item -ItemType Directory -Force Logs, TestResults | Out-Null
& $env:UNITY_EDITOR -batchmode -projectPath (Get-Location).Path -runTests -testPlatform EditMode -testResults "TestResults/EditMode.xml" -logFile "Logs/EditMode.log"
```

Run PlayMode tests (no `-quit`; omit `-nographics` unless the tests are known headless-safe):

```powershell
New-Item -ItemType Directory -Force Logs, TestResults | Out-Null
& $env:UNITY_EDITOR -batchmode -projectPath (Get-Location).Path -runTests -testPlatform PlayMode -testResults "TestResults/PlayMode.xml" -logFile "Logs/PlayMode.log"
```

Exit codes: 0 = all tests passed, 2 = some tests failed, other nonzero = run error; check the log for the first actionable error.

## Log Review

After each command, inspect:

- process exit code
- `Logs/*.log`
- `TestResults/*.xml`
- Unity console if using MCP

Search logs with:

```powershell
Select-String -Path "Logs/*.log" -Pattern "error CS|Exception|Compilation failed|Build failed|Test run failed" -CaseSensitive:$false
```

## Reporting

Use this wording discipline:

- "Ran EditMode tests: passed."
- "Unity batchmode failed before tests: see log path."
- "Not run: `UNITY_EDITOR` is not set and no Unity executable was found."
- "Static inspection only; Unity compilation remains unverified."
