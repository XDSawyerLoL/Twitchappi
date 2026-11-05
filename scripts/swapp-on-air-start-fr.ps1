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
function Open-SwappStudio {
 # The generated MP3 remains local. Only public editorial metadata goes to
 # the URL fragment; this step needs NO Python environment or paid API.
 $data=Get-Content -LiteralPath $episode -Raw -Encoding UTF8 | ConvertFrom-Json
 $metadata=@{
  title=$data.title
  description=$data.description
  slug=$data.slug
  sources=@($data.sources)
  articles=@($data.articles)
 } | ConvertTo-Json -Depth 10 -Compress
 $bytes=[System.Text.Encoding]::UTF8.GetBytes($metadata)
 $fragment=[Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
 $url='https://swapp.tv/on-air/studio#prefill='+$fragment
 Write-Host 'Episode MP3 : ' $mp3
 Write-Host 'Le studio va ouvrir une fiche pre-remplie.'
 Write-Host 'Selectionne le fichier MP3, ecoute-le et approuve le contenu.'
 Start-Process $url
}
function Test-PythonVersion($exe,$version){
 $prior=$ErrorActionPreference
 try{
  # Windows PowerShell 5.1 can promote harmless stderr from a missing
  # Python version to a terminating error when the global preference is Stop.
  $ErrorActionPreference='SilentlyContinue'
  if($version){
   & $exe $version -c "import sys; assert (3, 10) <= sys.version_info[:2] < (3, 14)" 2>$null
  }else{
   & $exe -c "import sys; assert (3, 10) <= sys.version_info[:2] < (3, 14)" 2>$null
  }
  return ($LASTEXITCODE -eq 0)
 }catch{ return $false }
 finally{ $ErrorActionPreference=$prior }
}
Write-Host 'SWAPP ON AIR - NOVA / KERN - premier vrai episode' -ForegroundColor Cyan
if(Test-Path $mp3){
 Write-Host 'MP3 deja genere : aucun nouveau telechargement ni installation.' -ForegroundColor Green
 Open-SwappStudio
 exit 0
}
if(!(Test-Path $episode)){Fail 'Dialogue source manquant'}
if(!(Test-Path $python)){
 $launcher=$null
 if((Get-Command py -ErrorAction SilentlyContinue) -and (Test-PythonVersion 'py' '-3.12')){
  $launcher=@('py','-3.12')
 }
 if(!$launcher -and (Get-Command py -ErrorAction SilentlyContinue) -and (Test-PythonVersion 'py' '-3')){
  $launcher=@('py','-3')
 }
 if(!$launcher -and (Get-Command python -ErrorAction SilentlyContinue) -and (Test-PythonVersion 'python' '')){
  $launcher=@('python')
 }
 if(!$launcher){Fail 'Python 3.12 conseille. Installe Python depuis python.org, puis relance.'}
 Write-Host 'Premiere preparation : Python isole, modeles ouverts, aucun paiement.' -ForegroundColor Yellow
 Write-Host 'Il faut plusieurs Go libres, une connexion pour le premier telechargement et idealement une carte NVIDIA.' 
 $answer=Read-Host 'Saisis OUI pour autoriser l installation gratuite'
 if($answer -cne 'OUI'){Write-Host 'Aucune installation effectuee.';exit 0}
 New-Item -ItemType Directory -Path $privateDir -Force | Out-Null
 if($launcher.Count -eq 2){& py $launcher[1] -m venv $venv}
 else{& python -m venv $venv}
 if($LASTEXITCODE -ne 0){Fail 'Creation Python isole impossible'}
}
if(!(Test-Path $python)){Fail 'Python virtuel introuvable'}
if(Test-Path $output){
 Write-Host 'WAV existant : conversion MP3 uniquement, sans recalcul des voix.' -ForegroundColor Cyan
 & $python -c "import imageio_ffmpeg"
 if($LASTEXITCODE -ne 0){
  Write-Host 'Installation gratuite du convertisseur MP3 portable...' -ForegroundColor Yellow
  & $python -m pip install --disable-pip-version-check 'imageio-ffmpeg>=0.6,<1'
  if($LASTEXITCODE -ne 0){Fail 'Convertisseur MP3 non disponible'}
 }
 & $python (Join-Path $repo 'scripts\swapp-on-air-qwen-local.py') --episode $episode --output $output --encode-only
 if($LASTEXITCODE -ne 0){Fail 'Conversion WAV vers MP3 impossible; le WAV reste intact'}
 if(!(Test-Path $mp3)){Fail 'Aucun MP3 valide genere'}
 Open-SwappStudio
 exit 0
}
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
& $python -c "import torch,sys; print('CUDA active :',torch.cuda.is_available()); sys.exit(0 if torch.cuda.is_available() else 1)"
if($LASTEXITCODE -ne 0 -and !$AutoriserCPU){
 $nvidia=Get-Command nvidia-smi -ErrorAction SilentlyContinue
 if($nvidia){
  Write-Host 'Carte NVIDIA detectee, mais PyTorch ne dispose pas de CUDA.' -ForegroundColor Yellow
  Write-Host 'Installation facultative du moteur CUDA officiel PyTorch 2.9 / CUDA 12.8. Plusieurs Go de telechargement possibles.' -ForegroundColor Yellow
  $choice=Read-Host 'Saisis OUI pour installer les bibliotheques NVIDIA officielles'
  if($choice -cne 'OUI'){Fail 'GPU inactif. Aucune installation CUDA effectuee.'}
  & $python -m pip install --disable-pip-version-check 'torch==2.9.0' 'torchaudio==2.9.0' --index-url https://download.pytorch.org/whl/cu128
  if($LASTEXITCODE -ne 0){Fail 'Impossible d installer PyTorch CUDA. Verifie GPU, pilote et version Python.'}
  & $python -c "import torch,sys; print('CUDA active :',torch.cuda.is_available()); sys.exit(0 if torch.cuda.is_available() else 1)"
 }
 if($LASTEXITCODE -ne 0){
  Fail "CUDA indisponible. Verifie les pilotes NVIDIA. Sans GPU, lance le script avec -AutoriserCPU (beaucoup plus lent)."
 }
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
Open-SwappStudio
Write-Host "MP3 genere. Ecoute-le integralement avant toute publication : $mp3" -ForegroundColor Green
