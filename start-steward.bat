@echo off
REM Launch the Steward app locally and open it in the browser.
cd /d "%~dp0steward"

REM Open the browser after a short delay, so the server has time to boot.
start "" /b cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:3000"

echo Starting Steward on http://localhost:3000
echo Close this window (or press Ctrl+C) to stop the app.
call npm run dev
