---
type: Inventory System
title: Inventory Management System
description: Multi-type inventory management covering raw materials, finished goods, semi-finished items, consumables, spares, weeders, and attachments with audit trails.
tags: [inventory, stock, raw-materials, finished-goods, consumables, spares, weeders, attachments]
timestamp: 2026-06-27
---

# Inventory System

## Inventory Types

| Type | Model | Table | Description |
|---|---|---|---|
| Raw Materials / Finished / Semi-Finished | `InventoryItem` | `inventory_item` | Code, name, type enum, qty, reorder level, rate, image |
| Consumables | `Consumable` | `consumable` | Qty, reorder level, rate, image |
| Attachments | `AttachmentItem` | `attachment_item` | Serial number, description, qty, rate, image |
| Spares | `SpareCategory` → `SpareSubCategory` → `SpareItem` → `SpareItemVariant` | `spare_category`, `spare_sub_category`, `spare_item`, `spare_item_variant` | Hierarchical: category → sub-category → item → variant (color/size/serial) |
| Weeders | `WeederCategory` → `WeederItem` | `weeder_category`, `weeder_item` | Category → item (serial no, desc, qty, rate) |

## Audit Trails

Each inventory type has a corresponding history table:

- `InventoryHistory` (`inventory_history`)
- `ConsumableHistory` (`consumable_history`)
- `AttachmentHistory` (`attachment_history`)
- `SpareItemHistory` (`spare_item_history`)
- `WeederHistory` (`weeder_history`)

## User Permissions

Users have per-type read access (`inventory_access`) and edit access (`inventory_edit`). These control which inventory types a user can view or modify.

## Related Systems

- [Request System](/requests/request-system.md) — Requests can pull from inventory
- [Production System](/production/production-system.md) — BOMs reference raw materials; production credits finished goods
- [API Endpoints](/endpoints/api-endpoints.md) — REST APIs for all inventory types
