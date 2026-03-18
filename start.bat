@echo off
set PORT=9123

where python >nul 2>&1 && (
    echo Starting Gmail Cleanup on http://localhost:%PORT% using Python
    start http://localhost:%PORT%
    python -m http.server %PORT%
    goto :eof
)

where npx >nul 2>&1 && (
    echo Starting Gmail Cleanup on http://localhost:%PORT% using Node
    start http://localhost:%PORT%
    npx serve -l %PORT%
    goto :eof
)

echo ERROR: No suitable server found.
echo Install Python (https://python.org) or Node.js (https://nodejs.org)
pause
