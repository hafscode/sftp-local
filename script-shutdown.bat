@echo off
REM ===================================================
REM ShareDrive Local LAN - Shutdown Script (Windows Batch)
REM ===================================================

echo ==================================================
echo 🛑 Stopping ShareDrive Local LAN Application...
echo ==================================================

set FOUND=0
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo Terminating server process PID: %%a ...
    taskkill /F /PID %%a >nul 2>&1
    set FOUND=1
)

if "%FOUND%"=="1" (
    echo ✅ Server successfully stopped.
) else (
    echo ℹ️ Server is not currently running on port 3000.
)
