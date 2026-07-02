# Unity CI Builds

Prefer the project's existing pipeline. This is a fallback shape for GitHub Actions with GameCI.

## Licensing (blocks everything else)

- GameCI's `game-ci/unity-builder` needs Unity license secrets. Personal license: activate once locally, store the `.ulf` file contents as the `UNITY_LICENSE` secret. Pro/Plus: `UNITY_SERIAL` + `UNITY_EMAIL` + `UNITY_PASSWORD` secrets.
- Missing or wrong-version license fails activation, not the build. If activation fails, report it as a licensing blocker with the secret names above; do not retry-loop.
- Pin `unityVersion` to the exact value in `ProjectSettings/ProjectVersion.txt`.

## Workflow skeleton

```yaml
name: build
on: [workflow_dispatch]
jobs:
  build-win64:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { lfs: true }
      - uses: actions/cache@v4
        with:
          path: Library
          key: Library-Win64-${{ hashFiles('Packages/packages-lock.json', 'ProjectSettings/ProjectSettings.asset') }}
          restore-keys: Library-Win64-
      - uses: game-ci/unity-builder@v4
        env:
          UNITY_LICENSE: ${{ secrets.UNITY_LICENSE }}
          UNITY_EMAIL: ${{ secrets.UNITY_EMAIL }}
          UNITY_PASSWORD: ${{ secrets.UNITY_PASSWORD }}
        with:
          targetPlatform: StandaloneWindows64
          # buildMethod: BuildScript.BuildWin64  # omit to use GameCI's default builder
      - uses: actions/upload-artifact@v4
        with: { name: Win64, path: build/StandaloneWindows64 }
```

## Library caching

- Caching `Library/` is the single biggest CI speedup (import + incremental il2cpp cache). Key it on `packages-lock.json` and `ProjectSettings.asset`; a stale restore-key hit is still faster than a cold import.
- Do not cache `Builds/` or `Logs/`.

## Android secrets

Base64-encode the keystore into a secret, decode in a step before the build, and pass path/passwords as env vars consumed by the build method. Never commit a keystore or echo its passwords into logs.

## Self-hosted Windows runners for IL2CPP

- GameCI's default Linux docker images cannot produce Windows IL2CPP players. GameCI also publishes Windows editor images and unity-builder supports Windows runners, but they are slower and less mature - verify against current GameCI docs before relying on them. Otherwise `StandaloneWindows64` + IL2CPP needs a Windows machine with the Unity editor, the Windows IL2CPP module, and the Visual Studio C++ workload installed.
- Practical setup: a self-hosted Windows runner with the pinned editor pre-installed via Unity Hub, running the batchmode templates from `references/build-commands.md` directly, keeping `Library/` on disk between runs instead of using the cache action.
- iOS: any runner can export the Xcode project; producing a signed .ipa additionally needs a macOS runner with Xcode and signing assets (separate job, out of scope without credentials).
