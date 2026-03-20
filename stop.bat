@echo off
setlocal EnableDelayedExpansion

REM ── Require administrator privileges ─────────────────────────
net session >nul 2>&1
if errorlevel 1 (
    echo Requesting administrator privileges...
    powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs -Wait"
    exit /b
)

set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
set "NSSM=%ROOT%\tools\nssm.exe"

echo ============================================================
echo  OneFlow ERP - Stop Services
echo ============================================================
echo.

if not exist "%NSSM%" (
    echo [WARN] NSSM not found - attempting raw sc stop instead...
    sc stop OneFlow-Backend  >nul 2>&1
    sc stop OneFlow-Frontend >nul 2>&1
    echo Done.
    pause
    exit /b
)

REM ── Stop both services ────────────────────────────────────────
echo Stopping OneFlow-Backend...
"%NSSM%" stop OneFlow-Backend  confirm >nul 2>&1
echo Stopping OneFlow-Frontend...
"%NSSM%" stop OneFlow-Frontend confirm >nul 2>&1
echo Stopping OneFlow-HTTPS...
"%NSSM%" stop OneFlow-HTTPS    confirm >nul 2>&1
echo [OK] Services stopped.

echo.
set /p REMOVE="Remove services completely? (they will no longer auto-start on boot) [y/N]: "
if /i "!REMOVE!"=="y" (
    echo.
    echo Removing OneFlow-Backend service...
    "%NSSM%" remove OneFlow-Backend  confirm >nul 2>&1
    echo Removing OneFlow-Frontend service...
    "%NSSM%" remove OneFlow-Frontend confirm >nul 2>&1
    echo Removing OneFlow-HTTPS service...
    "%NSSM%" remove OneFlow-HTTPS    confirm >nul 2>&1
    echo [OK] Services removed. Run start.bat to re-install and start them.
) else (
    echo Services kept registered. Run start.bat to start them again.
)

echo.
pause
