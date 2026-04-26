@echo off
cd /d %~dp0
echo Installation / mise a jour d'Oryon Local...
npm install
if errorlevel 1 (
  echo.
  echo Erreur: Node.js est requis. Installe Node.js LTS depuis https://nodejs.org/
  pause
  exit /b 1
)
echo.
echo Lancement d'Oryon Local...
npm run app
pause
