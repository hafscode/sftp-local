@echo off
REM ===================================================
REM Windows AutoStart Uninstaller for ShareDrive LAN
REM ===================================================

set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set SHORTCUT_VBS=%STARTUP_DIR%\ShareDrive-AutoStart.vbs

echo ==================================================
echo 🛑 Removing Windows AutoStart for ShareDrive...
echo ==================================================

if exist "%SHORTCUT_VBS%" (
    del /F /Q "%SHORTCUT_VBS%"
    echo ✅ AutoStart shortcut removed successfully.
) else (
    echo ℹ️ AutoStart shortcut was not found in Startup folder.
)

echo ==================================================
pause
