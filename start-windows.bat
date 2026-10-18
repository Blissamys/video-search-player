@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 18 or newer, then run this file again.
  pause
  exit /b 1
)

set HOST=0.0.0.0
set PORT=3000
echo Starting video search API on http://localhost:3000 ...
node server.js
pause
