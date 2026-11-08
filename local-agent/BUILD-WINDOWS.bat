@echo off
setlocal
cd /d "%~dp0"
echo.
echo ===============================================
echo      SWAPP Live 1.2.1 - Construction Windows
echo ===============================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js est requis pour construire SWAPP Live.
  goto fail
)
where npm >nul 2>nul
if errorlevel 1 goto fail
echo Verification des tests de capture...
node --test "..\test\swapp-native-desktop-studio.test.js" "..\test\swapp-libobs-bridge.test.js" "..\test\swapp-libobs-package-gate.test.js"
if errorlevel 1 goto fail
echo.
if exist "libobs-runtime\swapp-libobs-host.exe" (
  echo Moteur libobs detecte. Verification obligatoire des licences et du runtime.
) else (
  echo Moteur libobs NON compile. L'EXE utilisera le moteur FFmpeg avec capture ecran.
  echo La capture de jeu Game Capture libobs ne sera pas disponible.
)
echo Verification de l'utilitaire Cloudflare signe par hachage...
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\ensure-cloudflared-windows.ps1"
if errorlevel 1 goto fail
echo Installation des dependances du programme...
call npm install --no-audit --no-fund
if errorlevel 1 goto fail
echo Compilation des fichiers Windows x64...
call npm run dist:win
if errorlevel 1 goto fail
if not exist "dist\SWAPP-Live-Portable-1.2.1-x64.exe" goto fail
if not exist "dist\SWAPP-Live-Setup-1.2.1-x64.exe" goto fail
echo.
echo APPLICATIONS CONSTRUITES :
echo   dist\SWAPP-Live-Portable-1.2.1-x64.exe
echo   dist\SWAPP-Live-Setup-1.2.1-x64.exe
echo.
echo Il reste a tester le flux sur un autre appareil.
pause
exit /b 0
:fail
echo.
echo ECHEC - aucune version ne doit etre publiee comme validee.
echo Verifie les messages au-dessus.
pause
exit /b 1
