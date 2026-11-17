@echo off
title Hill Mades Store & Admin Launcher
echo ===================================================
echo   Hill Mades - Handcrafted Nilgiris Delicacies
echo   Starting web server on http://localhost:3000 ...
echo ===================================================
cd /d "%~dp0"

:: Wait 2 seconds for server startup, then open browser tabs automatically
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000 && start http://localhost:3000/admin"

:: Start Node.js server
node server.js
pause
