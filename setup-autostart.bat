@echo off
REM ===================================================
REM Windows AutoStart Installer for ShareDrive LAN
REM Copies silent launcher VBS to Startup Folder
REM ===================================================

set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set TARGET_VBS=D:\sftp-apps\run-background.vbs
set SHORTCUT_VBS=%STARTUP_DIR%\ShareDrive-AutoStart.vbs

echo ==================================================
echo ⚙️ Configuring Windows AutoStart for ShareDrive...
echo ==================================================

copy /Y "%TARGET_VBS%" "%SHORTCUT_VBS%" >nul

if exist "%SHORTCUT_VBS%" (
    echo ✅ AutoStart setup SUCCESSFUL!
    echo 📌 ShareDrive Server will now start automatically whenever Windows boots/restarts.
    echo 📁 Startup VBS: %SHORTCUT_VBS%
) else (
    echo ❌ Failed to copy startup file. Please run as Administrator.
)

echo ==================================================
pause
