Set-Location $PSScriptRoot
Write-Host "Installation des dependances Oryon Local..."
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install a echoue" }
Write-Host "Construction de l'application Windows..."
npm run dist:win
if ($LASTEXITCODE -ne 0) { throw "electron-builder a echoue" }
Write-Host "OK. Les fichiers sont dans le dossier dist."
