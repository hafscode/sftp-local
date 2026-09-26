@echo off
REM ===================================================
REM ShareDrive Local LAN - Start Script (Windows Batch)
REM ===================================================

cd /d "%~dp0"

echo ==================================================
echo 🚀 Starting ShareDrive Local LAN Application...
echo ==================================================

node server.js
