---
type: Auth System
title: Authentication and Authorization System
description: JWT-based auth with RBAC roles, department-scoped permissions, and module-level feature flags.
tags: [auth, users, roles, departments, security]
timestamp: 2026-06-27
---

# Auth System

## Models

| Model | Table | Purpose |
|---|---|---|
| `User` | `users` | Users with roles (super_admin, admin, manager, worker), department assignments, inventory access, module flags |
| `RefreshToken` | `refresh_tokens` | Hashed refresh tokens for silent token renewal |
| `Department` | `departments` | Org departments (code, name, handles_customer_dispatch flag) |
| `UserDepartment` | `user_departments` | Many-to-many user-department assignments |
| `CompanySettings` | `company_settings` | Key-value store for company-wide configuration |

## Roles

| Role | Access Level |
|---|---|
| `super_admin` | Full system access |
| `admin` | All admin functions, bypasses all restrictions |
| `manager` | Department-scoped access to assigned areas |
| `worker` | Basic access, limited to assigned job cards and tasks |

## Permission Model

- **Inventory access**: Per-type read access (`inventory_access`) and edit access (`inventory_edit`)
- **Request permissions**: Department-scoped (`request_departments`), inventory-type-scoped (`request_inventory`)
- **Module gates**: `grn_access`, `dispatch_access`, `gate_pass_access`, `purchase_access`
- Admins bypass all restrictions

## Token Flow

1. Login → Backend returns `access_token` (short-lived) and `refresh_token` (HttpOnly cookie)
2. Frontend stores access token in `sessionStorage`
3. On 401, frontend silently refreshes via `/api/v1/auth/refresh` using the HttpOnly cookie
4. Auth guard in [Frontend Architecture](/frontend/frontend-architecture.md) redirects unauthenticated users to `/login`

## Related Systems

- [Architecture](/architecture.md)
- [Frontend Architecture](/frontend/frontend-architecture.md)
- [API Endpoints](/endpoints/api-endpoints.md)
