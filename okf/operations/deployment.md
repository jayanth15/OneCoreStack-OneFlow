---
type: Deployment
title: Deployment and Operations
description: Setup scripts, environment configuration, database backups, and process management for OneFlow.
tags: [deployment, operations, setup, configuration, backup]
timestamp: 2026-06-27
---

# Deployment and Operations

## Startup Scripts

| Script | Platform | Purpose |
|---|---|---|
| `start-linux.sh` | Linux | Generate certs, build frontend, launch backend (8000) + frontend (3000) + HTTPS proxy (443) |
| `stop-linux.sh` | Linux | Stop all services |
| `start.bat` | Windows | Install/start Windows services via NSSM |
| `stop.bat` | Windows | Stop/remove Windows services |
| `install.bat` | Windows | Full install (venv, npm, certs, firewall, NSSM download) |
| `frontend/https-proxy.js` | Both | Node.js HTTPS proxy for local network PWA support |

## Environment Configuration

### Backend (`backend/.env`)

| Variable | Purpose |
|---|---|
| `SECRET_KEY` | JWT signing secret |
| `DATABASE_URL` | PostgreSQL connection string (SQLite used if absent) |
| `MODULE_PLANNING` | Enable planning module (default: false) |
| `MODULE_ROUTING` | Enable routing module (default: false) |
| `MODULE_RESOURCES` | Enable resources module (default: false) |
| `MODULE_OUTSOURCING` | Enable outsourcing module (default: false) |
| `MODULE_QUALITY` | Enable quality module (default: false) |
| `MODULE_DISPATCH` | Enable dispatch module (default: false) |
| `UNIFIED_REQUESTS_ENABLED` | Enable unified request system (default: true) |
| `AUTO_SEED_ADMIN` | Auto-seed admin user on empty DB |

Module feature flags are documented in `backend/app/core/config.py`.

### Frontend (`frontend/.env.local`)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend API URL (auto-detected by `scripts/detect-backend.js`) |

## Database

- **Dev**: SQLite at `backend/app/db/oneflow.db`
- **Prod**: PostgreSQL via `DATABASE_URL`
- **Migrations**: Alembic (baseline at `0001`, dated 2026-06-21)
- **Backups**: Automated daily at 17:30 to `backend/app/db/backups/YYYY/MM/DD/oneflow.db` (90-day retention)
- Backup scheduler: `backend/app/core/backup.py`

## Logging

Logs written to `logs/` directory:
- `backend.log` / `backend-error.log`
- `frontend.log` / `frontend-error.log`
- `https-proxy.log` / `https-proxy-error.log`

## Related

- [Architecture](/architecture.md)
- [Frontend Architecture](/frontend/frontend-architecture.md)
- Setup guide: `SETUP.md` in project root
