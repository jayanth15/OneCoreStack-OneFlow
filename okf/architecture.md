---
type: System Architecture
title: OneFlow System Architecture
description: High-level architecture of the OneFlow ERP system including technology stack, component layout, and key design decisions.
tags: [architecture, stack, overview]
timestamp: 2026-06-27
---

# System Architecture

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, shadcn/ui, Tailwind CSS v4, recharts |
| Backend | FastAPI (Python), SQLModel ORM, SQLite / PostgreSQL |
| Auth | argon2-cffi (password hashing) + PyJWT (access/refresh tokens), HttpOnly refresh cookie |
| PWA | @ducanh2912/next-pwa (service worker, offline caching, installable) |
| Build | pnpm, TypeScript |

## Component Layout

```
Browser ──→ Next.js (port 3000) ──→ FastAPI (port 8000)
                  │                        │
                  ├─ PWA Service Worker    ├─ SQLite (dev) / PostgreSQL (prod)
                  └─ HTTPS Proxy (port 443)└─ Alembic Migrations
```

## Key Decisions

- **Single-tenant**: one deployment per customer
- **Access token** in `sessionStorage`; **Refresh token** as HttpOnly cookie
- SQLite for dev (at `backend/app/db/oneflow.db`), PostgreSQL for prod
- Auto-seeded admin: `admin` / `admin123`
- Frontend proxies `/api/*` to backend via Next.js rewrites
- HTTPS proxy (port 443) for PWA support on local network

## Domains

- [Auth System](/auth/auth-system.md)
- [Inventory System](/inventory/inventory-system.md)
- [Production System](/production/production-system.md)
- [Procurement System](/procurement/procurement-system.md)
- [Request System](/requests/request-system.md)
- [Logistics System](/logistics/logistics-system.md)

## See Also

- [API Endpoints](/endpoints/api-endpoints.md)
- [Frontend Architecture](/frontend/frontend-architecture.md)
- [Deployment](/operations/deployment.md)
