param(
  [Parameter(Mandatory=$true)][string]$SdkPrefix,
  [Parameter(Mandatory=$true)][string]$ObsPortableRoot,
  [Parameter(Mandatory=$true)][string]$ObsSourceRoot
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$localAgent = (Resolve-Path (Join-Path $here "..")).Path
$stage = Join-Path $localAgent "libobs-runtime"
$build = Join-Path $here "build"

function Require-File([string]$file) {
  if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing required file: $file" }
}
function Copy-Verified([string]$source,[string]$dest) {
  Require-File $source
  Copy-Item -LiteralPath $source -Destination $dest -Force
}

if ($env:OS -ne "Windows_NT" -or ![Environment]::Is64BitOperatingSystem) { throw "Requires Windows x64" }
$obs = (Resolve-Path -LiteralPath $ObsPortableRoot).Path
$sdk = (Resolve-Path -LiteralPath $SdkPrefix).Path
$sourceTree = (Resolve-Path -LiteralPath $ObsSourceRoot).Path
Require-File (Join-Path $sourceTree "COPYING")

# OBS Studio 33 (2026-10) ships official first-party modules under core/<module>/,
# not obs-plugins/64bit. The old layout is supported only as a fallback.
$obsBin = Join-Path $obs "bin\64bit"
$core = Join-Path $obs "core"
$legacy = Join-Path $obs "obs-plugins\64bit"
$legacyData = Join-Path $obs "data\obs-plugins"
Require-File (Join-Path $obsBin "obs.dll")
Require-File (Join-Path $obsBin "libobs-d3d11.dll")

$required = @("win-capture","win-wasapi","obs-outputs","obs-x264","obs-ffmpeg","rtmp-services")
$optional = @("obs-nvenc")
$selected = @{}
foreach ($name in ($required + $optional)) {
  $modern = Join-Path (Join-Path $core $name) "$name.dll"
  $old = Join-Path $legacy "$name.dll"
  if (Test-Path $modern -PathType Leaf) { $selected[$name] = @{ layout="core";file=$modern } }
  elseif (Test-Path $old -PathType Leaf) { $selected[$name] = @{ layout="legacy";file=$old } }
  elseif ($required -contains $name) {
    throw "OBS Studio 33 runtime missing $name : checked $modern and $old. Confirm the official x64 portable ZIP was extracted completely."
  } else { Write-Warning "Optional module $name not found; x264 fallback remains available." }
}

Write-Host "Using OBS core modules:" ([string]::Join(", ", @($selected.Keys)))
& cmake -S $here -B $build -A x64 "-DCMAKE_PREFIX_PATH=$sdk" "-DCMAKE_INSTALL_PREFIX=$stage" "-DSWAPP_OBS_SDK=$sdk" "-DSWAPP_OBS_ROOT=$obs" "-DSWAPP_OBS_SOURCE=$sourceTree"
if ($LASTEXITCODE -ne 0) { throw "CMake configuration failed; SDK must export OBS::libobs." }
& cmake --build $build --config Release --parallel 4
if ($LASTEXITCODE -ne 0) { throw "Native libobs host build failed" }
$exe = Join-Path $build "Release\swapp-libobs-host.exe"
Require-File $exe

# Do not leave partially staged binaries that make the UI claim libobs is available.
$work = Join-Path $localAgent "libobs-runtime-staging"
if (Test-Path $work) { Remove-Item -LiteralPath $work -Recurse -Force }
New-Item -ItemType Directory -Force -Path $work | Out-Null
try {
  Copy-Verified $exe (Join-Path $work "swapp-libobs-host.exe")
  Copy-Verified (Join-Path $sourceTree "COPYING") (Join-Path $work "GPL-2.0-LICENSE.txt")
  Get-ChildItem -LiteralPath $obsBin -File -Filter "*.dll" |
    ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $work -Force }

  $libobsData = Join-Path $obs "data\libobs"
  if (Test-Path $libobsData -PathType Container) {
    New-Item -ItemType Directory -Force -Path (Join-Path $work "data") | Out-Null
    Copy-Item -LiteralPath $libobsData -Destination (Join-Path $work "data") -Recurse -Force
  } else { Write-Warning "libobs effect/data folder missing; GPU setup may fail" }

  foreach ($name in $selected.Keys) {
    $module = $selected[$name]
    if ($module.layout -eq "core") {
      # Copy entire OBS 33 first-party module directory, including game capture hooks,
      # helper executables and locale/runtime assets. Copying only the DLL is insufficient.
      New-Item -ItemType Directory -Force -Path (Join-Path $work "core") | Out-Null
      Copy-Item -LiteralPath (Join-Path $core $name) -Destination (Join-Path $work "core") -Recurse -Force
    } else {
      $target = Join-Path $work "obs-plugins\64bit"
      New-Item -ItemType Directory -Force -Path $target | Out-Null
      Copy-Verified $module.file (Join-Path $target "$name.dll")
      $data = Join-Path $legacyData $name
      if (Test-Path $data -PathType Container) {
        $targetData = Join-Path $work "data\obs-plugins"
        New-Item -ItemType Directory -Force -Path $targetData | Out-Null
        Copy-Item -LiteralPath $data -Destination $targetData -Recurse -Force
      }
    }
  }

  $notice = @"
SWAPP Live native libobs host - GPL-2.0-or-later
OBS upstream version: 33.0.1
OBS upstream: https://github.com/obsproject/obs-studio/tree/33.0.1
SWAPP host source: https://github.com/XDSawyerLoL/Twitchappi/tree/feat/swapp-live-native-screen-capture-20261108/local-agent/libobs-host
Bundled binary redistribution must include complete corresponding source,
notices and dependency license review. Building locally does not imply
permission to publish or make claims about game-capture compatibility.
"@
  Set-Content -LiteralPath (Join-Path $work "SOURCE-NOTICE.txt") -Value $notice -Encoding UTF8
  # Commit only after all mandatory files and modules have been checked.
  if (Test-Path $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
  Move-Item -LiteralPath $work -Destination $stage
  Write-Host "libobs runtime staged at $stage"
} finally {
  if (Test-Path $work) { Remove-Item -LiteralPath $work -Recurse -Force }
}
