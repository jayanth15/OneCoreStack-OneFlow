---
type: Request System
title: Unified Request Management System
description: Unified request entity supporting internal transfers, vendor purchases, and customer dispatches with full lifecycle and department-scoped workflows.
tags: [requests, internal-transfer, vendor-purchase, customer-dispatch, workflow]
timestamp: 2026-06-27
---

# Unified Request System

The `Request` entity replaces the legacy `PurchaseRequest` and `MarketingRequest` models with a single unified system.

## Models

| Model | Table | Purpose |
|---|---|---|
| `Request` | `request` | Unified request entity (type: internal_transfer / vendor_purchase / customer_dispatch) |
| `RequestItem` | `request_item` | Line items for internal_transfer and vendor_purchase requests |
| `RequestCustomerDispatch` | `request_customer_dispatch` | Customer dispatch child (1:1 with Request) — customer info, delivery details |
| `RequestHistory` | `request_history` | Change log per request |
| `PurchaseRequest` | `purchase_request` | Legacy purchase request (shimmed to Request, deprecated) |
| `PurchaseRequestItem` | `purchase_request_item` | Legacy purchase request line items |
| `PurchaseRequestHistory` | `purchase_request_history` | Legacy purchase request history |
| `MarketingRequest` | `marketing_request` | Legacy marketing/customer dispatch request (shimmed to Request, deprecated) |
| `MarketingRequestHistory` | `marketing_request_history` | Legacy marketing request history |

## Lifecycle

```
pending → approved → in_progress → awaiting_signoff → received
                ↘ not_approved
                ↘ cancelled
```

## Request Types

| Type | Visibility | Fulfillment |
|---|---|---|
| `internal_transfer` | All users | Matching department |
| `vendor_purchase` | Admin only | Admin |
| `customer_dispatch` | Admin + departments with `handles_customer_dispatch` flag | Flagged department |

## Workflow Actions

- **Review**: Admin approves/rejects with note
- **Accept/Fulfill**: Target department accepts (can accept individual line items)
- **Deliver**: Fulfilling dept marks items as delivered, creates a [Receipt](/logistics/logistics-system.md)
- **Acknowledge**: Requester confirms receipt → status becomes `received`

## Legacy Shim Layer

Both `purchase_requests.py` and `marketing_requests.py` API routers provide backward-compatible endpoints that internally delegate to the unified Request system. See [API Endpoints](/endpoints/api-endpoints.md).

## Related Systems

- [Inventory System](/inventory/inventory-system.md) — Request items reference inventory
- [Procurement System](/procurement/procurement-system.md) — Vendor purchase requests generate POs
- [Logistics System](/logistics/logistics-system.md) — Receipts created on delivery
- [Auth System](/auth/auth-system.md) — Department-scoped visibility and fulfillment
