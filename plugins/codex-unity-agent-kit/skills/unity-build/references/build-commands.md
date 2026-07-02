# Unity Build Commands

Prefer project-specific commands when they exist. These templates are fallbacks.

## Windows PowerShell

Set `UNITY_EDITOR` to the full Unity executable path matching `ProjectSettings/ProjectVersion.txt`:

```powershell
$env:UNITY_EDITOR = "<path-to-unity-editor-executable>"
New-Item -ItemType Directory -Force Builds, Logs | Out-Null
```

## Win64 player

```powershell
& $env:UNITY_EDITOR -batchmode -quit -projectPath (Get-Location).Path -buildTarget Win64 -executeMethod BuildScript.BuildWin64 -logFile "Logs/BuildWin64.log"
if ($LASTEXITCODE -ne 0) {
    Select-String -Path "Logs/BuildWin64.log" -Pattern "error CS|Error building|Exception|Build failed" | Select-Object -First 20
}
```

## Unity 6+ build profile

If the project has BuildProfile assets, prefer them over hand-rolled scripts. `-activeBuildProfile` only selects the profile; a build entry point is still required (`BuildActiveProfile` from the BuildScript below):

```powershell
& $env:UNITY_EDITOR -batchmode -quit -projectPath (Get-Location).Path -activeBuildProfile "Assets/Settings/Build Profiles/Win64.asset" -executeMethod BuildScript.BuildActiveProfile -logFile "Logs/BuildProfile.log"
```

## Android

Supply keystore data through env vars; the build script must copy them into `PlayerSettings` each run (passwords are never persisted):

```powershell
$env:ANDROID_KEYSTORE_PATH = "<path-to-keystore.keystore>"
$env:ANDROID_KEYSTORE_PASS = "<keystore-password>"
$env:ANDROID_KEYALIAS_NAME = "<alias>"
$env:ANDROID_KEYALIAS_PASS = "<alias-password>"
& $env:UNITY_EDITOR -batchmode -quit -projectPath (Get-Location).Path -buildTarget Android -executeMethod BuildScript.BuildAndroid -logFile "Logs/BuildAndroid.log"
if ($LASTEXITCODE -ne 0) { Select-String -Path "Logs/BuildAndroid.log" -Pattern "error CS|Error building|Keystore|Gradle|Exception" | Select-Object -First 20 }
```

If any keystore variable is missing for a release build, stop and report it. Do not generate a keystore.

## iOS (export only)

```powershell
& $env:UNITY_EDITOR -batchmode -quit -projectPath (Get-Location).Path -buildTarget iOS -executeMethod BuildScript.BuildIOS -logFile "Logs/BuildIOS.log"
```

Output is an Xcode project directory (`Builds/iOS/`). Archiving and signing happen in Xcode on macOS; report the export as the artifact.

## Minimal BuildScript

Place at `Assets/Editor/BuildScript.cs` (or inside an editor-only asmdef). Keystore assignments dirty in-memory PlayerSettings; do not commit any resulting `ProjectSettings` diff.

```csharp
using System;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;

public static class BuildScript
{
    static string[] Scenes =>
        EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToArray();

    public static void BuildWin64() =>
        Build(BuildTarget.StandaloneWindows64, "Builds/Win64/Game.exe");

    public static void BuildAndroid()
    {
        PlayerSettings.Android.useCustomKeystore = true;
        PlayerSettings.Android.keystoreName = Environment.GetEnvironmentVariable("ANDROID_KEYSTORE_PATH");
        PlayerSettings.Android.keystorePass = Environment.GetEnvironmentVariable("ANDROID_KEYSTORE_PASS");
        PlayerSettings.Android.keyaliasName = Environment.GetEnvironmentVariable("ANDROID_KEYALIAS_NAME");
        PlayerSettings.Android.keyaliasPass = Environment.GetEnvironmentVariable("ANDROID_KEYALIAS_PASS");
        // EditorUserBuildSettings.buildAppBundle = true; // AAB for store release
        Build(BuildTarget.Android, "Builds/Android/Game.apk");
    }

    public static void BuildIOS() =>
        Build(BuildTarget.iOS, "Builds/iOS"); // exports an Xcode project directory

#if UNITY_6000_0_OR_NEWER
    // Entry point for the -activeBuildProfile command: builds whatever profile
    // the CLI flag activated. Unity 6+ only (BuildProfile API).
    public static void BuildActiveProfile()
    {
        var profile = UnityEditor.Build.Profile.BuildProfile.GetActiveBuildProfile();
        if (profile == null)
        {
            Console.WriteLine("No active build profile; pass -activeBuildProfile <asset path>.");
            EditorApplication.Exit(1);
            return;
        }
        BuildReport report = BuildPipeline.BuildPlayer(new BuildPlayerWithProfileOptions
        {
            buildProfile = profile,
            locationPathName = "Builds/Profile/Game",
        });
        Console.WriteLine($"Build {report.summary.result}: {report.summary.totalSize} bytes, {report.summary.totalErrors} errors");
        if (report.summary.result != BuildResult.Succeeded)
            EditorApplication.Exit(1);
    }
#endif

    static void Build(BuildTarget target, string outputPath)
    {
        BuildReport report = BuildPipeline.BuildPlayer(Scenes, outputPath, target, BuildOptions.None);
        Console.WriteLine($"Build {report.summary.result}: {report.summary.totalSize} bytes, {report.summary.totalErrors} errors");
        if (report.summary.result != BuildResult.Succeeded)
            EditorApplication.Exit(1);
    }
}
```

## Addressables before player

Requires an asmdef reference to `Unity.Addressables.Editor` (or place next to existing Addressables editor code). Run this instead of the bare player method when the project uses Addressables:

```csharp
using UnityEditor.AddressableAssets.Build;
using UnityEditor.AddressableAssets.Settings;

public static void BuildContentThenWin64()
{
    AddressableAssetSettings.BuildPlayerContent(out AddressablesPlayerBuildResult result);
    if (!string.IsNullOrEmpty(result.Error))
    {
        UnityEngine.Debug.LogError($"Addressables build failed: {result.Error}");
        UnityEditor.EditorApplication.Exit(1);
    }
    BuildWin64();
}
```

## Log Review

After each command, inspect the exit code and the `-logFile` output:

```powershell
# First actionable error (search from the top, not the tail)
Select-String -Path "Logs/Build*.log" -Pattern "error CS|Error building Player|UnityLinker|il2cpp|Exception" | Select-Object -First 10

# Success confirmation and size report
Select-String -Path "Logs/Build*.log" -Pattern "Build succeeded|Build Report|Total user assemblies"
```

Wording discipline:

- "Build ran: exit 0, artifact at Builds/Win64/Game.exe (183 MB)."
- "Build failed at IL2CPP step: see Logs/BuildWin64.log line N."
- "Not run: ANDROID_KEYSTORE_PATH is not set; next command is the Android template above."
