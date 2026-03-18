#!/bin/sh
PORT=9123

if command -v python3 >/dev/null 2>&1; then
    echo "Starting Gmail Cleanup on http://localhost:$PORT using Python"
    open "http://localhost:$PORT" 2>/dev/null || xdg-open "http://localhost:$PORT" 2>/dev/null &
    python3 -m http.server $PORT
elif command -v npx >/dev/null 2>&1; then
    echo "Starting Gmail Cleanup on http://localhost:$PORT using Node"
    open "http://localhost:$PORT" 2>/dev/null || xdg-open "http://localhost:$PORT" 2>/dev/null &
    npx serve -l $PORT
else
    echo "ERROR: No suitable server found."
    echo "Install Python (https://python.org) or Node.js (https://nodejs.org)"
    exit 1
fi
