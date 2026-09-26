#!/usr/bin/env bash
# ===================================================
# ShareDrive Local LAN - Status Check Script (Bash)
# ===================================================

echo "=================================================="
echo "🔍 Checking ShareDrive Local LAN Server Status..."
echo "=================================================="

# Check if port 3000 is listening
PID=$(netstat -ano 2>/dev/null | grep ":3000" | grep "LISTENING" | awk '{print $5}' | head -n 1)

if [ -n "$PID" ]; then
  echo "✅ STATUS: RUNNING (ONLINE)"
  echo "📌 Process PID  : $PID"
  echo "🌐 Port         : 3000"
  
  # Try HTTP health check
  HTTP_CHECK=$(curl -s http://localhost:3000/api/system-info 2>/dev/null)
  if [ -n "$HTTP_CHECK" ]; then
    echo "⚡ HTTP Status  : 200 OK (API Responding)"
    echo "🔗 URL Local    : http://localhost:3000"
    echo "🏠 Admin Panel  : http://localhost:3000/admin.html"
  else
    echo "⚠️ HTTP Status  : Server port active but HTTP API failed to respond."
  fi
  echo "=================================================="
  exit 0
else
  echo "❌ STATUS: STOPPED (OFFLINE)"
  echo "ℹ️ Server is not currently running on port 3000."
  echo "👉 Run './script-run.sh' or double-click 'script-run.bat' to start."
  echo "=================================================="
  exit 1
fi
