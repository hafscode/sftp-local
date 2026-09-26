#!/usr/bin/env bash
# ===================================================
# ShareDrive Local LAN - Start Script (Bash)
# ===================================================

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "=================================================="
echo "🚀 Starting ShareDrive Local LAN Application..."
echo "=================================================="

node server.js
