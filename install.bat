@echo off
setlocal EnableDelayedExpansion

echo ============================================================
echo  OneFlow ERP - First-Time Installation
echo ============================================================
echo.

REM ── Check Python ─────────────────────────────────────────────
where python >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed or not on PATH.
    echo         Download Python 3.11+ from https://www.python.org/downloads/
    echo         During install, tick "Add Python to PATH".
    pause
    exit /b 1
)
for /f "tokens=2 delims= " %%v in ('python --version 2^>^&1') do set PYVER=%%v
echo [OK] Python %PYVER% found.

REM ── Check Node.js ─────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not on PATH.
    echo         Download Node.js 18 LTS from https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=1" %%v in ('node --version 2^>^&1') do set NODEVER=%%v
echo [OK] Node.js %NODEVER% found.

REM ── Backend: create venv and install packages ─────────────────
echo.
echo [1/4] Setting up Python virtual environment...
cd /d "%~dp0backend"
if not exist "venv" (
    python -m venv venv
)
call venv\Scripts\activate.bat
python -m pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet
if errorlevel 1 (
    echo [ERROR] pip install failed. Check requirements.txt and your Python version.
    pause
    exit /b 1
)
echo [OK] Backend dependencies installed.

REM ── Frontend: install npm packages ───────────────────────────
echo.
echo [2/4] Installing frontend dependencies...
cd /d "%~dp0frontend"
call npm install
if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
)
echo [OK] Frontend dependencies installed.

REM ── Detect local IP and write to frontend env ─────────────────
echo.
echo [3/4] Detecting local IP address...
cd /d "%~dp0frontend"
node scripts\detect-backend.js
echo [OK] Backend URL written to .env.local

REM ── Build the frontend ────────────────────────────────────────
echo.
echo [4/4] Building frontend (this may take a minute)...
call npm run build
if errorlevel 1 (
    echo [ERROR] Frontend build failed.
    pause
    exit /b 1
)
echo [OK] Frontend built.

REM ── Firewall rules ─────────────────────────────────────────────
echo.
echo Adding Windows Firewall rules for ports 8000 and 3000...
netsh advfirewall firewall add rule name="OneFlow Backend (8000)" dir=in action=allow protocol=TCP localport=8000 >nul 2>&1
netsh advfirewall firewall add rule name="OneFlow Frontend (3000)" dir=in action=allow protocol=TCP localport=3000 >nul 2>&1
echo [OK] Firewall rules added.

echo.
echo ============================================================
echo  Installation complete!
echo  Run start.bat to launch OneFlow.
echo ============================================================
pause
