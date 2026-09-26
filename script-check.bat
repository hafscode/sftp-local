@echo off
REM ===================================================
REM ShareDrive Local LAN - Status Check Script (Windows Batch)
REM ===================================================

echo ==================================================
echo 🔍 Checking ShareDrive Local LAN Server Status...
echo ==================================================

set RUNNING=0
set PID=0

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    set RUNNING=1
    set PID=%%a
)

if "%RUNNING%"=="1" (
    echo ✅ STATUS: RUNNING ^(ONLINE^)
    echo 📌 Process PID  : %PID%
    echo 🌐 Port         : 3000
    echo 🔗 URL Local    : http://localhost:3000
    echo 🏠 Admin Panel  : http://localhost:3000/admin.html
    echo ==================================================
    pause
    exit /b 0
) else (
    echo ❌ STATUS: STOPPED ^(OFFLINE^)
    echo ℹ️ Server is not currently running on port 3000.
    echo 👉 Double-click 'script-run.bat' to start the application.
    echo ==================================================
    pause
    exit /b 1
)
