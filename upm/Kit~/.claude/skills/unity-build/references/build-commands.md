# Unity Build Commands

Prefer project-specific commands when they exist. These templates are fallbacks.

For game-pipeline Prepare delivery, run these commands only in a separate clean detached worktree at the reviewed local commit. Before using a template, load `Invoke-GuardedUnity` and its protected-content manifest helpers from `$unity-validate`'s `references/validation-commands.md`. The wrapper performs its postflight in `finally`, so a failed Unity process cannot bypass source-mutation detection. A missing build entry point returns the task to Execute; do not create or edit one during Prepare delivery.

## Windows PowerShell

Set `UNITY_EDITOR` to the full Unity executable path matching `ProjectSettings/ProjectVersion.txt`:

```powershell
$env:UNITY_EDITOR = "<path-to-unity-editor-executable>"
$env:AGENT_BASE_SHA = "<full-recorded-base-sha>"
$env:AGENT_SOURCE_HEAD = "<full-recorded-source-head>"
$env:AGENT_CANDIDATE_TREE = "<reviewed-candidate-tree-sha>"
$env:AGENT_TASK_FINGERPRINT = "<reviewed-task-content-sha256>"
$env:AGENT_TASK_PATHS_FILE = "<frozen-task-paths-json>"
$env:AGENT_EVIDENCE_ATTEMPT = "<next-positive-attempt-number>"
$env:AGENT_EVIDENCE_ROOT = Join-Path "<persistent-ignored-evidence-root>" (Join-Path $env:AGENT_CANDIDATE_TREE ("attempt-" + $env:AGENT_EVIDENCE_ATTEMPT))
$env:AGENT_DELIVERY_COMMIT = "<exact-reviewed-local-delivery-commit>"
New-Item -ItemType Directory -Force Builds, Logs | Out-Null
```

Confirm that the selected editor is the exact project version before invoking the guard. Do not silently fall back to another installed Unity version.

Use this build wrapper after loading `$unity-validate`'s guard. A fresh detached commit worktree normally has no ignored Addressables player data. When Addressables is installed, the wrapper proves the known generated paths are absent and ignored, records them, then removes only those newly generated paths before the guard's postflight. Any other source/settings mutation still blocks the build. Do not use this cleanup in a shared checkout.

```powershell
function Invoke-GuardedPlayerBuild {
    param([Parameter(Mandatory = $true)][scriptblock] $BuildOperation)

    $deliveryCommit = $env:AGENT_DELIVERY_COMMIT
    if ([string]::IsNullOrWhiteSpace($deliveryCommit) -or $deliveryCommit -notmatch '^[0-9a-fA-F]{40,64}$') {
        throw "AGENT_DELIVERY_COMMIT must be the full reviewed local delivery commit ID."
    }
    $deliveryCommit = $deliveryCommit.ToLowerInvariant()
    Assert-GitObjectType -ObjectId $deliveryCommit -ExpectedType "commit" -Label "Delivery commit"

    [string[]] $headOutput = @(& git -C $projectRoot rev-parse --verify HEAD)
    if ($LASTEXITCODE -ne 0 -or $headOutput.Count -ne 1 -or $headOutput[0].Trim().ToLowerInvariant() -ne $deliveryCommit) {
        throw "Build worktree HEAD must equal AGENT_DELIVERY_COMMIT $deliveryCommit."
    }
    & git -C $projectRoot symbolic-ref -q HEAD 2>$null
    if ($LASTEXITCODE -eq 0) { throw "Build worktree must be detached at the delivery commit." }

    [string[]] $deliveryTreeOutput = @(& git -C $projectRoot rev-parse --verify ($deliveryCommit + "^{tree}"))
    if ($LASTEXITCODE -ne 0 -or $deliveryTreeOutput.Count -ne 1 -or $deliveryTreeOutput[0].Trim().ToLowerInvariant() -ne $candidateTree) {
        throw "Delivery commit tree must equal AGENT_CANDIDATE_TREE $candidateTree."
    }
    [string[]] $gitDirOutput = @(& git -C $projectRoot rev-parse --absolute-git-dir)
    [string[]] $commonDirOutput = @(& git -C $projectRoot rev-parse --path-format=absolute --git-common-dir)
    if ($LASTEXITCODE -ne 0 -or $gitDirOutput.Count -ne 1 -or $commonDirOutput.Count -ne 1) {
        throw "Could not prove the build checkout is a linked worktree."
    }
    $gitDir = [System.IO.Path]::GetFullPath($gitDirOutput[0].Trim()).TrimEnd([char[]]@('\', '/'))
    $commonDir = [System.IO.Path]::GetFullPath($commonDirOutput[0].Trim()).TrimEnd([char[]]@('\', '/'))
    if ([string]::Equals($gitDir, $commonDir, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Player builds for Prepare delivery must run from a separate linked worktree, not the primary checkout."
    }
    $buildPreflight = [ordered]@{
            delivery_commit = $deliveryCommit
            delivery_tree   = $candidateTree
            detached        = $true
            git_dir         = $gitDir
            git_common_dir  = $commonDir
        }
    [System.IO.File]::WriteAllText((Join-Path $evidenceRoot "build-commit-preflight.json"), ($buildPreflight | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false)))

    $packageManifest = Get-Content -LiteralPath (Join-Path $projectRoot "Packages/manifest.json") -Raw | ConvertFrom-Json
    $usesAddressables = $null -ne $packageManifest.dependencies.'com.unity.addressables'
    $streamingRoot = Join-Path $projectRoot "Assets/StreamingAssets/aa"
    $streamingMeta = Join-Path $projectRoot "Assets/StreamingAssets/aa.meta"
    $addressablesDataRoot = Join-Path $projectRoot "Assets/AddressableAssetsData"

    if ($usesAddressables) {
        if ((Test-Path -LiteralPath $streamingRoot) -or (Test-Path -LiteralPath $streamingMeta)) {
            throw "Fresh build worktree already contains ignored Addressables player data; refusing cleanup."
        }
        $existingBins = @()
        if (Test-Path -LiteralPath $addressablesDataRoot) {
            $existingBins = @(Get-ChildItem -LiteralPath $addressablesDataRoot -Recurse -Force -File | Where-Object { $_.Name -like "*.bin*" })
        }
        if ($existingBins.Count -gt 0) { throw "Fresh build worktree already contains Addressables .bin output; refusing cleanup." }

        foreach ($probe in @(
            "Assets/StreamingAssets/aa/.agent-guard-probe",
            "Assets/StreamingAssets/aa.meta",
            "Assets/AddressableAssetsData/AgentGuard/agent.bin"
        )) {
            & git -C $projectRoot check-ignore -q --no-index -- $probe
            if ($LASTEXITCODE -ne 0) { throw "Expected generated Addressables path is not ignored: $probe" }
        }
    }

    Invoke-GuardedUnity {
        try {
            & $BuildOperation
        }
        finally {
            if ($usesAddressables) {
                $generated = [System.Collections.Generic.List[string]]::new()
                if (Test-Path -LiteralPath $streamingRoot) {
                    Get-ChildItem -LiteralPath $streamingRoot -Recurse -Force -File | ForEach-Object {
                        $generated.Add($_.FullName.Substring($projectRoot.Length).TrimStart([char[]]@('\', '/')).Replace('\', '/'))
                    }
                    Remove-Item -LiteralPath $streamingRoot -Recurse -Force
                }
                if (Test-Path -LiteralPath $streamingMeta) {
                    $generated.Add("Assets/StreamingAssets/aa.meta")
                    Remove-Item -LiteralPath $streamingMeta -Force
                }
                if (Test-Path -LiteralPath $addressablesDataRoot) {
                    Get-ChildItem -LiteralPath $addressablesDataRoot -Recurse -Force -File | Where-Object { $_.Name -like "*.bin*" } | ForEach-Object {
                        $relative = $_.FullName.Substring($projectRoot.Length).TrimStart([char[]]@('\', '/')).Replace('\', '/')
                        & git -C $projectRoot check-ignore -q --no-index -- $relative
                        if ($LASTEXITCODE -ne 0) { throw "Refusing to remove non-ignored Addressables output: $relative" }
                        $generated.Add($relative)
                        Remove-Item -LiteralPath $_.FullName -Force
                    }
                }
                [System.IO.File]::WriteAllLines((Join-Path $evidenceRoot "addressables-generated-paths.txt"), $generated, (New-Object System.Text.UTF8Encoding($false)))
            }
        }
    }
}
```

## Win64 player

```powershell
Invoke-GuardedPlayerBuild {
    & $env:UNITY_EDITOR -batchmode -quit -projectPath $projectRoot -buildTarget Win64 -executeMethod BuildScript.BuildWin64 -logFile "Logs/BuildWin64.log"
    if ($LASTEXITCODE -ne 0) {
        throw "Win64 build failed with exit code $LASTEXITCODE."
    }
}
```

## Unity 6+ build profile

If the project has BuildProfile assets, prefer them over hand-rolled scripts. `-activeBuildProfile` only selects the profile; a build entry point is still required (`BuildActiveProfile` from the BuildScript below):

```powershell
Invoke-GuardedPlayerBuild {
    & $env:UNITY_EDITOR -batchmode -quit -projectPath $projectRoot -activeBuildProfile "Assets/Settings/Build Profiles/Win64.asset" -executeMethod BuildScript.BuildActiveProfile -logFile "Logs/BuildProfile.log"
    if ($LASTEXITCODE -ne 0) {
        throw "Build-profile build failed with exit code $LASTEXITCODE."
    }
}
```

## Android

Supply keystore data through env vars; the build script must copy them into `PlayerSettings` each run (passwords are never persisted):

```powershell
$env:ANDROID_KEYSTORE_PATH = "<path-to-keystore.keystore>"
$env:ANDROID_KEYSTORE_PASS = "<keystore-password>"
$env:ANDROID_KEYALIAS_NAME = "<alias>"
$env:ANDROID_KEYALIAS_PASS = "<alias-password>"
Invoke-GuardedPlayerBuild {
    & $env:UNITY_EDITOR -batchmode -quit -projectPath $projectRoot -buildTarget Android -executeMethod BuildScript.BuildAndroid -logFile "Logs/BuildAndroid.log"
    if ($LASTEXITCODE -ne 0) {
        throw "Android build failed with exit code $LASTEXITCODE."
    }
}
```

If any keystore variable is missing for a release build, stop and report it. Do not generate a keystore.

## iOS (export only)

```powershell
Invoke-GuardedPlayerBuild {
    & $env:UNITY_EDITOR -batchmode -quit -projectPath $projectRoot -buildTarget iOS -executeMethod BuildScript.BuildIOS -logFile "Logs/BuildIOS.log"
    if ($LASTEXITCODE -ne 0) {
        throw "iOS export failed with exit code $LASTEXITCODE."
    }
}
```

Output is an Xcode project directory (`Builds/iOS/`). Archiving and signing happen in Xcode on macOS; report the export as the artifact.

## Minimal BuildScript

Place at `Assets/Editor/BuildScript.cs` (or inside an editor-only asmdef). Keystore assignments dirty in-memory PlayerSettings; do not commit any resulting `ProjectSettings` diff.

This is an Execute-stage authoring example, not permission to add build code during Prepare delivery. After adding it, rematerialize, validate, and review a new candidate before attempting the build.

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
        Finish(Build(BuildTarget.StandaloneWindows64, "Builds/Win64/Game.exe"));

    public static void BuildAndroid()
    {
        bool previousUseCustomKeystore = PlayerSettings.Android.useCustomKeystore;
        string previousKeystoreName = PlayerSettings.Android.keystoreName;
        string previousKeystorePass = PlayerSettings.Android.keystorePass;
        string previousKeyaliasName = PlayerSettings.Android.keyaliasName;
        string previousKeyaliasPass = PlayerSettings.Android.keyaliasPass;

        BuildReport report;
        try
        {
            PlayerSettings.Android.useCustomKeystore = true;
            PlayerSettings.Android.keystoreName = Environment.GetEnvironmentVariable("ANDROID_KEYSTORE_PATH");
            PlayerSettings.Android.keystorePass = Environment.GetEnvironmentVariable("ANDROID_KEYSTORE_PASS");
            PlayerSettings.Android.keyaliasName = Environment.GetEnvironmentVariable("ANDROID_KEYALIAS_NAME");
            PlayerSettings.Android.keyaliasPass = Environment.GetEnvironmentVariable("ANDROID_KEYALIAS_PASS");
            // EditorUserBuildSettings.buildAppBundle = true; // AAB for store release
            report = Build(BuildTarget.Android, "Builds/Android/Game.apk");
        }
        finally
        {
            PlayerSettings.Android.useCustomKeystore = previousUseCustomKeystore;
            PlayerSettings.Android.keystoreName = previousKeystoreName;
            PlayerSettings.Android.keystorePass = previousKeystorePass;
            PlayerSettings.Android.keyaliasName = previousKeyaliasName;
            PlayerSettings.Android.keyaliasPass = previousKeyaliasPass;
        }

        Finish(report);
    }

    public static void BuildIOS() =>
        Finish(Build(BuildTarget.iOS, "Builds/iOS")); // exports an Xcode project directory

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

    static BuildReport Build(BuildTarget target, string outputPath)
    {
        BuildReport report = BuildPipeline.BuildPlayer(Scenes, outputPath, target, BuildOptions.None);
        Console.WriteLine($"Build {report.summary.result}: {report.summary.totalSize} bytes, {report.summary.totalErrors} errors");
        return report;
    }

    static void Finish(BuildReport report)
    {
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
        return;
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
