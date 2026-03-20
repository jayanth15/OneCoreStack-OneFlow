@echo off
setlocal EnableDelayedExpansion

REM ── Require administrator privileges (services need it) ───────
net session >nul 2>&1
if errorlevel 1 (
    echo Requesting administrator privileges...
    powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs -Wait"
    exit /b
)

REM ── Resolve paths ─────────────────────────────────────────────
set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
set "BACKEND=%ROOT%\backend"
set "FRONTEND=%ROOT%\frontend"
set "TOOLS=%ROOT%\tools"
set "LOGS=%ROOT%\logs"
set "NSSM=%TOOLS%\nssm.exe"

if not exist "%NSSM%" (
    echo [ERROR] NSSM not found at %TOOLS%\nssm.exe
    echo         Please run install.bat first.
    pause
    exit /b 1
)

REM ── Create log directory ──────────────────────────────────────
if not exist "%LOGS%" mkdir "%LOGS%"

REM ── Refresh .env.local with current machine IP ────────────────
echo Refreshing backend URL...
cd /d "%FRONTEND%"
node scripts\detect-backend.js >nul 2>&1

REM ── Resolve full paths to python.exe and node.exe ─────────────
set "PYTHON=%BACKEND%\venv\Scripts\python.exe"
for /f "delims=" %%p in ('where node 2^>nul') do set "NODE=%%p"

if not exist "%PYTHON%" (
    echo [ERROR] Python venv not found at %PYTHON%
    echo         Please run install.bat first.
    pause
    exit /b 1
)
if "!NODE!"=="" (
    echo [ERROR] node.exe not found on PATH.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  OneFlow ERP - Starting Services
echo ============================================================

REM ════════════════════════════════════════════════════════════
REM  BACKEND SERVICE
REM ════════════════════════════════════════════════════════════
"%NSSM%" status OneFlow-Backend >nul 2>&1
if errorlevel 1 (
    echo [Backend] Installing service...
    "%NSSM%" install OneFlow-Backend "%PYTHON%"
    "%NSSM%" set OneFlow-Backend AppParameters "-m uvicorn app.main:app --host 0.0.0.0 --port 8000"
    "%NSSM%" set OneFlow-Backend AppDirectory   "%BACKEND%"
    "%NSSM%" set OneFlow-Backend AppStdout      "%LOGS%\backend.log"
    "%NSSM%" set OneFlow-Backend AppStderr      "%LOGS%\backend-error.log"
    "%NSSM%" set OneFlow-Backend AppStdoutCreationDisposition 4
    "%NSSM%" set OneFlow-Backend AppStderrCreationDisposition 4
    "%NSSM%" set OneFlow-Backend AppRestartDelay 5000
    "%NSSM%" set OneFlow-Backend Start SERVICE_AUTO_START
    "%NSSM%" set OneFlow-Backend DisplayName "OneFlow Backend"
    "%NSSM%" set OneFlow-Backend Description  "OneFlow ERP - FastAPI backend (uvicorn)"
    echo [OK] Backend service installed.
)

"%NSSM%" start OneFlow-Backend >nul 2>&1
if errorlevel 1 (
    "%NSSM%" restart OneFlow-Backend >nul 2>&1
)
echo [OK] Backend service started.

REM ════════════════════════════════════════════════════════════
REM  FRONTEND SERVICE
REM ════════════════════════════════════════════════════════════
"%NSSM%" status OneFlow-Frontend >nul 2>&1
if errorlevel 1 (
    echo [Frontend] Installing service...
    "%NSSM%" install OneFlow-Frontend "!NODE!"
    "%NSSM%" set OneFlow-Frontend AppParameters "node_modules\next\dist\bin\next start --port 3000"
    "%NSSM%" set OneFlow-Frontend AppDirectory   "%FRONTEND%"
    "%NSSM%" set OneFlow-Frontend AppStdout      "%LOGS%\frontend.log"
    "%NSSM%" set OneFlow-Frontend AppStderr      "%LOGS%\frontend-error.log"
    "%NSSM%" set OneFlow-Frontend AppStdoutCreationDisposition 4
    "%NSSM%" set OneFlow-Frontend AppStderrCreationDisposition 4
    "%NSSM%" set OneFlow-Frontend AppRestartDelay 5000
    "%NSSM%" set OneFlow-Frontend Start SERVICE_AUTO_START
    "%NSSM%" set OneFlow-Frontend DisplayName "OneFlow Frontend"
    "%NSSM%" set OneFlow-Frontend Description  "OneFlow ERP - Next.js frontend"
    echo [OK] Frontend service installed.
)

"%NSSM%" start OneFlow-Frontend >nul 2>&1
if errorlevel 1 (
    "%NSSM%" restart OneFlow-Frontend >nul 2>&1
)
echo [OK] Frontend service started.

REM ════════════════════════════════════════════════════════════
REM  HTTPS PROXY SERVICE  (port 443 → Next.js port 3000)
REM ════════════════════════════════════════════════════════════
if not exist "%FRONTEND%\certs\oneflow.pfx" (
    echo [WARN] HTTPS certificate not found - skipping HTTPS proxy.
    echo        Run install.bat to generate the certificate.
    goto :skip_https
)

"%NSSM%" status OneFlow-HTTPS >nul 2>&1
if errorlevel 1 (
    echo [HTTPS] Installing service...
    "%NSSM%" install OneFlow-HTTPS "!NODE!"
    "%NSSM%" set OneFlow-HTTPS AppParameters   "https-proxy.js"
    "%NSSM%" set OneFlow-HTTPS AppDirectory    "%FRONTEND%"
    "%NSSM%" set OneFlow-HTTPS AppStdout       "%LOGS%\https-proxy.log"
    "%NSSM%" set OneFlow-HTTPS AppStderr       "%LOGS%\https-proxy-error.log"
    "%NSSM%" set OneFlow-HTTPS AppStdoutCreationDisposition 4
    "%NSSM%" set OneFlow-HTTPS AppStderrCreationDisposition 4
    "%NSSM%" set OneFlow-HTTPS AppRestartDelay 3000
    "%NSSM%" set OneFlow-HTTPS Start           SERVICE_AUTO_START
    "%NSSM%" set OneFlow-HTTPS DisplayName     "OneFlow HTTPS Proxy"
    "%NSSM%" set OneFlow-HTTPS Description     "OneFlow ERP - HTTPS proxy (port 443 → Next.js)"
    echo [OK] HTTPS proxy service installed.
)

"%NSSM%" start OneFlow-HTTPS >nul 2>&1
if errorlevel 1 (
    "%NSSM%" restart OneFlow-HTTPS >nul 2>&1
)
echo [OK] HTTPS proxy service started.

:skip_https

echo.
echo ============================================================
echo  OneFlow is running as Windows services.
echo  Open your browser to:  https://localhost  (or https://<server-ip>)
echo
echo  First time on a new device: accept the certificate warning
echo  once, then the browser will offer to install the PWA.
echo
echo  Services auto-start on every Windows boot.
echo  Logs: %LOGS%\
echo  To stop:  run stop.bat
echo ============================================================
timeout /t 5 /nobreak >nul
