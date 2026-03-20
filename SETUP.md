# OneFlow ERP — Fresh Machine Setup Guide

This guide covers everything you need to install and run OneFlow on a brand-new Windows or Linux machine.

---

## Prerequisites — What to Download

### 1. Python 3.11 or newer

| OS | Download |
|----|---------|
| Windows | https://www.python.org/downloads/ (tick **"Add Python to PATH"** during install) |
| Linux (Ubuntu/Debian) | `sudo apt update && sudo apt install python3 python3-venv python3-pip` |

Verify after install:
```
python --version      # Windows
python3 --version     # Linux
```
Minimum required: **Python 3.11**

---

### 2. Node.js 18 LTS or newer

| OS | Download |
|----|---------|
| Windows | https://nodejs.org/ — choose the **LTS** installer |
| Linux (Ubuntu/Debian) | `sudo apt install nodejs npm` or use [nvm](https://github.com/nvm-sh/nvm) |

Verify after install:
```
node --version    # should print v18.x.x or higher
npm --version
```

---

### 3. OpenSSL (recommended — needed for trusted HTTPS / PWA)

| OS | How to get it |
|----|--------------|
| Windows | Install **Git for Windows** (includes OpenSSL on PATH) — https://git-scm.com/download/win |
| Linux (Ubuntu/Debian) | `sudo apt install openssl` (usually pre-installed) |

Without OpenSSL the installer falls back to a self-signed certificate which gives a browser warning and **PWA standalone mode will not work on Android**.

---

### 4. Git (optional — only needed for pulling updates)

| OS | Download |
|----|---------|
| Windows | https://git-scm.com/download/win |
| Linux | `sudo apt install git` |

---

## First-Time Installation

### Windows

1. Copy the entire `OneFlow/` folder to the target machine (USB, network share, etc.).
2. Open the folder and **double-click `install.bat`** (or right-click → Run as administrator for firewall rules to apply).
3. The script will:
   - Create a Python virtual environment in `backend/venv/`
   - Install all Python packages from `backend/requirements.txt`
   - Run `npm install` for the frontend
   - Detect the machine's local IP and write it to `frontend/.env.local`
   - Build the Next.js frontend
   - Add Windows Firewall rules for ports **8000** (backend) and **3000** (frontend)

### Linux

```bash
# From the OneFlow/ project root:

# 1. Backend
cd backend
python3 -m venv venv-linux
source venv-linux/bin/activate
pip install -r requirements.txt

# 2. Frontend
cd ../frontend
npm install
node scripts/detect-backend.js   # writes .env.local with local IP
npm run build

# 3. Open ports (if UFW is active)
sudo ufw allow 8000
sudo ufw allow 3000
```

---

## Running OneFlow

### Windows (as background services — recommended)

OneFlow runs as two **Windows Services** so they stay alive even when no one is logged in and restart automatically after a reboot.

| Service name | What it is |
|---|---|
| `OneFlow-Backend` | FastAPI / uvicorn — port 8000 |
| `OneFlow-Frontend` | Next.js — port 3000 |

**Start / install services:**
- Double-click **`start.bat`** (raises a UAC prompt — click Yes)
- First run: installs all three services and sets them to _Automatic_ start
- Subsequent runs: simply starts the already-installed services
- Open a browser on any machine on the same network: `https://<server-ip>`

> **Port layout after setup:**
> | Port | Service | Accessible from |
> |------|---------|----------------|
> | 443 | HTTPS proxy (PWA-ready) | Network (all devices) |
> | 3000 | Next.js (HTTP, internal) | Localhost only |
> | 8000 | FastAPI backend | Localhost only |

**First-time certificate trust (once per phone/tablet):**

OneFlow generates a local Certificate Authority (CA) during installation.
Each device must install this CA certificate **once** so Chrome/Safari fully
trusts the HTTPS connection — this is what enables true standalone PWA mode
(no URL bar, no browser chrome).

1. On the phone, open **`http://<server-ip>:3000/setup`**
2. Tap **Download Certificate** and install it:
   - **Android:** Settings → Security → Encryption & credentials → Install a certificate → CA certificate → select the downloaded file
   - **iPhone/iPad:** Settings → General → VPN & Device Management → tap the OneFlow profile → Install, then Settings → General → About → Certificate Trust Settings → toggle ON "OneFlow Local CA"
3. Open **`https://<server-ip>`** — Chrome will now show the **Install App** prompt automatically
4. Tap **Install** — the app opens in full-screen standalone mode (like a native app)

> **Desktop browsers** (Windows/Mac/Linux): you can either install the CA
> certificate in your OS trust store, or just click **Advanced → Proceed** on
> the first visit. PWA install works either way on desktop.

**Stop services:**
- Double-click **`stop.bat`** (raises UAC)
- Prompts whether to just _stop_ (services remain registered, auto-restart next boot) or _remove_ (fully uninstall services)

**Logs** are written to:

```
OneFlow\logs\backend.log
OneFlow\logs\backend-error.log
OneFlow\logs\frontend.log
OneFlow\logs\frontend-error.log
```

You can also view service status in **Windows Task Manager → Services** tab or **services.msc**, and look for `OneFlow-Backend` and `OneFlow-Frontend`.

> **Note:** `start.bat` relies on **NSSM** (downloaded automatically by `install.bat` into `tools\nssm.exe`). NSSM is a free, open-source Windows service wrapper — no licence required.

### Linux

```bash
# Quick start (handles certs, build, and all three services):
chmod +x start-linux.sh stop-linux.sh
./start-linux.sh

# Stop everything:
./stop-linux.sh
```

`start-linux.sh` will:
1. Generate a local CA + server certificate (if not already present)
2. Build the frontend with the correct HTTPS backend URL
3. Start the backend (port 8000), frontend (port 3000), and HTTPS proxy (port 443)

> **First-time device setup:** same as Windows — open `http://<ip>:3000/setup` on each phone.

For manual startup or systemd services, see the bottom of this document.

```bash
# Manual startup (Terminal 1 — Backend)
cd backend
source venv-linux/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000

# Manual startup (Terminal 2 — Frontend)
cd frontend
npm run start
```

For a proper Linux service, create systemd units (see Troubleshooting section below).

---

## Python Dependencies

All packages are pinned in `backend/requirements.txt`. Key libraries:

| Package | Version | Purpose |
|---------|---------|---------|
| `fastapi` | 0.133.1 | Web framework / API |
| `uvicorn[standard]` | 0.41.0 | ASGI server |
| `sqlmodel` | 0.0.37 | ORM (wraps SQLAlchemy + Pydantic) |
| `sqlalchemy` | 2.0.47 | Database layer |
| `alembic` | 1.18.4 | DB migrations |
| `pyjwt` | 2.11.0 | JWT authentication tokens |
| `argon2-cffi` | 25.1.0 | Password hashing |
| `pydantic-settings` | 2.13.1 | Config from .env files |
| `python-multipart` | 0.0.22 | Form/file upload support |
| `python-dotenv` | 1.2.1 | Load `.env` files |
| `psycopg2-binary` | 2.9.11 | PostgreSQL driver (optional) |
| `watchfiles` | 1.1.1 | Hot-reload for development |
| `websockets` | 16.0 | WebSocket support |

Install on any machine with:
```bash
pip install -r backend/requirements.txt
```

---

## Frontend Dependencies

Managed via `npm`. Key packages:

| Package | Purpose |
|---------|---------|
| `next` 16.1.6 | React framework (App Router) |
| `react` 19.2.3 | UI library |
| `tailwindcss` 4.x | CSS utility framework |
| `shadcn` / `radix-ui` | UI component library |
| `lucide-react` | Icons |
| `recharts` | Charts / dashboard graphs |

Install with:
```bash
cd frontend && npm install
```

---

## Configuration Files

| File | Purpose |
|------|---------|
| `backend/.env` | Backend secrets (SECRET_KEY, DATABASE_URL). Created automatically if missing. |
| `frontend/.env.local` | `NEXT_PUBLIC_API_URL` — auto-generated by `scripts/detect-backend.js` using the machine's LAN IP. |

### Manually setting the backend URL

If auto-detection picks the wrong IP, edit `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://192.168.1.100:8000
```
Then rebuild the frontend:
```
npm run build      # or run install.bat again on Windows
```

---

## Database

- **Location:** `backend/app/db/oneflow.db` (SQLite, single file)
- **Auto-created** on first run — no database server required
- **Backup:** Log in as admin/super_admin → Settings → *Download Backup*

---

## Default Login

On first run the database is seeded with:

| Username | Password | Role |
|----------|----------|------|
| `admin` | `admin123` | super_admin |

> **Change the default password immediately** after first login via Settings → Users.

---

## Ports Used

| Port | Service |
|------|---------|
| 8000 | FastAPI backend (REST API) |
| 3000 | Next.js frontend |

Make sure no other application is using these ports. On Windows, `stop.bat` will free them if OneFlow is running.

---

## Troubleshooting

**`python` not found on Windows**
Re-run the Python installer and tick *"Add Python to PATH"*, or add it manually via System Properties → Environment Variables.

**`npm` not found**
Reinstall Node.js and restart the terminal.

**Frontend shows "Cannot connect to backend"**
- Confirm the backend service is running (`services.msc` → `OneFlow-Backend` → Status = Running).
- Check `frontend/.env.local` contains the correct IP.
- Run `node scripts/detect-backend.js` again from the `frontend/` folder, then rebuild with `npm run build`, then restart via `start.bat`.

**Services won't start / keep stopping**
Check the log files in `OneFlow\logs\`. Common causes:
- Port already in use — run `stop.bat` first, or check for another process on port 8000/3000.
- Python venv missing — run `install.bat` again.
- Frontend not built — run `install.bat` again (it rebuilds the frontend).

**"Access denied" when running start.bat / stop.bat**
Both scripts require administrator rights. Right-click → *Run as administrator*, or UAC will prompt automatically.

**NSSM missing (tools\nssm.exe not found)**
Run `install.bat` which downloads NSSM automatically. If the machine has no internet, manually download `nssm-2.24.zip` from https://nssm.cc/release/nssm-2.24.zip on any machine, extract `win64\nssm.exe`, and place it at `OneFlow\tools\nssm.exe`.

**Port already in use**
- Windows: run `stop.bat`, or open `services.msc` and stop the OneFlow services manually.
- Linux: `sudo fuser -k 8000/tcp` or `sudo fuser -k 3000/tcp`.

**Firewall blocking access from other PCs**
- Windows: re-run `install.bat` as Administrator, or manually add rules in *Windows Defender Firewall → Inbound Rules*.
- Linux: `sudo ufw allow 8000 && sudo ufw allow 3000`.

---

## Linux systemd Services (optional)

To run OneFlow permanently on Linux, create systemd units:

**`/etc/systemd/system/oneflow-backend.service`**
```ini
[Unit]
Description=OneFlow Backend
After=network.target

[Service]
User=<your-username>
WorkingDirectory=/path/to/OneFlow/backend
ExecStart=/path/to/OneFlow/backend/venv-linux/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5
StandardOutput=append:/path/to/OneFlow/logs/backend.log
StandardError=append:/path/to/OneFlow/logs/backend-error.log

[Install]
WantedBy=multi-user.target
```

**`/etc/systemd/system/oneflow-frontend.service`**
```ini
[Unit]
Description=OneFlow Frontend
After=network.target

[Service]
User=<your-username>
WorkingDirectory=/path/to/OneFlow/frontend
ExecStart=/usr/bin/node node_modules/next/dist/bin/next start --port 3000
Restart=always
RestartSec=5
StandardOutput=append:/path/to/OneFlow/logs/frontend.log
StandardError=append:/path/to/OneFlow/logs/frontend-error.log

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now oneflow-backend oneflow-frontend
```

Check status:
```bash
sudo systemctl status oneflow-backend
sudo systemctl status oneflow-frontend
```
