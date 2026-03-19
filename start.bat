@echo off
setlocal EnableDelayedExpansion

REM ── Detect current machine IP and refresh .env.local ─────────
cd /d "%~dp0frontend"
node scripts\detect-backend.js >nul 2>&1

echo ============================================================
echo  Starting OneFlow ERP
echo ============================================================
echo.

REM ── Start backend in a new window ────────────────────────────
echo Starting backend (port 8000)...
start "OneFlow Backend" cmd /k "cd /d "%~dp0backend" && call venv\Scripts\activate.bat && uvicorn app.main:app --host 0.0.0.0 --port 8000"

REM ── Give backend a moment to initialise ──────────────────────
timeout /t 3 /nobreak >nul

REM ── Start frontend in a new window ───────────────────────────
echo Starting frontend (port 3000)...
start "OneFlow Frontend" cmd /k "cd /d "%~dp0frontend" && npm run start"

echo.
echo ============================================================
echo  OneFlow is running.
echo  Open your browser to:  http://localhost:3000
echo  To stop:               run stop.bat
echo ============================================================
