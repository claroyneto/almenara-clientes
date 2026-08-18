@echo off
cd /d "%~dp0"
echo Actualizando desde GitHub...
git pull
echo.
echo Abriendo Claude Code...
claude
