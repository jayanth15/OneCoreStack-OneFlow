@echo off
echo Stopping OneFlow ERP...

REM Kill uvicorn (backend) by port 8000
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8000 " ^| findstr "LISTENING"') do (
    echo Killing backend process %%p
    taskkill /PID %%p /F >nul 2>&1
)

REM Kill node (frontend) by port 3000
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    echo Killing frontend process %%p
    taskkill /PID %%p /F >nul 2>&1
)

echo Done. All OneFlow processes stopped.
pause
