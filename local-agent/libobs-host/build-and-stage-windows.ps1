param(
  [Parameter(Mandatory = $true)][string]$SdkPrefix,
  [Parameter(Mandatory = $true)][string]$ObsPortableRoot
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$localAgent = Resolve-Path (Join-Path $here "..")
$stage = Join-Path $localAgent "libobs-runtime"
$build = Join-Path $here "build"

function Require-File([string]$path) {
  if (!(Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required OBS runtime missing: $path" }
}
function Copy-Verified([string]$source,[string]$destination) {
  Require-File $source
  Copy-Item -LiteralPath $source -Destination $destination -Force
}

if ($env:OS -ne "Windows_NT") { throw "Requires Windows x64" }
$obs = (Resolve-Path -LiteralPath $ObsPortableRoot).Path
$sdk = (Resolve-Path -LiteralPath $SdkPrefix).Path
$obsBin = Join-Path $obs "bin\64bit"
$obsPlugins = Join-Path $obs "obs-plugins\64bit"
$obsData = Join-Path $obs "data\obs-plugins"
Require-File (Join-Path $obsBin "libobs.dll")
Require-File (Join-Path $obsBin "libobs-d3d11.dll")

Write-Host "Building SWAPP libobs host against the existing OBS SDK..."
& cmake -S $here -B $build -A x64 "-DCMAKE_PREFIX_PATH=$sdk" "-DCMAKE_INSTALL_PREFIX=$stage"
if ($LASTEXITCODE -ne 0) { throw "CMake configuration failed" }
& cmake --build $build --config Release --parallel 4
if ($LASTEXITCODE -ne 0) { throw "Native host build failed" }

$exe = Join-Path $build "Release\swapp-libobs-host.exe"
Require-File $exe

New-Item -ItemType Directory -Force -Path $stage | Out-Null
Copy-Verified $exe (Join-Path $stage "swapp-libobs-host.exe")
# Carry all binary dependencies from matching OBS runtime. We do not package obs64.exe
# (the OBS Studio interface is not run or installed by SWAPP).
Get-ChildItem -LiteralPath $obsBin -File -Filter "*.dll" |
  ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $stage -Force }

$pluginsDest = Join-Path $stage "obs-plugins\64bit"
$dataDest = Join-Path $stage "data\obs-plugins"
New-Item -ItemType Directory -Force -Path $pluginsDest, $dataDest | Out-Null
$needed = @("win-capture", "win-wasapi", "obs-outputs", "obs-x264", "obs-ffmpeg", "obs-nvenc")
foreach ($plugin in $needed) {
  $source = Join-Path $obsPlugins "$plugin.dll"
  if ($plugin -eq "obs-nvenc" -and !(Test-Path $source)) {
    Write-Warning "NVIDIA encoder unavailable: x264 can be used instead"
    continue
  }
  Copy-Verified $source (Join-Path $pluginsDest "$plugin.dll")
  $pluginData = Join-Path $obsData $plugin
  if (Test-Path $pluginData -PathType Container) {
    Copy-Item -LiteralPath $pluginData -Destination $dataDest -Recurse -Force
  }
}
# OBS Game Capture needs the hook and helper executables shipped with its official runtime.
Get-ChildItem -LiteralPath $obsPlugins -File |
  Where-Object { $_.Name -match '^(graphics-hook|inject-helper|get-graphics-offsets)' } |
  ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $pluginsDest -Force }

$notice = @"
SWAPP Live libobs native host
Derived from OBS Studio $($obs): https://github.com/obsproject/obs-studio
Recommended matching upstream tag: 33.0.1
License: GNU GPL version 2 or (at your option) any later version.
The corresponding upstream source is available at:
https://github.com/obsproject/obs-studio/tree/33.0.1
SWAPP host source is available in the SWAPP repository:
https://github.com/XDSawyerLoL/Twitchappi/tree/master/local-agent/libobs-host
This staging operation is not an authorization to redistribute.
Review and include corresponding sources and third-party licenses
for all distributed binaries and the complete combined application.
"@
Set-Content -LiteralPath (Join-Path $stage "SOURCE-NOTICE.txt") -Value $notice -Encoding UTF8
Write-Host "Native runtime staged at $stage"
Write-Host "BEFORE REDISTRIBUTION: review GPL and complete corresponding source obligations."
