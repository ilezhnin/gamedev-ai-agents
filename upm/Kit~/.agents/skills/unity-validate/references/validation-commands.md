# Guarded Unity Validation Commands

Prefer project-specific commands. These PowerShell templates are conservative fallbacks for an isolated candidate worktree created by `$crossworking`. Do not use a shared dirty checkout for delivery-grade evidence.

## Preflight And Guard

Set `AGENT_EVIDENCE_ROOT` to a new persistent ignored directory in the primary checkout named `<candidate-tree>/attempt-<n>`, and set `AGENT_EVIDENCE_ATTEMPT` to that positive attempt number. The directory must not already exist, so retries cannot overwrite earlier evidence. Set `AGENT_META_CHECK` to the primary checkout's `check-unity-meta.ps1`; the candidate may not contain portable Agent Kit files. Store the frozen UTF-8 JSON array of repository-relative file paths beside the attempt directories (for example `<candidate-tree>/task-paths.json`) and point `AGENT_TASK_PATHS_FILE` to it; expand the path set across the base/current union so deletions are explicit. Also set `AGENT_BASE_SHA`, `AGENT_SOURCE_HEAD`, `AGENT_CANDIDATE_TREE`, and `AGENT_TASK_FINGERPRINT` to the full recorded values. The guard refuses placeholders, a candidate index tree that does not exactly match the expected tree, or a fingerprint that cannot be reproduced from the frozen path set and candidate-tree blobs.

```powershell
$projectRoot = (Get-Item -LiteralPath ".").FullName
$evidenceRootSetting = $env:AGENT_EVIDENCE_ROOT
$evidenceAttempt = $env:AGENT_EVIDENCE_ATTEMPT
$metaCheckSetting = $env:AGENT_META_CHECK
$taskPathsSetting = $env:AGENT_TASK_PATHS_FILE
$baseSha = $env:AGENT_BASE_SHA
$sourceHead = $env:AGENT_SOURCE_HEAD
$candidateTree = $env:AGENT_CANDIDATE_TREE
$taskFingerprint = $env:AGENT_TASK_FINGERPRINT

if ([string]::IsNullOrWhiteSpace($evidenceRootSetting)) { throw "AGENT_EVIDENCE_ROOT is required." }
if ($evidenceAttempt -notmatch '^[1-9][0-9]*$') { throw "AGENT_EVIDENCE_ATTEMPT must be a positive integer." }
if ([string]::IsNullOrWhiteSpace($metaCheckSetting) -or -not (Test-Path -LiteralPath $metaCheckSetting)) {
    throw "AGENT_META_CHECK must point to the primary checkout's check-unity-meta.ps1."
}
if ([string]::IsNullOrWhiteSpace($taskPathsSetting) -or -not (Test-Path -LiteralPath $taskPathsSetting -PathType Leaf)) {
    throw "AGENT_TASK_PATHS_FILE must point to the frozen task-path JSON array."
}
foreach ($requiredValue in @{
    AGENT_BASE_SHA = $baseSha
    AGENT_SOURCE_HEAD = $sourceHead
    AGENT_CANDIDATE_TREE = $candidateTree
    AGENT_TASK_FINGERPRINT = $taskFingerprint
}.GetEnumerator()) {
    if ([string]::IsNullOrWhiteSpace($requiredValue.Value)) { throw "$($requiredValue.Key) is required." }
}
if ($baseSha -notmatch '^[0-9a-fA-F]{40,64}$' -or $sourceHead -notmatch '^[0-9a-fA-F]{40,64}$' -or $candidateTree -notmatch '^[0-9a-fA-F]{40,64}$') {
    throw "Base, source HEAD, and candidate tree must be full Git object IDs."
}
if ($taskFingerprint -notmatch '^[0-9a-fA-F]{64}$') { throw "AGENT_TASK_FINGERPRINT must be a SHA-256 value." }
$baseSha = $baseSha.ToLowerInvariant()
$sourceHead = $sourceHead.ToLowerInvariant()
$candidateTree = $candidateTree.ToLowerInvariant()
$taskFingerprint = $taskFingerprint.ToLowerInvariant()
$evidenceRoot = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($evidenceRootSetting)
$metaCheckScript = (Get-Item -LiteralPath $metaCheckSetting).FullName
$taskPathsFile = (Get-Item -LiteralPath $taskPathsSetting).FullName
$evidenceParent = Split-Path -Parent $evidenceRoot
if (-not [string]::Equals((Split-Path -Leaf $evidenceParent), $candidateTree, [StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $evidenceRoot) -ne ("attempt-" + $evidenceAttempt)) {
    throw "AGENT_EVIDENCE_ROOT must end with $candidateTree/attempt-$evidenceAttempt."
}
if (Test-Path -LiteralPath $evidenceRoot) { throw "Evidence attempt directory already exists; use the next attempt number instead of overwriting it." }
New-Item -ItemType Directory -Path $evidenceRoot -ErrorAction Stop | Out-Null

function Get-CandidateIndexTree {
    [string[]] $treeOutput = @(& git -C $projectRoot write-tree)
    if ($LASTEXITCODE -ne 0 -or $treeOutput.Count -ne 1) { throw "Could not compute the candidate index tree." }
    return $treeOutput[0].Trim().ToLowerInvariant()
}

function Assert-GitObjectType {
    param(
        [Parameter(Mandatory = $true)][string] $ObjectId,
        [Parameter(Mandatory = $true)][string] $ExpectedType,
        [Parameter(Mandatory = $true)][string] $Label
    )

    [string[]] $typeOutput = @(& git -C $projectRoot cat-file -t $ObjectId)
    if ($LASTEXITCODE -ne 0 -or $typeOutput.Count -ne 1 -or $typeOutput[0].Trim() -ne $ExpectedType) {
        throw "$Label $ObjectId is not an available Git $ExpectedType object."
    }
}

function Get-TreePathEntry {
    param(
        [Parameter(Mandatory = $true)][string] $TreeId,
        [Parameter(Mandatory = $true)][string] $RelativePath
    )

    $literalPathspec = ":(literal)$RelativePath"
    [string[]] $entryOutput = @(& git -C $projectRoot ls-tree $TreeId --format='%(objectmode) %(objecttype) %(objectname)' -- $literalPathspec)
    if ($LASTEXITCODE -ne 0) { throw "Could not inspect '$RelativePath' in tree $TreeId." }
    if ($entryOutput.Count -eq 0) { return $null }
    if ($entryOutput.Count -ne 1 -or $entryOutput[0] -notmatch '^(100644|100755|120000) blob ([0-9a-fA-F]{40,64})$') {
        throw "Task path must resolve to one supported Git blob: $RelativePath"
    }
    return [pscustomobject]@{ mode = $Matches[1]; object_id = $Matches[2].ToLowerInvariant() }
}

function Get-GitBlobRawSha256 {
    param([Parameter(Mandatory = $true)][string] $ObjectId)

    $gitCommand = (Get-Command git -ErrorAction Stop).Source
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = $gitCommand
    $start.WorkingDirectory = $projectRoot
    $start.Arguments = "cat-file blob $ObjectId"
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $process = [System.Diagnostics.Process]::Start($start)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $hashBytes = $sha.ComputeHash($process.StandardOutput.BaseStream)
        $stderr = $process.StandardError.ReadToEnd()
        $process.WaitForExit()
        if ($process.ExitCode -ne 0) { throw "Could not read Git blob $ObjectId`: $stderr" }
        return ([BitConverter]::ToString($hashBytes)).Replace("-", "").ToLowerInvariant()
    }
    finally {
        $sha.Dispose()
        if ($process) { $process.Dispose() }
    }
}

function Get-CanonicalTaskFingerprint {
    param([Parameter(Mandatory = $true)][string] $PathsFile)

    $loadedPaths = @(Get-Content -LiteralPath $PathsFile -Raw -ErrorAction Stop | ConvertFrom-Json)
    if ($loadedPaths.Count -eq 0) { throw "Frozen task path set is empty." }

    $utf8 = New-Object System.Text.UTF8Encoding($false, $true)
    $orderedPaths = New-Object 'System.Collections.Generic.SortedDictionary[string,string]' ([StringComparer]::Ordinal)
    $seenPaths = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
    foreach ($loadedPath in $loadedPaths) {
        $relativePath = [string]$loadedPath
        if ([string]::IsNullOrWhiteSpace($relativePath) -or $relativePath.Contains("\") -or $relativePath.StartsWith("/") -or $relativePath.EndsWith("/") -or $relativePath -match '(^|/)\.\.?(/|$)' -or $relativePath.IndexOf([char]0) -ge 0) {
            throw "Task paths must be normalized repository-relative file paths: '$relativePath'"
        }
        if (-not $seenPaths.Add($relativePath)) { throw "Duplicate task path: $relativePath" }
        $sortKey = ([BitConverter]::ToString($utf8.GetBytes($relativePath))).Replace("-", "")
        $orderedPaths.Add($sortKey, $relativePath)
    }

    $stream = New-Object System.IO.MemoryStream
    try {
        foreach ($relativePath in $orderedPaths.Values) {
            $entry = Get-TreePathEntry -TreeId $candidateTree -RelativePath $relativePath
            if ($null -eq $entry) {
                $baseEntry = Get-TreePathEntry -TreeId $baseSha -RelativePath $relativePath
                if ($null -eq $baseEntry) { throw "Deleted task path does not exist in the recorded base: $relativePath" }
                $mode = "deleted"
                $rawHash = "-"
            }
            else {
                $mode = $entry.mode
                $rawHash = Get-GitBlobRawSha256 -ObjectId $entry.object_id
            }
            $recordBytes = $utf8.GetBytes($relativePath + [char]0 + $mode + [char]0 + $rawHash + [char]0)
            $stream.Write($recordBytes, 0, $recordBytes.Length)
        }
        $stream.Position = 0
        $sha = [System.Security.Cryptography.SHA256]::Create()
        try { return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace("-", "").ToLowerInvariant() }
        finally { $sha.Dispose() }
    }
    finally { $stream.Dispose() }
}

Assert-GitObjectType -ObjectId $baseSha -ExpectedType "commit" -Label "Base SHA"
Assert-GitObjectType -ObjectId $sourceHead -ExpectedType "commit" -Label "Source HEAD"
Assert-GitObjectType -ObjectId $candidateTree -ExpectedType "tree" -Label "Candidate tree"
$computedTaskFingerprint = Get-CanonicalTaskFingerprint -PathsFile $taskPathsFile
if ($computedTaskFingerprint -ne $taskFingerprint) {
    throw "Candidate task fingerprint $computedTaskFingerprint does not match AGENT_TASK_FINGERPRINT $taskFingerprint."
}
$preIndexTree = Get-CandidateIndexTree
if ($preIndexTree -ne $candidateTree) {
    throw "Candidate index tree $preIndexTree does not match AGENT_CANDIDATE_TREE $candidateTree."
}
& git -C $projectRoot diff --quiet --
if ($LASTEXITCODE -ne 0) { throw "Candidate working files differ from the reviewed index tree." }
[string[]] $untrackedPaths = @(& git -C $projectRoot ls-files --others --exclude-standard)
if ($LASTEXITCODE -ne 0) { throw "Could not inspect untracked candidate paths." }
if ($untrackedPaths.Count -gt 0) { throw "Candidate contains untracked non-ignored paths; materialize and stage the complete task scope first." }
[string[]] $ignoredProtectedPaths = @(& git -C $projectRoot ls-files --others --ignored --exclude-standard -- Assets Packages ProjectSettings)
if ($LASTEXITCODE -ne 0) { throw "Could not inspect ignored protected paths." }
if ($ignoredProtectedPaths.Count -gt 0) { throw "Candidate contains ignored protected content not represented by its tree; use a fresh candidate worktree." }
$metadata = [ordered]@{
    base_sha = $baseSha
    source_head = $sourceHead
    candidate_tree = $candidateTree
    task_content_fingerprint = $taskFingerprint
    task_paths_file_sha256 = (Get-FileHash -LiteralPath $taskPathsFile -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()
    evidence_attempt = [int]$evidenceAttempt
}
[System.IO.File]::WriteAllText((Join-Path $evidenceRoot "candidate-metadata.json"), ($metadata | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false)))

$requiredVersionLine = Get-Content "ProjectSettings/ProjectVersion.txt" | Where-Object { $_ -like "m_EditorVersion:*" } | Select-Object -First 1
$requiredVersion = ($requiredVersionLine -split ":", 2)[1].Trim()
$requiredRevisionLine = Get-Content "ProjectSettings/ProjectVersion.txt" | Where-Object { $_ -like "m_EditorVersionWithRevision:*" } | Select-Object -First 1
if ($requiredRevisionLine -notmatch '^m_EditorVersionWithRevision:\s*(\S+)\s+\(([0-9a-fA-F]+)\)\s*$') {
    throw "ProjectVersion.txt must contain m_EditorVersionWithRevision for exact editor proof."
}
$revisionVersion = $Matches[1]
$requiredRevision = $Matches[2].ToLowerInvariant()
if ($revisionVersion -ne $requiredVersion) { throw "ProjectVersion.txt editor version lines disagree." }
if ([string]::IsNullOrWhiteSpace($env:UNITY_EDITOR) -or -not (Test-Path -LiteralPath $env:UNITY_EDITOR -PathType Leaf)) {
    throw "UNITY_EDITOR must point to the exact Unity $requiredVersion executable."
}
$unityEditorPath = (Get-Item -LiteralPath $env:UNITY_EDITOR).FullName
$versionInfo = (Get-Item -LiteralPath $unityEditorPath).VersionInfo
$expectedProductVersion = "${requiredVersion}_${requiredRevision}"
if ($versionInfo.ProductVersion -ne $expectedProductVersion) {
    throw "Unity binary ProductVersion '$($versionInfo.ProductVersion)' does not match '$expectedProductVersion'."
}
$env:UNITY_EDITOR = $unityEditorPath
$versionStdout = Join-Path $evidenceRoot "unity-version.txt"
$versionStderr = Join-Path $evidenceRoot "unity-version-error.txt"
$versionProcess = Start-Process -FilePath $unityEditorPath -ArgumentList "-version" -Wait -PassThru -RedirectStandardOutput $versionStdout -RedirectStandardError $versionStderr
$reportedVersion = (Get-Content -LiteralPath $versionStdout -Raw).Trim()
if ($versionProcess.ExitCode -ne 0 -or $reportedVersion -ne $requiredVersion) {
    throw "Unity -version reported '$reportedVersion' with exit $($versionProcess.ExitCode); expected '$requiredVersion'."
}
[System.IO.File]::WriteAllText((Join-Path $evidenceRoot "unity-editor-product-version.txt"), $versionInfo.ProductVersion, (New-Object System.Text.UTF8Encoding($false)))

function Write-ProtectedContentManifest {
    param([Parameter(Mandatory = $true)][string] $OutputPath)

    $records = [System.Collections.Generic.Dictionary[string,object]]::new([StringComparer]::Ordinal)
    foreach ($relativeRoot in @("Assets", "Packages", "ProjectSettings")) {
        $absoluteRoot = Join-Path $projectRoot $relativeRoot
        if (-not (Test-Path -LiteralPath $absoluteRoot -ErrorAction Stop)) { continue }

        $items = @((Get-Item -LiteralPath $absoluteRoot -ErrorAction Stop)) + @(Get-ChildItem -LiteralPath $absoluteRoot -Recurse -Force -ErrorAction Stop)
        foreach ($item in $items) {
            if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw "Protected path contains a reparse point; refusing traversal: $($item.FullName)"
            }

            $relative = $item.FullName.Substring($projectRoot.Length).TrimStart([char[]]@('\', '/')).Replace('\', '/')
            if ($item.PSIsContainer) {
                $records[$relative] = [ordered]@{ path = $relative; kind = "directory"; length = 0; sha256 = $null }
            }
            else {
                $hash = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()
                if ([string]::IsNullOrWhiteSpace($hash)) { throw "Could not hash protected file: $($item.FullName)" }
                $records[$relative] = [ordered]@{ path = $relative; kind = "file"; length = [long]$item.Length; sha256 = $hash }
            }
        }
    }

    [string[]] $paths = @($records.Keys)
    [Array]::Sort($paths, [StringComparer]::Ordinal)
    [string[]] $lines = @($paths | ForEach-Object { $records[$_] | ConvertTo-Json -Compress })
    [System.IO.File]::WriteAllLines($OutputPath, $lines, (New-Object System.Text.UTF8Encoding($false)))
    $manifestHash = (Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($manifestHash)) { throw "Could not hash protected-content manifest: $OutputPath" }
    return $manifestHash
}

function Invoke-GuardedUnity {
    param([Parameter(Mandatory = $true)][scriptblock] $Operation)

    $preManifest = Join-Path $evidenceRoot "pre-unity-protected-manifest.jsonl"
    $postManifest = Join-Path $evidenceRoot "post-unity-protected-manifest.jsonl"
    $preStatusPath = Join-Path $evidenceRoot "pre-unity-status.txt"
    $postStatusPath = Join-Path $evidenceRoot "post-unity-status.txt"
    $preHash = Write-ProtectedContentManifest -OutputPath $preManifest
    [string[]] $preStatus = @(& git -C $projectRoot -c core.quotepath=off status --short --untracked-files=all)
    if ($LASTEXITCODE -ne 0) { throw "Could not capture the candidate Git status before Unity." }
    [System.IO.File]::WriteAllLines($preStatusPath, $preStatus, (New-Object System.Text.UTF8Encoding($false)))

    $validationFailure = $null
    $mutationFailure = $null
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Stop"
        & $Operation
    }
    catch {
        $validationFailure = $_.Exception.Message
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
        try {
            $postHash = Write-ProtectedContentManifest -OutputPath $postManifest
            [string[]] $postStatus = @(& git -C $projectRoot -c core.quotepath=off status --short --untracked-files=all)
            if ($LASTEXITCODE -ne 0) { throw "Could not capture the candidate Git status after Unity." }
            [System.IO.File]::WriteAllLines($postStatusPath, $postStatus, (New-Object System.Text.UTF8Encoding($false)))
            if ($preHash -ne $postHash) {
                Compare-Object (Get-Content $preManifest) (Get-Content $postManifest) | Set-Content (Join-Path $evidenceRoot "protected-manifest-delta.txt")
                $mutationFailure = "Unity changed protected project content; inspect the manifest delta and preserve the candidate."
            }
            if (Compare-Object $preStatus $postStatus) {
                Compare-Object $preStatus $postStatus | Set-Content (Join-Path $evidenceRoot "git-status-delta.txt")
                $mutationFailure = (($mutationFailure + " Unity changed the candidate Git state; inspect the status delta and preserve the candidate.").Trim())
            }
            $postIndexTree = Get-CandidateIndexTree
            [System.IO.File]::WriteAllText((Join-Path $evidenceRoot "post-unity-index-tree.txt"), $postIndexTree, (New-Object System.Text.UTF8Encoding($false)))
            if ($postIndexTree -ne $candidateTree) {
                $mutationFailure = (($mutationFailure + " Unity changed the candidate index tree; expected $candidateTree but found $postIndexTree.").Trim())
            }

            $powerShellExecutable = (Get-Process -Id $PID).Path
            & $powerShellExecutable -NoProfile -ExecutionPolicy Bypass -File $metaCheckScript -ProjectRoot $projectRoot
            if ($LASTEXITCODE -ne 0) {
                $mutationFailure = (($mutationFailure + " Unity metadata validation failed.").Trim())
            }
        }
        catch {
            $mutationFailure = (($mutationFailure + " Postflight failed: " + $_.Exception.Message).Trim())
        }
    }

    if ($validationFailure -and $mutationFailure) { throw "Validation failed: $validationFailure Mutation guard failed: $mutationFailure" }
    if ($mutationFailure) { throw $mutationFailure }
    if ($validationFailure) { throw $validationFailure }
}
```

The required metadata binds every run to the recorded base, source HEAD, candidate index tree, and task-content fingerprint. The manifest recursively covers tracked, untracked, and ignored files plus directories under `Assets/`, `Packages/`, and `ProjectSettings/`. It rejects reparse points instead of following them. The before/after Git status and index-tree comparisons also catch mode/index-state changes; they are not substitutes for the raw-byte manifest. The metadata script runs in a child PowerShell process because it exits with its own status code; invoking it in-process could terminate the guard before failures are combined.

## Compile

```powershell
Invoke-GuardedUnity {
    & $env:UNITY_EDITOR -batchmode -nographics -quit -projectPath $projectRoot -logFile (Join-Path $evidenceRoot "UnityCompile.log")
    if ($LASTEXITCODE -ne 0) { throw "Unity compile failed with exit code $LASTEXITCODE." }
}
```

Do not add `-accept-apiupdate` without explicit approval.

## Filtered EditMode Tests

```powershell
$testFilter = "<fully-qualified fixture, namespace, or test>"
if ($testFilter -like "<*") { throw "Replace the EditMode test filter before running." }

Invoke-GuardedUnity {
    & $env:UNITY_EDITOR -batchmode -projectPath $projectRoot -runTests -testPlatform EditMode -testFilter $testFilter -testResults (Join-Path $evidenceRoot "EditMode.xml") -logFile (Join-Path $evidenceRoot "EditMode.log")
    if ($LASTEXITCODE -ne 0) { throw "EditMode tests failed with exit code $LASTEXITCODE." }
}
```

## Filtered PlayMode Tests

Omit `-nographics` unless the selected tests are known to be headless-safe.

```powershell
$testFilter = "<fully-qualified fixture, namespace, or test>"
if ($testFilter -like "<*") { throw "Replace the PlayMode test filter before running." }

Invoke-GuardedUnity {
    & $env:UNITY_EDITOR -batchmode -projectPath $projectRoot -runTests -testPlatform PlayMode -testFilter $testFilter -testResults (Join-Path $evidenceRoot "PlayMode.xml") -logFile (Join-Path $evidenceRoot "PlayMode.log")
    if ($LASTEXITCODE -ne 0) { throw "PlayMode tests failed with exit code $LASTEXITCODE." }
}
```

Never combine `-quit` with `-runTests`; the Test Framework exits after the run.

## Evidence Review

After the guarded call, parse result XML and logs; exit code alone is not evidence.

```powershell
Select-String -Path (Join-Path $evidenceRoot "*.log") -Pattern "error CS|Exception|Compilation failed|Build failed|Test run failed" -CaseSensitive:$false
```

An intentional task-content mutation is not accepted in place. Return to the primary writer, update scope, materialize a new candidate tree, and rerun validation/review. Never auto-revert or delete a mutated candidate.

Use evidence-specific wording:

- "Unity <version> candidate-tree compile passed; protected content manifest unchanged."
- "Filtered EditMode tests passed: <filter>; results: <path>."
- "Unity changed protected content; validation is blocked and the candidate was preserved."
- "Static inspection only; Unity compilation remains unverified."
