---
type: Logistics System
title: Logistics and Material Movement System
description: Dispatch management, gate passes for material in/out, and internal receipt signoff workflow.
tags: [logistics, dispatch, gate-pass, receipt, material-movement]
timestamp: 2026-06-27
---

# Logistics System

## Models

| Model | Table | Purpose |
|---|---|---|
| `Dispatch` | `dispatch` | Dispatch records to vendors/suppliers (vehicle, driver, product, quantity) |
| `DispatchItem` | `dispatch_item` | Line items in a dispatch |
| `DispatchHistory` | `dispatch_history` | Audit trail for dispatch changes |
| `GatePass` | `gate_pass` | Gate passes for material in/out (party, material, quantity, purpose) |
| `GatePassItem` | `gate_pass_item` | Line items in a gate pass |
| `GatePassHistory` | `gate_pass_history` | Audit trail for gate pass changes |
| `Receipt` | `receipt` | Goods receipt for internal transfers (created → signed_off → disputed) |
| `ReceiptItem` | `receipt_item` | Line items in a receipt (quantity delivered, signed off, condition) |

## Receipt Lifecycle

```
created → signed_off
      ↘ disputed
```

Receipts are created automatically when a [Request](/requests/request-system.md) is delivered. The receiving party can sign off (confirming quantity/condition) or dispute.

## Access Control

Module-level feature flags: `dispatch_access`, `gate_pass_access` on the User model. See [Auth System](/auth/auth-system.md).

## Related Systems

- [Request System](/requests/request-system.md) — Receipts are created from delivered requests
- [Procurement System](/procurement/procurement-system.md) — Dispatch handles outbound to suppliers
- [Inventory System](/inventory/inventory-system.md) — Material movements affect stock
- [API Endpoints](/endpoints/api-endpoints.md)
