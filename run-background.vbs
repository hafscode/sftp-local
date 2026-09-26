' ===================================================
' ShareDrive Silent Background Launcher VBScript
' Runs Node.js server.js without opening CMD window
' ===================================================
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "D:\sftp-apps"
WshShell.Run "node server.js", 0, False
