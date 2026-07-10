---
name: unity-build
description: Produce and automate Unity player builds via batchmode CLI, editor build scripts, and CI. Use when asked to build the game or a player for Win64/Android/iOS, add or fix a -executeMethod build entry point, set up CI builds, diagnose an IL2CPP or build failure, or locate and report the built artifact.
---

# Unity Build Player

## Overview

Produce a player build using the project's existing entry points when they exist, or a minimal reproducible one when they do not. Never claim a build succeeded unless the command exited 0 and the log confirms it. Never touch signing material or ProjectSettings without approval.

## Intent Gate

- For "locate the artifact" or read-only build diagnosis, inspect existing scripts, commands, logs, reports, and outputs, then report and stop. Do not author an entry point, change code/settings, or start a new build unless the user asked to build or reproduce the failure.
- For an explicit build, automation, or fix request, continue through the mutating workflow below.
- In game-pipeline Prepare delivery, require the reviewed local commit and build it from a separate clean detached worktree. That stage is build-only: missing or changed build code returns to Execute.

## Workflow

1. **Discover entry points first**
   - Search for existing build code: `rg "BuildPipeline.BuildPlayer|BuildPlayerOptions|executeMethod" Assets` and static methods under `Assets/**/Editor/`.
   - Check CI configs (`.github/workflows`, GitLab/Jenkins files) for commands the team already trusts.
   - On Unity 6+, look for BuildProfile assets (commonly `Assets/Settings/Build Profiles/*.asset`); batchmode accepts `-activeBuildProfile <asset-path>`.
   - Prefer project commands over invented ones. If the layout is unclear, run $unity-orient first.

2. **Establish the guarded snapshot**
   - In Prepare delivery, mechanically confirm the build runs from a separate linked worktree detached at the exact reviewed delivery commit and that commit's tree SHA matches the candidate tree.
   - Read `ProjectSettings/ProjectVersion.txt` and prove the configured editor executable matches the exact version.
   - Capture the recursive protected-content manifest from `$unity-validate` before the build; run its postflight in `finally` on success or failure.

3. **Confirm target and backend**
   - Read `ProjectSettings/ProjectVersion.txt` for the exact editor version and `ProjectSettings/ProjectSettings.asset` for scripting backend (Mono vs IL2CPP) and stripping level. Do not change them; see Stop Conditions.

4. **Author an entry point only if none exists**
   - Minimal static method callable with `-executeMethod`, placed in an Editor folder or editor-only asmdef, never a runtime assembly. Example in `references/build-commands.md`.
   - Output to the project's convention, else `Builds/<Platform>/`. Keep `Builds/` and `Logs/` out of version control.
   - Never author or edit it during game-pipeline Prepare delivery. Return to Execute, use the one writer, then simplify, materialize a new candidate, validate, and review before building.

5. **Order content before player**
   - If `Packages/manifest.json` contains `com.unity.addressables`, run the Addressables content build BEFORE `BuildPlayer`. A player built against stale or missing content fails at runtime, not at build time. Snippet in references.
   - Addressables may create ignored `Assets/StreamingAssets/aa*` and `AddressableAssetsData/*/*.bin*` player output. In the disposable build worktree only, use the reference wrapper that requires those paths to be initially absent/ignored, records and removes just the generated outputs before protected-content postflight, and rejects any other mutation. Never relax the guard for a shared checkout or pre-existing content.

6. **Run the build**
   - Batchmode with `-logFile` and an explicit exit-code check inside the guarded `try/finally`; per-platform templates in `references/build-commands.md`.
   - Compile errors block builds. Fix them first: unity-validate for a cheap compile check, unity-debug for root cause.

7. **Parse the log**
   - On failure, find the FIRST actionable error searching from the top, not the last line: `error CS`, `Error building Player`, `UnityLinker`, `il2cpp`, exceptions in build callbacks.
   - On success, capture the Build Report size section for the final report.
   - During Prepare delivery, triage only. Any required repository change - source, build script, asset, package, or setting - returns to Execute; environment, toolchain, module, license, or credential failures block Prepare without mutating the build worktree.

8. **Verify the artifact and unchanged source**
   - Confirm the output exists at the expected path and record its size. For iOS the artifact is an exported Xcode project directory, not an .ipa.
   - Require the post-build protected-content manifest and commit tree to remain unchanged. Preserve/report any mutated worktree; never accept generated tracked content after review.

## Platform Notes

- **Win64**: `-buildTarget Win64`; output is `Game.exe` plus `Game_Data/` (and `GameAssembly.dll` under IL2CPP, which needs the Windows IL2CPP editor module plus a Visual Studio C++ toolchain).
- **Android**: release builds need a keystore. Unity does not read keystore passwords from env vars by itself; the build script must copy env values into `PlayerSettings.Android.keystoreName/keystorePass/keyaliasName/keyaliasPass` on every batchmode run (passwords are not persisted). APK vs AAB via `EditorUserBuildSettings.buildAppBundle`. Requires the Android SDK/NDK/JDK editor modules.
- **iOS**: batchmode only EXPORTS an Xcode project (output path is a directory). Signing and .ipa creation require Xcode on macOS. Report the exported project as the artifact and say so explicitly.
- **Mono vs IL2CPP**: Mono builds fastest for dev loops; IL2CPP is mandatory on iOS and standard for Android release. Switching backends is a ProjectSettings change - ask first.

## IL2CPP Failure Triage

- **Works in editor, `MissingMethodException`/`TypeLoadException` in player**: managed stripping removed reflection-only code. Preserve via `link.xml` (assembly/namespace/type entries) or `[Preserve]`. Lowering Managed Stripping Level is a ProjectSettings change - ask first.
- **`ExecutionEngineException: ... no ahead of time (AOT) code was generated`**: value-type generic instantiation missing under AOT. Reference the concrete instantiation in compiled code (a dummy method that instantiates it) or use a reference type argument (shared generic path).
- **`Reflection.Emit`, runtime codegen, compiled expression trees**: unsupported under AOT. Replace with source generators, pre-generated code, or interpreted fallbacks.
- **Toolchain errors**: Android needs SDK/NDK Hub modules; iOS needs Xcode; Windows needs the C++ workload. Report the exact missing module; installing modules or licenses is out of scope.
- **Very long IL2CPP builds**: keep `Library/` between builds - it holds the incremental il2cpp build cache. Clean it only when the cache itself is corrupt, and say why.

## Stop Conditions

Stop and ask before:

- Anything involving missing signing identities, keystores, provisioning profiles, or store credentials. Never generate, guess, or commit them silently.
- Changing ProjectSettings: scripting backend, stripping level, persistent player settings, or a platform switch that rewrites settings.
- Installing editor modules, platform support, or anything requiring a license the machine does not have.
- Adding packages (including Addressables) to make a build path work.
- In Prepare delivery, a missing build entry point or any source/asset/package/settings mutation. Return to Execute instead of fixing it in the build worktree.

## Final Report

- Entry point: project script, BuildProfile, or new BuildScript path.
- Exact command run, exit code, log path.
- Artifact: absolute output path and size, or first actionable error with its log location.
- Content build: Addressables built, or not applicable.
- Snapshot: delivery commit/tree, exact Unity version, and protected-content manifest result.
- Not verified: e.g. "iOS export only, no signed .ipa", "Android debug-signed only".

## Reference

Read `references/build-commands.md` for batchmode templates, the minimal BuildScript, and the Addressables ordering snippet. Read `references/ci.md` for GitHub Actions/GameCI licensing, Library caching, and IL2CPP runner notes.
