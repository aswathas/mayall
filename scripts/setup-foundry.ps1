#Requires -Version 5.1
<#
.SYNOPSIS
  Installs the Foundry toolchain used by the HELIX forensic engine.

.DESCRIPTION
  Downloads the pinned Foundry v1.8.7 Windows release and expands it into
  <repo>/.tools/foundry. The system PATH is never modified: the forensic engine
  resolves the binaries from that directory at runtime (see
  packages/forensic-engine/src/foundry.ts).

  The script is idempotent. If .tools/foundry/forge.exe is already present it
  prints the detected versions and exits 0 without touching the network.

  Windows PowerShell 5.1 only.
#>

$ErrorActionPreference = 'Stop'

$repoRoot    = Split-Path -Parent $PSScriptRoot
$toolsDir    = Join-Path $repoRoot '.tools'
$installDir  = Join-Path $toolsDir 'foundry'
$zipPath     = Join-Path $toolsDir 'foundry.zip'
$forgeExe    = Join-Path $installDir 'forge.exe'
$downloadUrl = 'https://github.com/foundry-rs/foundry/releases/download/v1.8.7/foundry_v1.8.7_win32_amd64.zip'

function Write-Section {
  param([Parameter(Mandatory = $true)][string] $Title)
  Write-Host ''
  Write-Host "== $Title" -ForegroundColor Cyan
}

function Get-ToolVersion {
  param([Parameter(Mandatory = $true)][string] $Exe)

  if (-not (Test-Path -LiteralPath $Exe)) {
    return $null
  }

  $raw = & $Exe --version 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Native command failed (exit $LASTEXITCODE): $Exe --version"
  }

  return ($raw | Select-Object -First 1)
}

function Write-ToolVersions {
  foreach ($tool in @('forge', 'cast', 'anvil')) {
    $version = Get-ToolVersion (Join-Path $installDir "$tool.exe")
    if ($version) {
      Write-Host ('  {0,-6} {1}' -f $tool, $version)
    }
  }
}

function Write-NextSteps {
  Write-Section 'Next steps'
  Write-Host '  npm run forge:test'
  Write-Host '  npm run dev'
}

# -- Idempotent path ----------------------------------------------------------
if (Test-Path -LiteralPath $forgeExe) {
  Write-Host 'Foundry is already installed under .tools/foundry.' -ForegroundColor Green
  Write-ToolVersions
  Write-NextSteps
  exit 0
}

# -- Fresh install ------------------------------------------------------------
Write-Section 'Downloading Foundry v1.8.7'
New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
Write-Host "  $downloadUrl"
Write-Host "  -> $zipPath"
Invoke-WebRequest -UseBasicParsing -Uri $downloadUrl -OutFile $zipPath

if (-not (Test-Path -LiteralPath $zipPath)) {
  throw "Download did not produce $zipPath"
}
Write-Section 'Expanding archive'
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
Expand-Archive -LiteralPath $zipPath -DestinationPath $installDir -Force

if (-not (Test-Path -LiteralPath $forgeExe)) {
  throw "Expected $forgeExe after extraction."
}

Write-Section 'Installed'
Write-ToolVersions

# -- Cleanup ------------------------------------------------------------------
# The local runtime routes a top-level `rm --` through a trusted launcher, so
# the recoverable delete is issued here at script scope. A cleanup failure must
# not fail the install.
if (Test-Path -LiteralPath $zipPath) {
  try {
    rm -- "$zipPath"
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "Cleanup of $zipPath exited with code $LASTEXITCODE"
    }
  }
  catch {
    Write-Warning "Could not remove $zipPath : $($_.Exception.Message)"
  }
}

Write-NextSteps
exit 0