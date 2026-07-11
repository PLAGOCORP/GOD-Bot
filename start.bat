@echo off
title G.O.D. Bot
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js no encontrado. Instala desde https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instalando dependencias...
  call npm install
)

if not exist .env (
  copy .env.example .env
  echo.
  echo [!] Edita .env con DISCORD_TOKEN, CLIENT_ID, GUILD_ID
  notepad .env
  pause
)

echo Registrando slash commands...
call npm run deploy
if errorlevel 1 (
  echo Fallo al registrar comandos. Revisa .env
  pause
  exit /b 1
)

echo.
echo Iniciando God...
call npm start
pause
