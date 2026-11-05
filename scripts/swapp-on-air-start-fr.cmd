@echo off
chcp 65001 >nul
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0swapp-on-air-start-fr.ps1"
if errorlevel 1 echo Erreur : regarde le message ci-dessus.
pause
