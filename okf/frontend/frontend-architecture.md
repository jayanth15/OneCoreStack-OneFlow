---
type: Frontend Architecture
title: Frontend Architecture and Pages
description: Next.js 16 App Router frontend with shadcn/ui, PWA support, role-aware responsive navigation, and API proxy layer.
tags: [frontend, nextjs, react, shadcn, pwa, pages, components]
timestamp: 2026-06-27
---

# Frontend Architecture

## Tech Stack

- Next.js 16 (App Router), React 19
- shadcn/ui (22 components), Tailwind CSS v4
- recharts for dashboard charts
- @ducanh2912/next-pwa for offline support

## Auth Flow

1. `auth-guard.tsx` wraps the dashboard layout — checks `sessionStorage` for access token
2. On missing/invalid token, redirects to `/login`
3. Login page sends credentials to `/api/v1/auth/login`
4. `lib/auth.ts` manages token storage; `lib/api.ts` is the authenticated fetch wrapper with silent 401 refresh

See [Auth System](/auth/auth-system.md) for backend details.

## Navigation

**Desktop (md+):**
- Fixed left sidebar (195 lines) — role-aware menu items with badge counts
- Top bar: notification bell + user avatar

**Mobile (<md):**
- Bottom tab bar with 4 primary tabs: Home, Inventory, Schedule, Production
- "More" drawer for all other pages + logout + PWA install prompt

## Pages

| Route | Description |
|---|---|
| `/login` | Login form |
| `/setup` | Device setup (CA certificate for PWA) |
| `/dashboard` | Main dashboard with KPI cards + charts |
| `/dashboard/requests` | Unified requests list with type tabs |
| `/dashboard/receipts` | Receipts list |
| `/dashboard/purchase-requests` | Legacy purchase requests |
| `/dashboard/purchase-orders` | Purchase orders list |
| `/dashboard/grn` | Goods Received Notes |
| `/dashboard/dispatch` | Dispatch records |
| `/dashboard/gate-passes` | Gate passes |
| `/dashboard/vendors` | Vendors list + detail |
| `/dashboard/suppliers` | Suppliers list + detail |
| `/dashboard/schedule` | Schedule list + create/edit |
| `/dashboard/inventory` | Inventory overview + per-type pages (raw-materials, finished-goods, semi-finished, consumables, attachments, weeders, spares, scraps, stock-alerts) |
| `/dashboard/production` | Production overview + planning, processing, time reports |
| `/dashboard/history` | Unified audit log browser |
| `/dashboard/admin/departments` | Department CRUD |
| `/dashboard/admin/users` | User CRUD |
| `/dashboard/admin/bom` | BOM CRUD |
| `/dashboard/admin/settings` | Company settings form |

## Shared Components

| Component | Purpose |
|---|---|
| `auth-guard.tsx` | Auth check wrapper |
| `empty-state.tsx` | Empty state placeholder |
| `section-card.tsx` | Section wrapper card |
| `status-badge.tsx` | Status badge with color coding |
| `desktop-sidebar.tsx` | Role-aware sidebar navigation |
| `bottom-nav.tsx` | Mobile bottom tab bar + More drawer |
| `top-bar.tsx` | Notification bell + user avatar |
| `page-header.tsx` | Page title + optional action |
| `page-shell.tsx` | Page layout shell |
| `request-form.tsx` | Request create/edit form |
| `request-detail-dialog.tsx` | Request detail, history, actions |
| `type-tabs.tsx` | Request type tab switcher |

## PWA

- Service worker for offline caching
- Installable on mobile/desktop via manifest
- HTTPS proxy (port 443) for local network PWA support
- CA certificate setup guide at `/setup`

## Related

- [Architecture](/architecture.md)
- [API Endpoints](/endpoints/api-endpoints.md)
- [Deployment](/operations/deployment.md)
