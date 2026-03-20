@echo off
setlocal EnableDelayedExpansion

REM ── Require administrator privileges ─────────────────────────
net session >nul 2>&1
if errorlevel 1 (
    echo Requesting administrator privileges...
    powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs -Wait"
    exit /b
)

echo ============================================================
echo  OneFlow ERP - First-Time Installation
echo ============================================================
echo.

REM ── Resolve absolute root path (no trailing backslash) ────────
set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
set "BACKEND=%ROOT%\backend"
set "FRONTEND=%ROOT%\frontend"
set "TOOLS=%ROOT%\tools"
set "LOGS=%ROOT%\logs"

REM ── Check Python ──────────────────────────────────────────────
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

REM ── Download NSSM (service manager) ───────────────────────────
echo.
echo [1/5] Setting up NSSM service manager...
if not exist "%TOOLS%\nssm.exe" (
    mkdir "%TOOLS%" 2>nul
    echo     Downloading NSSM...
    powershell -NoProfile -Command ^
        "Invoke-WebRequest -Uri 'https://nssm.cc/release/nssm-2.24.zip' -OutFile '%TOOLS%\nssm.zip' -UseBasicParsing"
    if not exist "%TOOLS%\nssm.zip" (
        echo [ERROR] Could not download NSSM. Check your internet connection.
        pause
        exit /b 1
    )
    powershell -NoProfile -Command ^
        "Expand-Archive -Path '%TOOLS%\nssm.zip' -DestinationPath '%TOOLS%\nssm-tmp' -Force"
    copy "%TOOLS%\nssm-tmp\nssm-2.24\win64\nssm.exe" "%TOOLS%\nssm.exe" >nul
    rmdir /s /q "%TOOLS%\nssm-tmp" 2>nul
    del "%TOOLS%\nssm.zip" 2>nul
    echo [OK] NSSM downloaded.
) else (
    echo [OK] NSSM already present.
)

REM ── Create log directory ──────────────────────────────────────
if not exist "%LOGS%" mkdir "%LOGS%"

REM ── Backend: create venv and install packages ─────────────────
echo.
echo [2/5] Setting up Python virtual environment...
cd /d "%BACKEND%"
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

REM ── Frontend: install npm packages ────────────────────────────
echo.
echo [3/5] Installing frontend dependencies...
cd /d "%FRONTEND%"
call npm install
if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
)
echo [OK] Frontend dependencies installed.

REM ── Detect local IP and write to frontend env ─────────────────
echo.
echo [4/5] Detecting local IP address...
cd /d "%FRONTEND%"
node scripts\detect-backend.js
echo [OK] Backend URL written to .env.local

REM ── Build the frontend ────────────────────────────────────────
echo.
echo [5/5] Building frontend (this may take a minute)...
call npm run build
if errorlevel 1 (
    echo [ERROR] Frontend build failed.
    pause
    exit /b 1
)
echo [OK] Frontend built.

REM ── Firewall rules ────────────────────────────────────────────
echo.
echo Adding Windows Firewall rules for ports 443, 8000 and 3000...
netsh advfirewall firewall add rule name="OneFlow HTTPS (443)"    dir=in action=allow protocol=TCP localport=443  >nul 2>&1
netsh advfirewall firewall add rule name="OneFlow Backend (8000)" dir=in action=allow protocol=TCP localport=8000 >nul 2>&1
netsh advfirewall firewall add rule name="OneFlow Frontend (3000)" dir=in action=allow protocol=TCP localport=3000 >nul 2>&1
echo [OK] Firewall rules added.

REM ── Generate CA + Server Certificate (for trusted PWA install) ──
echo.
echo [*] Generating HTTPS certificates (CA + server cert)...
mkdir "%FRONTEND%\certs" 2>nul

REM Check if OpenSSL is available (Git for Windows installs it)
where openssl >nul 2>&1
if errorlevel 1 (
    echo [WARN] OpenSSL not found on PATH.
    echo        Install Git for Windows (includes OpenSSL) or add OpenSSL to PATH.
    echo        Trying PowerShell fallback...
    goto :PS_CERTS
)

REM ── OpenSSL path: CA + signed server cert ─────────────────────
set "CERTS=%FRONTEND%\certs"

if not exist "%CERTS%\oneflow-ca-cert.pem" (
    echo [cert] Creating local Certificate Authority...
    openssl genrsa -out "%CERTS%\oneflow-ca-key.pem" 2048 2>nul
    openssl req -x509 -new -nodes -key "%CERTS%\oneflow-ca-key.pem" -sha256 -days 3650 -subj "/C=IN/ST=Local/L=Local/O=OneFlow/CN=OneFlow Local CA" -out "%CERTS%\oneflow-ca-cert.pem"
    echo [OK] CA created.
) else (
    echo [OK] CA already exists.
)

if not exist "%CERTS%\oneflow-cert.pem" (
    REM Detect IP
    for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4" ^| findstr /V "127.0.0.1"') do (
        set "LOCAL_IP=%%a"
        goto :gotip
    )
    :gotip
    set "LOCAL_IP=%LOCAL_IP: =%"
    echo [cert] Using IP: %LOCAL_IP%

    echo [cert] Creating server certificate...
    openssl genrsa -out "%CERTS%\oneflow-key.pem" 2048 2>nul
    openssl req -new -key "%CERTS%\oneflow-key.pem" -subj "/C=IN/ST=Local/L=Local/O=OneFlow/CN=%LOCAL_IP%" -out "%CERTS%\oneflow.csr"

    REM Write SAN extension file
    (
        echo authorityKeyIdentifier=keyid,issuer
        echo basicConstraints=CA:FALSE
        echo keyUsage=digitalSignature,nonRepudiation,keyEncipherment,dataEncipherment
        echo subjectAltName=@alt_names
        echo.
        echo [alt_names]
        echo DNS.1 = localhost
        echo IP.1  = 127.0.0.1
        echo IP.2  = %LOCAL_IP%
    ) > "%CERTS%\oneflow-ext.cnf"

    openssl x509 -req -in "%CERTS%\oneflow.csr" -CA "%CERTS%\oneflow-ca-cert.pem" -CAkey "%CERTS%\oneflow-ca-key.pem" -CAcreateserial -out "%CERTS%\oneflow-cert.pem" -days 3650 -sha256 -extfile "%CERTS%\oneflow-ext.cnf"

    REM Also export as PFX for compatibility
    openssl pkcs12 -export -out "%CERTS%\oneflow.pfx" -inkey "%CERTS%\oneflow-key.pem" -in "%CERTS%\oneflow-cert.pem" -passout pass:oneflow-local 2>nul

    del "%CERTS%\oneflow.csr" 2>nul
    del "%CERTS%\oneflow-ext.cnf" 2>nul
    del "%CERTS%\oneflow-ca-cert.srl" 2>nul
    echo [OK] Server certificate created and signed by CA.
) else (
    echo [OK] Server certificate already exists.
)

REM Copy CA cert to public/ so devices can download it
copy "%CERTS%\oneflow-ca-cert.pem" "%FRONTEND%\public\oneflow-ca.crt" >nul
echo [OK] CA cert copied to public\oneflow-ca.crt
goto :CERTS_DONE

:PS_CERTS
REM ── PowerShell fallback: self-signed (less ideal, but works) ──
if not exist "%FRONTEND%\certs\oneflow.pfx" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -notmatch 'Loopback'} | Select-Object -First 1 -ExpandProperty IPAddress);" ^
        "Write-Host '[cert] Using IP:' $ip;" ^
        "$cert = New-SelfSignedCertificate" ^
            "-Subject 'CN=OneFlow Local'" ^
            "-DnsName 'localhost',$ip" ^
            "-CertStoreLocation 'cert:\LocalMachine\My'" ^
            "-NotAfter (Get-Date).AddYears(10)" ^
            "-KeyExportPolicy Exportable" ^
            "-TextExtension @('2.5.29.17={text}IPAddress='+$ip+'&DNS=localhost');" ^
        "$pwd = ConvertTo-SecureString -String 'oneflow-local' -Force -AsPlainText;" ^
        "Export-PfxCertificate -Cert $cert -FilePath '%FRONTEND%\certs\oneflow.pfx' -Password $pwd | Out-Null;" ^
        "Write-Host '[cert] Certificate saved to %FRONTEND%\certs\oneflow.pfx'"
    if not exist "%FRONTEND%\certs\oneflow.pfx" (
        echo [ERROR] Certificate generation failed.
        pause
        exit /b 1
    )
    echo [OK] Certificate generated (self-signed fallback).
    echo [WARN] PWA standalone mode may not work — install OpenSSL for CA-signed certs.
) else (
    echo [OK] Certificate already exists.
)

:CERTS_DONE

echo.
echo ============================================================
echo  Installation complete!
echo  Run start.bat to install and start OneFlow as a service.
echo  Run stop.bat  to stop the service.
echo.
echo  FIRST-TIME SETUP FOR EACH PHONE:
echo    1. Open http://IP:3000/setup on the phone
echo    2. Tap 'Download Certificate' and install it
echo    3. Then open https://IP
echo    4. Install the PWA when Chrome prompts you
echo ============================================================
pause
