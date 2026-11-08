# SWAPP Live: obtain official OBS Studio 33.0.1 x64 and generate an
# ABI-matched import library from obs.dll, avoiding a full OBS source build.
[CmdletBinding()]
param(
  [string]$OutputRoot = (Join-Path $env:RUNNER_TEMP "swapp-obs-33.0.1"),
  [switch]$Force
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$version = '33.0.1'
$assets = @(
  @{File='OBS-Studio-33.0.1-Windows-x64.zip';Hash='0d9436451c2d772b33428e3fdae9776f071895c335de17283176306fb72651d3'},
  @{File='OBS-Studio-33.0.1-Sources.tar.gz';Hash='c8d3a8f69a0f17970ac0a8f2a2462f1bc4dacd324f6da0c4b408d442d4798913'}
)
function Require-File([string]$p) {
  if (!(Test-Path -LiteralPath $p -PathType Leaf)) { throw "Missing: $p" }
}
function MsvcExe([string]$name) {
  $command = Get-Command $name -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  $programFilesX86 = [Environment]::GetFolderPath('ProgramFilesX86')
  $vswhere = Join-Path $programFilesX86 'Microsoft Visual Studio\Installer\vswhere.exe'
  if (!(Test-Path $vswhere)) { throw "Visual Studio tools are missing: $name" }
  $vsRoot = (& $vswhere -latest -products * -property installationPath | Select-Object -First 1)
  if (!$vsRoot) { throw "No MSVC installation available" }
  $tool = Get-ChildItem (Join-Path $vsRoot 'VC\Tools\MSVC') -Directory |
    Sort-Object Name -Descending |
    ForEach-Object { Join-Path $_.FullName "bin\Hostx64\x64\$name" } |
    Where-Object { Test-Path $_ -PathType Leaf } |
    Select-Object -First 1
  if (!$tool) { throw "Missing MSVC tool: $name" }
  return $tool
}
if ($env:OS -ne 'Windows_NT') { throw 'This script requires Windows' }
if (!$OutputRoot) { $OutputRoot = Join-Path $env:TEMP 'swapp-obs-33.0.1' }
New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null
foreach ($asset in $assets) {
  $file = Join-Path $OutputRoot $asset.File
  $valid = (Test-Path $file) -and ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -eq $asset.Hash)
  if (!$valid -or $Force) {
    $url="https://github.com/obsproject/obs-studio/releases/download/$version/$($asset.File)"
    Write-Host "Downloading official $($asset.File)"
    Invoke-WebRequest -Uri $url -OutFile $file -UseBasicParsing
  }
  Require-File $file
  $actual = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $asset.Hash) { throw "Refusing OBS asset with invalid SHA-256: $($asset.File)" }
}
$runtime = Join-Path $OutputRoot 'runtime'
$sourceParent = Join-Path $OutputRoot 'source'
$sdk = Join-Path $OutputRoot 'sdk'
if (!(Test-Path (Join-Path $runtime 'bin\64bit\obs.dll'))) {
  Expand-Archive -LiteralPath (Join-Path $OutputRoot 'OBS-Studio-33.0.1-Windows-x64.zip') -DestinationPath $runtime -Force
}
if (!(Test-Path $sourceParent)) {
  New-Item -ItemType Directory -Force -Path $sourceParent | Out-Null
}
$folder = Get-ChildItem -LiteralPath $sourceParent -Directory |
    Where-Object { Test-Path (Join-Path $_.FullName 'libobs\obs.h') } |
    Select-Object -First 1
if (!$folder) {
  & "$env:SystemRoot\System32\tar.exe" -xzf (Join-Path $OutputRoot 'OBS-Studio-33.0.1-Sources.tar.gz') -C $sourceParent
  if ($LASTEXITCODE -ne 0) { throw 'OBS source extraction failed' }
  $folder = Get-ChildItem -LiteralPath $sourceParent -Directory |
    Where-Object { Test-Path (Join-Path $_.FullName 'libobs\obs.h') } |
    Select-Object -First 1
}
if (!$folder) { throw 'OBS libobs headers not found in official archive' }
$sourceTree = $folder.FullName
Require-File (Join-Path $runtime 'bin\64bit\obs.dll')
Require-File (Join-Path $runtime 'bin\64bit\libobs-d3d11.dll')
Require-File (Join-Path $sourceTree 'COPYING')
New-Item -ItemType Directory -Force -Path (Join-Path $sdk 'lib'),(Join-Path $sdk 'config') | Out-Null
$dumpbin = MsvcExe 'dumpbin.exe'
$libExe = MsvcExe 'lib.exe'
$rawExports = & $dumpbin /EXPORTS (Join-Path $runtime 'bin\64bit\obs.dll')
$names = @($rawExports | ForEach-Object {
  if ($_ -match '^\s+\d+\s+[0-9A-Fa-f]+\s+[0-9A-Fa-f]{8}\s+(\S+)') { $matches[1] }
} | Where-Object { $_ -and $_ -notmatch '\.' } | Sort-Object -Unique)
if ($names.Count -lt 150) { throw "Too few exports read from obs.dll ($($names.Count))" }
$def = Join-Path $sdk 'lib\obs.def'
@('LIBRARY obs.dll','EXPORTS') + $names | Set-Content -LiteralPath $def -Encoding ascii
$implib = Join-Path $sdk 'lib\obs.lib'
& $libExe /nologo "/def:$def" /machine:x64 "/out:$implib"
if ($LASTEXITCODE -ne 0) { throw 'MSVC import library generation failed' }
Require-File $implib
@'
#pragma once
#define OBS_INSTALL_PREFIX "."
#define OBS_DATA_PATH "data/libobs"
#define OBS_PLUGIN_PATH "core"
#define OBS_PLUGIN_DESTINATION "core"
#define OBS_RELEASE_CANDIDATE 0
#define OBS_BETA 0
'@ | Set-Content -LiteralPath (Join-Path $sdk 'config\obsconfig.h') -Encoding ascii
Write-Host "Verified OBS runtime: $runtime"
Write-Host "Matching OBS sources: $sourceTree"
Write-Host "Generated libobs import library: $implib"
Write-Host "Imported symbols: $($names.Count)"
if ($env:GITHUB_ENV) {
  Add-Content -LiteralPath $env:GITHUB_ENV -Value "SWAPP_OBS_ROOT=$runtime"
  Add-Content -LiteralPath $env:GITHUB_ENV -Value "SWAPP_OBS_SOURCE=$sourceTree"
  Add-Content -LiteralPath $env:GITHUB_ENV -Value "SWAPP_OBS_SDK=$sdk"
}
