---
type: Procurement System
title: Procurement and Supply Chain System
description: Vendor and supplier management, purchase orders, goods received notes (GRN), and supplier job/material catalogs.
tags: [procurement, vendors, suppliers, purchase-orders, grn]
timestamp: 2026-06-27
---

# Procurement System

## Models

| Model | Table | Purpose |
|---|---|---|
| `Vendor` | `vendors` | OEM clients (name, contact person, phone, email) |
| `Supplier` | `suppliers` | Material/job-work suppliers (name, contact, address) |
| `SupplierJob` | `supplier_jobs` | Jobs/processes a supplier performs (rate, unit) |
| `SupplierMaterial` | `supplier_materials` | Materials a supplier provides (rate, unit) |
| `PurchaseOrder` | `purchase_order` | Purchase orders to suppliers/vendors (draft → approved → received → cancelled) |
| `PurchaseOrderItem` | `purchase_order_item` | Line items on a purchase order |
| `GRNRecord` | `grn_record` | Goods Received Note (transport, vehicle, received by, inspection details) |
| `GRNItem` | `grn_item` | Line items in a GRN (quantity received, filled, returned) |

## Purchase Order Lifecycle

```
draft → approved → received
            ↘ cancelled
```

## GRN Flow

1. Goods arrive from supplier
2. GRN recorded with transport/vehicle/received-by details
3. Items inspected and recorded (received, filled, returned quantities)
4. Stock levels updated in [Inventory System](/inventory/inventory-system.md)

## Related Systems

- [Request System](/requests/request-system.md) — Vendor purchase requests can generate POs
- [Inventory System](/inventory/inventory-system.md) — GRN items fill into inventory
- [Logistics System](/logistics/logistics-system.md) — Dispatch handles outbound to suppliers
- [API Endpoints](/endpoints/api-endpoints.md)
