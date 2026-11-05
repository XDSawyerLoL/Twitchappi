param(
 [switch]$AutoriserCPU
)
$ErrorActionPreference='Stop'
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repo
$episode=Join-Path $repo 'data\swapp-on-air\episode-pikmin-20261105.json'
$privateDir=Join-Path $repo '.swapp-on-air-private'
$venv=Join-Path $privateDir 'venv'
$python=Join-Path $venv 'Scripts\python.exe'
$output=Join-Path $privateDir 'swapp-pikmin-20261105.wav'
$mp3=[System.IO.Path]::ChangeExtension($output,'mp3')
function Fail($message){
 Write-Host ("ERREUR : "+$message) -ForegroundColor Red
 exit 1
}
Write-Host 'SWAPP ON AIR - NOVA / KERN - premier vrai episode' -ForegroundColor Cyan
if(Test-Path $mp3){
 Write-Host 'Un MP3 existe deja : aucune re-generation ni ecrasement.' -ForegroundColor Yellow
 Write-Host $mp3
 & $python (Join-Path $repo 'scripts\swapp-on-air-open-studio.py') --episode $episode --audio $mp3
 if($LASTEXITCODE -ne 0){Fail 'Ouverture du studio impossible'}
 exit 0
}
if(!(Test-Path $episode)){Fail 'Dialogue source manquant'}
if(!(Test-Path $python)){
 $launcher=$null
 if(Get-Command py -ErrorAction SilentlyContinue){
  & py -3.12 -c "import sys; print(sys.version)" 2>$null
  if($LASTEXITCODE -eq 0){$launcher=@('py','-3.12')}
 }
 if(!$launcher -and (Get-Command python -ErrorAction SilentlyContinue)){
  & python -c "import sys; assert sys.version_info >= (3,10); assert sys.version_info < (3,14)" 2>$null
  if($LASTEXITCODE -eq 0){$launcher=@('python')}
 }
 if(!$launcher){Fail 'Python 3.12 conseille. Installe Python depuis python.org, puis relance.'}
 Write-Host 'Premiere preparation : Python isole, modeles ouverts, aucun paiement.' -ForegroundColor Yellow
 Write-Host 'Il faut plusieurs Go libres, une connexion pour le premier telechargement et idealement une carte NVIDIA.' 
 $answer=Read-Host 'Saisis OUI pour autoriser l installation gratuite'
 if($answer -cne 'OUI'){Write-Host 'Aucune installation effectuee.';exit 0}
 New-Item -ItemType Directory -Path $privateDir -Force | Out-Null
 if($launcher.Count -eq 2){& py -3.12 -m venv $venv}
 else{& python -m venv $venv}
 if($LASTEXITCODE -ne 0){Fail 'Creation Python isole impossible'}
}
if(!(Test-Path $python)){Fail 'Python virtuel introuvable'}
try{
 & $python -c "import qwen_tts, imageio_ffmpeg, torch"
 if($LASTEXITCODE -ne 0){throw 'Modules indisponibles'}
}catch{
 Write-Host 'Installation des bibliotheques libres Qwen3 et FFmpeg portable...' -ForegroundColor Yellow
 & $python -m pip install --disable-pip-version-check --upgrade pip
 if($LASTEXITCODE -ne 0){Fail 'Mise a jour pip impossible'}
 & $python -m pip install --disable-pip-version-check 'qwen-tts==0.1.1' 'imageio-ffmpeg>=0.6,<1'
 if($LASTEXITCODE -ne 0){Fail 'Installation Qwen3-TTS impossible. Aucune API payante utilisee.'}
}
& $python -c "import torch; print('CUDA active :',torch.cuda.is_available()); exit(0 if torch.cuda.is_available() else 1)"
if($LASTEXITCODE -ne 0 -and !$AutoriserCPU){
 Fail "CUDA absent. Verifie les pilotes NVIDIA et PyTorch GPU. Pour tenter le calcul CPU (tres lent), lance le script PowerShell avec -AutoriserCPU."
}
$args=@(
 (Join-Path $repo 'scripts\swapp-on-air-qwen-design-fr.py'),
 '--episode',$episode,'--output',$output,'--clone-size','light',
 '--render','--allow-download'
)
if($AutoriserCPU){$args+='--allow-cpu'}
Write-Host 'Generation locale de deux voix francaises distinctes : aucune cle d API requise.'
& $python @args
if($LASTEXITCODE -ne 0){Fail 'Synthese interrompue. Verifie le GPU, la RAM et la connexion au telechargement des poids.'}
if(!(Test-Path $mp3)){Fail 'Le WAV existe peut-etre, mais aucun MP3 encode. Verifie imageio-ffmpeg.'}
& $python (Join-Path $repo 'scripts\swapp-on-air-open-studio.py') --episode $episode --audio $mp3
if($LASTEXITCODE -ne 0){Fail 'Impossible d ouvrir le studio; le MP3 est bien conserve sur disque'}
Write-Host "MP3 genere. Ecoute-le integralement avant toute publication : $mp3" -ForegroundColor Green
