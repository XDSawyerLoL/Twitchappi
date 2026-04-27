@echo off
setlocal
cd /d %~dp0
echo Installation des dependances Oryon Local...
call npm install
if errorlevel 1 goto fail
echo Construction de l'application Windows...
call npm run dist:win
if errorlevel 1 goto fail
echo.
echo OK. Les fichiers sont dans le dossier dist.
pause
exit /b 0
:fail
echo.
echo ERREUR pendant la construction. Verifie Node.js, npm et ta connexion internet.
pause
exit /b 1
