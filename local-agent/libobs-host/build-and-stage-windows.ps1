# Package the official OBS 33.0.1 runtime in its original portable layout:
# bin/64bit/, core/<module>/, data/. This matters because OBS 33's new
# obs_load_core_modules() resolves ../../core relative to bin/64bit.
param(
  [Parameter(Mandatory=$true)][string]$SdkPrefix,
  [Parameter(Mandatory=$true)][string]$ObsPortableRoot,
  [Parameter(Mandatory=$true)][string]$ObsSourceRoot
)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$here=Split-Path -Parent $MyInvocation.MyCommand.Path
$agent=(Resolve-Path (Join-Path $here '..')).Path
$stage=Join-Path $agent 'libobs-runtime'
$build=Join-Path $here 'build'
function Require-File([string]$file){
 if (!(Test-Path -LiteralPath $file -PathType Leaf)) {throw "Missing required file: $file"}
}
if($env:OS -ne 'Windows_NT' -or ![Environment]::Is64BitOperatingSystem){throw 'Requires Windows x64'}
$obs=(Resolve-Path -LiteralPath $ObsPortableRoot).Path
$sdk=(Resolve-Path -LiteralPath $SdkPrefix).Path
$source=(Resolve-Path -LiteralPath $ObsSourceRoot).Path
$bin=Join-Path $obs 'bin\64bit'
$core=Join-Path $obs 'core'
$data=Join-Path $obs 'data'
Require-File (Join-Path $bin 'obs.dll')
Require-File (Join-Path $bin 'libobs-d3d11.dll')
Require-File (Join-Path $source 'COPYING')
Require-File (Join-Path $sdk 'lib\obs.lib')
if(!(Test-Path $core -PathType Container)){throw 'Missing OBS 33 core modules directory'}
if(!(Test-Path $data -PathType Container)){throw 'Missing OBS 33 data directory'}

# All core modules are required: obs.dll contains a fixed list of first-party
# modules, and its loader stops if a required module is missing.
$essential=@('win-capture','win-wasapi','win-dshow','obs-outputs','obs-x264','obs-ffmpeg','rtmp-services')
foreach($name in $essential){Require-File (Join-Path (Join-Path $core $name) "$name.dll")}

& cmake -S $here -B $build -A x64 "-DCMAKE_PREFIX_PATH=$sdk" "-DSWAPP_OBS_SDK=$sdk" "-DSWAPP_OBS_ROOT=$obs" "-DSWAPP_OBS_SOURCE=$source"
if($LASTEXITCODE -ne 0){throw 'CMake configuration failed'}
& cmake --build $build --config Release --parallel 4
if($LASTEXITCODE -ne 0){throw 'Native libobs compile failed'}
$exe=Join-Path $build 'Release\swapp-libobs-host.exe'
Require-File $exe

# Stage into a temporary directory. Never leave an incomplete runtime that the
# desktop app mistakes for a valid native capture engine.
$work=Join-Path $agent 'libobs-runtime-staging'
if(Test-Path $work){Remove-Item -LiteralPath $work -Recurse -Force}
New-Item -ItemType Directory -Force -Path $work | Out-Null
try{
 $destBin=Join-Path $work 'bin\64bit'
 New-Item -ItemType Directory -Force -Path $destBin | Out-Null
 Copy-Item -LiteralPath $exe -Destination (Join-Path $destBin 'swapp-libobs-host.exe') -Force
 Get-ChildItem -LiteralPath $bin -File -Filter '*.dll' |
  ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination $destBin -Force}
 # Additional helper executables and hook assets reside inside the complete
 # official core module trees. Do not cherry-pick only .dll files.
 Copy-Item -LiteralPath $core -Destination (Join-Path $work 'core') -Recurse -Force
 Copy-Item -LiteralPath $data -Destination (Join-Path $work 'data') -Recurse -Force
 $plugins=Join-Path $obs 'obs-plugins'
 if(Test-Path $plugins -PathType Container){
  Copy-Item -LiteralPath $plugins -Destination (Join-Path $work 'obs-plugins') -Recurse -Force
 }
 Copy-Item -LiteralPath (Join-Path $source 'COPYING') -Destination (Join-Path $work 'GPL-2.0-LICENSE.txt') -Force
 @"
SWAPP Live native host - GNU GPL-2.0-or-later
OBS Studio 33.0.1 official x64 binaries and corresponding sources
Upstream source: https://github.com/obsproject/obs-studio/tree/33.0.1
Original archive (SHA256 checked): OBS-Studio-33.0.1-Sources.tar.gz
SWAPP C++ and build scripts:
https://github.com/XDSawyerLoL/Twitchappi/tree/feat/swapp-live-native-screen-capture-20261108/local-agent/libobs-host
Keep complete corresponding source and third-party copyright notices
accessible with any binary distribution.
"@ | Set-Content -LiteralPath (Join-Path $work 'SOURCE-NOTICE.txt') -Encoding UTF8
 if(Test-Path $stage){Remove-Item -LiteralPath $stage -Recurse -Force}
 Move-Item -LiteralPath $work -Destination $stage
 Write-Host "Official OBS 33 runtime staged: $stage"
}finally{
 if(Test-Path $work){Remove-Item -LiteralPath $work -Recurse -Force}
}
