---
name: unity-build
description: Produce and automate Unity player builds via batchmode CLI, editor build scripts, and CI. Use when asked to build the game or a player for Win64/Android/iOS, add or fix a -executeMethod build entry point, set up CI builds, diagnose an IL2CPP or build failure, or locate and report the built artifact.
---

# Unity Build Player

## Overview

Produce a player build using the project's existing entry points when they exist, or a minimal reproducible one when they do not. Never claim a build succeeded unless the command exited 0 and the log confirms it. Never touch signing material or ProjectSettings without approval.

## Workflow

1. **Discover entry points first**
   - Search for existing build code: `rg "BuildPipeline.BuildPlayer|BuildPlayerOptions|executeMethod" Assets` and static methods under `Assets/**/Editor/`.
   - Check CI configs (`.github/workflows`, GitLab/Jenkins files) for commands the team already trusts.
   - On Unity 6+, look for BuildProfile assets (commonly `Assets/Settings/Build Profiles/*.asset`); batchmode accepts `-activeBuildProfile <asset-path>`.
   - Prefer project commands over invented ones. If the layout is unclear, run unity-orient first.

2. **Confirm target and backend**
   - Read `ProjectSettings/ProjectVersion.txt` for the exact editor version and `ProjectSettings/ProjectSettings.asset` for scripting backend (Mono vs IL2CPP) and stripping level. Do not change them; see Stop Conditions.

3. **Author an entry point only if none exists**
   - Minimal static method callable with `-executeMethod`, placed in an Editor folder or editor-only asmdef, never a runtime assembly. Example in `references/build-commands.md`.
   - Output to the project's convention, else `Builds/<Platform>/`. Keep `Builds/` and `Logs/` out of version control.

4. **Order content before player**
   - If `Packages/manifest.json` contains `com.unity.addressables`, run the Addressables content build BEFORE `BuildPlayer`. A player built against stale or missing content fails at runtime, not at build time. Snippet in references.

5. **Run the build**
   - Batchmode with `-logFile` and an explicit exit-code check; per-platform templates in `references/build-commands.md`.
   - Compile errors block builds. Fix them first: unity-validate for a cheap compile check, unity-debug for root cause.

6. **Parse the log**
   - On failure, find the FIRST actionable error searching from the top, not the last line: `error CS`, `Error building Player`, `UnityLinker`, `il2cpp`, exceptions in build callbacks.
   - On success, capture the Build Report size section for the final report.

7. **Verify the artifact**
   - Confirm the output exists at the expected path and record its size. For iOS the artifact is an exported Xcode project directory, not an .ipa.

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

## Final Report

- Entry point: project script, BuildProfile, or new BuildScript path.
- Exact command run, exit code, log path.
- Artifact: absolute output path and size, or first actionable error with its log location.
- Content build: Addressables built, or not applicable.
- Not verified: e.g. "iOS export only, no signed .ipa", "Android debug-signed only".

## Reference

Read `references/build-commands.md` for batchmode templates, the minimal BuildScript, and the Addressables ordering snippet. Read `references/ci.md` for GitHub Actions/GameCI licensing, Library caching, and IL2CPP runner notes.
