@echo off
title Hill Mades Store Server
cd /d "%~dp0"
echo ========================================================
echo   Starting Hill Mades Store Server...
echo   Storefront:  http://localhost:3000
echo   Admin Panel: http://localhost:3000/admin
echo ========================================================
timeout /t 1 >nul
start "" "http://localhost:3000"
node server.js
pause
