---
type: API Endpoints
title: Backend REST API Endpoints
description: Complete list of FastAPI router modules and their endpoints under /api/v1/.
tags: [api, endpoints, rest, fastapi, routers]
timestamp: 2026-06-27
---

# API Endpoints

All routes are registered in `backend/app/main.py` under the `/api/v1/` prefix.

## Auth

| Router | Prefix | Purpose |
|---|---|---|
| `auth.py` | `/api/v1/auth` | Login, logout, refresh, me (with department info) |
| `users.py` | `/api/v1/users` | User CRUD, multi-department assignment |

## Core Domain

| Router | Prefix | Purpose |
|---|---|---|
| `departments.py` | `/api/v1/departments` | Department CRUD (soft delete), public router |
| `inventory.py` | `/api/v1/inventory` | Inventory items CRUD, by-type filtering, stock alerts |
| `consumables.py` | `/api/v1/consumables` | Consumable CRUD |
| `spares.py` | `/api/v1/spares` | Spare categories, sub-categories, items, variants CRUD |
| `weeders.py` | `/api/v1/weeders` | Weeder categories and items CRUD |
| `attachments.py` | `/api/v1/attachments` | Attachment items CRUD |

## Production

| Router | Prefix | Purpose |
|---|---|---|
| `bom.py` | `/api/v1/bom` | BOM CRUD, product search |
| `schedule.py` | `/api/v1/schedule` | Schedule/order CRUD |
| `production.py` | `/api/v1/production` | Plans, orders, job cards, processes, work logs, time reports |
| `work_types.py` | `/api/v1/work-types` | Work type CRUD |

## Procurement & Logistics

| Router | Prefix | Purpose |
|---|---|---|
| `vendors.py` | `/api/v1/vendors` | Vendor CRUD |
| `suppliers.py` | `/api/v1/suppliers` | Supplier CRUD, jobs, materials |
| `purchase_orders.py` | `/api/v1/purchase-orders` | PO CRUD, linking to purchase requests |
| `grn.py` | `/api/v1/grn` | GRN CRUD, stock filling, inspection |
| `dispatch.py` | `/api/v1/dispatch` | Dispatch CRUD |
| `gate_passes.py` | `/api/v1/gate-passes` | Gate pass CRUD |

## Unified Requests

| Router | Prefix | Purpose |
|---|---|---|
| `requests.py` | `/api/v1/requests` | Unified requests — create, list, detail, review, accept, set_status, deliver, acknowledge, history, inbox |
| `purchase_requests.py` | `/api/v1/purchase-requests` | Legacy shim wrapping unified requests |
| `marketing_requests.py` | `/api/v1/marketing-requests` | Legacy shim for customer dispatch requests |
| `receipts.py` | `/api/v1/receipts` | Receipt CRUD, signoff, dispute |

## Supporting

| Router | Prefix | Purpose |
|---|---|---|
| `dashboard.py` | `/api/v1/dashboard` | Dashboard stats (inventory counts, low stock, schedules, charts) |
| `notifications.py` | `/api/v1/notifications` | Notification CRUD, mark read |
| `history.py` | `/api/v1/history` | Unified history/audit log browser |
| `settings.py` | `/api/v1/settings` | Company info (CRUD), DB backup download |

## Auth Dependencies

All endpoints use FastAPI `Depends()` for auth. Key dependency helpers in `backend/app/dependencies/auth.py`:

- `get_current_user` — validates access token
- `require_admin` — requires admin or super_admin role
- `require_super_admin` — requires super_admin role
- `require_grn_access` — checks `grn_access` module flag
- `require_dispatch_access` — checks `dispatch_access` module flag
- `require_gate_pass_access` — checks `gate_pass_access` module flag
- `require_purchase_access` — checks `purchase_access` module flag

## Related

- [Architecture](/architecture.md)
- [Auth System](/auth/auth-system.md)
- [Frontend Architecture](/frontend/frontend-architecture.md)
