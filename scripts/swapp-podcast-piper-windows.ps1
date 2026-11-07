param([switch]$InstallerVoix)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repo
$privateDir = Join-Path $repo '.swapp-on-air-private'
$venv = Join-Path $privateDir 'piper-venv'
$python = Join-Path $venv 'Scripts\python.exe'
$models = Join-Path $privateDir 'piper-voices'
$episode = Join-Path $repo 'data\swapp-on-air\episode-pikmin-20261105.json'
$output = Join-Path $privateDir 'swapp-podcast-pikmin-piper-v1.mp3'
if(!(Get-Command ffmpeg -ErrorAction SilentlyContinue)){throw 'FFmpeg doit être disponible dans PATH.'}
if(!(Test-Path $python)){
  $py = Get-Command py -ErrorAction SilentlyContinue
  if(!$py){throw 'Python 3.10+ requis (commande py).'}
  Write-Host 'Preparation de l environnement Python prive...'
  New-Item -ItemType Directory -Path $privateDir -Force | Out-Null
  & py -3 -m venv $venv
  if($LASTEXITCODE -ne 0){throw 'Echec de creation du venv'}
}
& $python -c 'import piper'
if($LASTEXITCODE -ne 0){
  Write-Host 'Installation gratuite du moteur neuronal Piper...'
  & $python -m pip install --disable-pip-version-check 'piper-tts'
  if($LASTEXITCODE -ne 0){throw 'Piper indisponible'}
}
$runner = Join-Path $repo 'scripts\swapp-podcast-piper-cpu.py'
$args = @($runner,'--episode',$episode,'--voice-dir',$models,'--output',$output,'--render')
if($InstallerVoix){$args+='--download-voices'}
& $python @args
if($LASTEXITCODE -ne 0){throw 'Generation audio interrompue. Ancien episode conserve.'}
Write-Host "NOUVEAU MP3 LOCAL : $output" -ForegroundColor Green
Write-Host 'Ecoute integrale et verification editoriale requises. Aucune publication automatique.'
