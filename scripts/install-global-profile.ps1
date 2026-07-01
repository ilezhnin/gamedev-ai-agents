[CmdletBinding()]
param(
    [switch] $InstallAgentsMd,
    [switch] $InstallSkills,
    [switch] $InstallWslSkills,
    [string] $WslCodexHome,
    [switch] $Force
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$globalRoot = Join-Path $repoRoot "global"
$skillsRoot = Join-Path (Join-Path $repoRoot "plugins\codex-unity-agent-kit") "skills"
$codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME ".codex" }

New-Item -ItemType Directory -Force -Path $codexHome | Out-Null

function Copy-KitFile {
    param(
        [Parameter(Mandatory = $true)] [string] $Source,
        [Parameter(Mandatory = $true)] [string] $Destination
    )

    $destinationDir = Split-Path -Parent $Destination
    if (-not (Test-Path -LiteralPath $destinationDir)) {
        New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null
    }

    if ((Test-Path -LiteralPath $Destination) -and -not $Force) {
        Write-Host "SKIP existing $Destination"
        return
    }

    Copy-Item -LiteralPath $Source -Destination $Destination -Force:$Force
    Write-Host "COPY $Destination"
}

function Copy-KitDirectory {
    param(
        [Parameter(Mandatory = $true)] [string] $Source,
        [Parameter(Mandatory = $true)] [string] $Destination
    )

    if ((Test-Path -LiteralPath $Destination) -and -not $Force) {
        Write-Host "SKIP existing $Destination"
        return
    }

    if (-not (Test-Path -LiteralPath $Destination)) {
        New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    }

    Get-ChildItem -LiteralPath $Source -Force | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $Destination -Recurse -Force:$Force
    }

    Write-Host "COPY $Destination"
}

function ConvertTo-WslPath {
    param(
        [Parameter(Mandatory = $true)] [string] $WindowsPath
    )

    $resolvedPath = (Resolve-Path -LiteralPath $WindowsPath).Path
    if ($resolvedPath -match "^([A-Za-z]):\\(.*)$") {
        $drive = $matches[1].ToLowerInvariant()
        $tail = $matches[2] -replace "\\", "/"
        return "/mnt/$drive/$tail"
    }

    $converted = & wsl.exe wslpath -a -u $resolvedPath
    if ($LASTEXITCODE -ne 0 -or -not $converted) {
        throw "Could not convert path to WSL path: $WindowsPath"
    }

    return $converted.Trim()
}

function ConvertTo-ShSingleQuotedValue {
    param(
        [Parameter(Mandatory = $true)] [string] $Value
    )

    return $Value -replace "'", "'\''"
}

function Install-WslSkills {
    if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
        throw "wsl.exe was not found. Install WSL or run without -InstallWslSkills."
    }

    if (-not $WslCodexHome) {
        $homeResult = & wsl.exe sh -lc 'printf "%s" "$HOME/.codex"'
        if ($LASTEXITCODE -ne 0 -or -not $homeResult) {
            throw "Could not determine WSL Codex home. Pass -WslCodexHome explicitly."
        }

        $script:WslCodexHome = $homeResult.Trim()
    }

    $wslSkillsRoot = ConvertTo-WslPath -WindowsPath $skillsRoot
    $wslDestination = $WslCodexHome.TrimEnd("/") + "/skills"
    $forceValue = if ($Force) { "1" } else { "0" }
    $script = @'
set -e
src='__SRC__'
dest='__DEST__'
force='__FORCE__'
mkdir -p "$dest"
for skill in "$src"/*; do
  [ -d "$skill" ] || continue
  name="$(basename "$skill")"
  target="$dest/$name"
  if [ -e "$target" ] && [ "$force" != "1" ]; then
    echo "SKIP existing $target"
    continue
  fi
  mkdir -p "$target"
  cp -R "$skill"/. "$target"/
  echo "COPY $target"
done
'@

    $script = $script.Replace("__SRC__", (ConvertTo-ShSingleQuotedValue -Value $wslSkillsRoot))
    $script = $script.Replace("__DEST__", (ConvertTo-ShSingleQuotedValue -Value $wslDestination))
    $script = $script.Replace("__FORCE__", $forceValue)
    $script = $script -replace "`r", ""

    $tempScript = Join-Path $env:TEMP ("codex-install-wsl-skills-" + [Guid]::NewGuid().ToString("N") + ".sh")
    try {
        $utf8NoBom = New-Object System.Text.UTF8Encoding $false
        [System.IO.File]::WriteAllText($tempScript, $script, $utf8NoBom)
        $wslScriptPath = ConvertTo-WslPath -WindowsPath $tempScript

        & wsl.exe sh $wslScriptPath
        if ($LASTEXITCODE -ne 0) {
            throw "WSL skill installation failed with exit code $LASTEXITCODE."
        }
    } finally {
        if (Test-Path -LiteralPath $tempScript) {
            Remove-Item -LiteralPath $tempScript -Force
        }
    }
}

Copy-KitFile `
    -Source (Join-Path $globalRoot "unity-codex.config.toml") `
    -Destination (Join-Path $codexHome "unity-codex.config.toml")

foreach ($file in Get-ChildItem -LiteralPath (Join-Path $globalRoot "agents") -File) {
    Copy-KitFile -Source $file.FullName -Destination (Join-Path (Join-Path $codexHome "agents") $file.Name)
}

foreach ($file in Get-ChildItem -LiteralPath (Join-Path $globalRoot "rules") -File) {
    Copy-KitFile -Source $file.FullName -Destination (Join-Path (Join-Path $codexHome "rules") $file.Name)
}

if ($InstallAgentsMd) {
    Copy-KitFile -Source (Join-Path $globalRoot "AGENTS.md") -Destination (Join-Path $codexHome "AGENTS.md")
} else {
    Copy-KitFile -Source (Join-Path $globalRoot "AGENTS.md") -Destination (Join-Path $codexHome "AGENTS.unity-template.md")
}

if ($InstallSkills) {
    foreach ($skill in Get-ChildItem -LiteralPath $skillsRoot -Directory) {
        Copy-KitDirectory -Source $skill.FullName -Destination (Join-Path (Join-Path $codexHome "skills") $skill.Name)
    }
}

if ($InstallWslSkills) {
    Install-WslSkills
}

Write-Host "Global Unity Codex profile installed under $codexHome"
if ($InstallWslSkills) {
    Write-Host "WSL Codex skills installed under $WslCodexHome/skills"
}
