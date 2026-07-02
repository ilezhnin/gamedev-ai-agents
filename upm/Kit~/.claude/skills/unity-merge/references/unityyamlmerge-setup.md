# UnityYAMLMerge Setup And Audit Commands

Windows PowerShell templates. Run from the repo root containing the Unity project.

## Locate UnityYAMLMerge

```powershell
$ver  = (Select-String -Path "ProjectSettings/ProjectVersion.txt" -Pattern 'm_EditorVersion: (\S+)').Matches[0].Groups[1].Value
$tool = "C:\Program Files\Unity\Hub\Editor\$ver\Editor\Data\Tools\UnityYAMLMerge.exe"
if (-not (Test-Path $tool)) {
    # Custom Hub install root is recorded in %APPDATA%\UnityHub\secondaryInstallPath.json
    Get-Content "$env:APPDATA\UnityHub\secondaryInstallPath.json" -ErrorAction SilentlyContinue
    Get-ChildItem "C:\Program Files\Unity*" -Recurse -Filter UnityYAMLMerge.exe -ErrorAction SilentlyContinue |
        Select-Object -First 3 -ExpandProperty FullName
}
```

Any installed editor's UnityYAMLMerge can merge YAML from other versions; matching the project version is preferred, not required.

## .gitattributes

Append to the repo's `.gitattributes` (create if missing):

```
*.unity  merge=unityyamlmerge
*.prefab merge=unityyamlmerge
*.asset  merge=unityyamlmerge
```

`*.asset` also matches assets that stay binary even under Force Text (TerrainData, LightingData); the driver fails cleanly on them and leaves a normal conflict.

## Merge driver

```powershell
git config merge.unityyamlmerge.name "Unity SmartMerge"
git config merge.unityyamlmerge.driver ('"' + $tool + '" merge -p %O %B %A %A')
```

Argument order: base, theirs, mine, destination. Exit 0 means fully merged; nonzero leaves the conflict for manual handling.

## Mergetool fallback (optional, interactive)

```powershell
git config merge.tool unityyamlmerge
git config mergetool.unityyamlmerge.trustExitCode false
git config mergetool.unityyamlmerge.cmd ('"' + $tool + '" merge -p "$BASE" "$REMOTE" "$LOCAL" "$MERGED"')
git config mergetool.keepBackup false
```

With `trustExitCode false`, git asks after each file whether the merge succeeded; check for leftover conflict markers before answering yes.

`mergespecfile.txt` (same folder as the exe) defines the fallback tool UnityYAMLMerge launches on chunks it cannot resolve. Do not edit it; it is shared machine state. Treat unresolved files as manual cases.

## Per-file smart merge on an existing conflict

Use when the driver was configured after conflicts already appeared:

```powershell
git diff --name-only --diff-filter=U
git checkout -m -- "Assets/Scenes/Main.unity"    # re-runs the merge for this path, now through the driver
Select-String -Path "Assets/Scenes/Main.unity" -Pattern '^(<{7}|={7}|>{7})'   # empty output = clean
git add "Assets/Scenes/Main.unity"
```

## Manual audit commands

Duplicate fileIDs (must return nothing):

```powershell
$file = "Assets/Scenes/Main.unity"
(Select-String -Path $file -Pattern '^--- !u!\d+ &(\d+)').Matches |
    ForEach-Object { $_.Groups[1].Value } | Group-Object | Where-Object Count -gt 1
```

GUID references with no defining `.meta` (slow on large projects):

```powershell
$refs  = (Select-String -Path $file -Pattern 'guid: ([0-9a-f]{32})' -AllMatches).Matches |
         ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
$known = (Get-ChildItem Assets, Packages -Recurse -Filter *.meta |
         Select-String -Pattern '^guid: ([0-9a-f]{32})' -List).Matches |
         ForEach-Object { $_.Groups[1].Value }
$refs | Where-Object { $_ -notin $known }
```

Expected misses: built-in resource GUIDs (`0000...`) and registry packages, whose `.meta` files live in `Library/PackageCache`. Investigate anything else.

## .meta conflict resolution

```powershell
git checkout --theirs -- "Assets/Art/Rock.png.meta"   # or --ours; keep the GUID other assets reference
$guid = (Select-String -Path "Assets/Art/Rock.png.meta" -Pattern '^guid: (\S+)').Matches[0].Groups[1].Value
Get-ChildItem Assets -Recurse -Include *.unity, *.prefab, *.asset |
    Select-String -Pattern "guid: $guid" -List | Select-Object -First 10 Path
git add "Assets/Art/Rock.png.meta"
```

Never delete a `.meta` to let Unity regenerate it; the new GUID breaks every existing reference.

## Post-merge verification

Use unity-validate for compile and test templates. Quick log scan after a batchmode compile:

```powershell
Select-String -Path "Logs/*.log" -Pattern "Broken text asset|Could not extract GUID|missing script|is missing|meta data file"
```

If Unity MCP is available, read the Console and open the affected scene instead of relying on logs alone.
