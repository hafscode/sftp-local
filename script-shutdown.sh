#!/usr/bin/env bash
# ===================================================
# ShareDrive Local LAN - Shutdown Script (Bash)
# ===================================================

echo "=================================================="
echo "🛑 Stopping ShareDrive Local LAN Application..."
echo "=================================================="

# Find PID listening on port 3000
PID=$(netstat -ano 2>/dev/null | grep ":3000" | grep "LISTENING" | awk '{print $5}' | head -n 1)

if [ -n "$PID" ]; then
  echo "Found running server PID: $PID. Terminating process..."
  taskkill //F //PID $PID 2>/dev/null || kill -9 $PID 2>/dev/null
  echo "✅ Server successfully stopped."
else
  echo "ℹ️ Server is not currently running on port 3000."
fi
