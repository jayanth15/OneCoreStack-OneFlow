---
type: Production System
title: Production Management System
description: BOM management, customer schedules, production planning, shop-floor job cards, and worker time tracking.
tags: [production, bom, schedule, job-card, work-type, planning]
timestamp: 2026-06-27
---

# Production System

## Models

| Model | Table | Purpose |
|---|---|---|
| `BomItem` | `bom_item` | Bill of Materials — maps finished product to raw material requirements (qty_per_unit, scrap) |
| `Schedule` | `schedule` | Customer orders/schedules (customer, product, quantity, delivery date) |
| `ScheduleHistory` | `schedule_history` | Audit trail for schedule changes |
| `ProductionPlan` | `production_plan` | Production plan linked to a schedule (planned qty, date window) |
| `ProductionProcess` | `production_process` | Process steps within a plan (sequence, estimated time, material/waste) |
| `ProductionOrder` | `production_order` | Production run (linked to plan, effective qty, FG credited to inventory) |
| `JobCard` | `job_card` | Shop-floor job card (process, machine, workers, hours, qty produced) |
| `JobCardHistory` | `job_card_history` | Audit trail for job card changes |
| `WorkType` | `work_type` | Configurable work types (e.g. Blanking, Welding, Assembly) |
| `WorkLog` | `work_log` | Per-worker time entries linked to job cards |

## Workflow

```
Schedule → ProductionPlan → ProductionProcess[] → ProductionOrder → JobCard[] → WorkLog[]
                                ↓
                     Inventory (FG credited)
```

## Related Systems

- [Inventory System](/inventory/inventory-system.md) — BOMs consume raw materials; production credits finished goods
- [Procurement System](/procurement/procurement-system.md) — Production triggers purchase orders for materials
- [API Endpoints](/endpoints/api-endpoints.md)
