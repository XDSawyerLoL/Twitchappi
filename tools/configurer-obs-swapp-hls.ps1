# SWAPP Live / OBS Studio — one-time service preset installation.
# Changes only the current user's OBS configuration; no application installed.
# Backups are created before changing files.
$ErrorActionPreference = 'Stop'
if (Get-Process -Name obs64 -ErrorAction SilentlyContinue) {
  throw 'Ferme OBS Studio avant de configurer SWAPP.'
}
if (-not $env:APPDATA) { throw 'Profil Windows introuvable.' }
$dir = Join-Path $env:APPDATA 'obs-studio\plugin_config\rtmp-services'
$source = Join-Path $dir 'services.json'
$package = Join-Path $dir 'package.json'
if (-not (Test-Path $source)) {
  $bundled = Join-Path $env:ProgramFiles 'obs-studio\data\obs-plugins\rtmp-services\services.json'
  if (-not (Test-Path $bundled)) {
    throw 'Liste des services OBS introuvable. Lance OBS une fois, puis recommence.'
  }
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
  Copy-Item $bundled $source
}
$service = @'
{
 "name":"SWAPP Live (HTTPS HLS)",
 "common":false,
 "protocol":"HLS",
 "servers":[{"name":"SWAPP Direct - France","url":"https://swapp.tv/api/swapp/obs-hls/put?cid={stream_key}&file=index.m3u8"}],
 "supported video codecs":["h264"],
 "recommended":{"keyint":2,"output":"ffmpeg_hls_muxer","max video bitrate":8000,"max audio bitrate":160}
}
'@ | ConvertFrom-Json
$catalog = Get-Content -LiteralPath $source -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $catalog.services) { throw 'Format des services OBS incompatible.' }
$stamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
Copy-Item $source ($source + '.' + $stamp + '.bak')
$catalog.services = @($catalog.services | Where-Object { $_.name -ne $service.name }) + @($service)
$catalog | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $source -Encoding UTF8

if (-not (Test-Path $package)) {
  $bundledPkg = Join-Path $env:ProgramFiles 'obs-studio\data\obs-plugins\rtmp-services\package.json'
  if (Test-Path $bundledPkg) { Copy-Item $bundledPkg $package }
}
if (Test-Path $package) {
  Copy-Item $package ($package + '.' + $stamp + '.bak')
  $manifest = Get-Content -LiteralPath $package -Raw -Encoding UTF8 | ConvertFrom-Json
  $manifest.version = [int]$manifest.version + 1
  foreach ($item in $manifest.files) {
    if ($item.name -eq 'services.json') { $item.version = [int]$manifest.version }
  }
  $manifest | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $package -Encoding UTF8
}
Write-Host 'SWAPP Live (HTTPS HLS) ajouté dans OBS. Aucun SWAPP Local requis.' -ForegroundColor Green
Write-Host 'Ouvre OBS > Paramètres > Stream > Afficher tous les services > SWAPP Live (HTTPS HLS).'
Write-Host 'Récupère ta clé privée dans le dashboard streamer SWAPP.'
