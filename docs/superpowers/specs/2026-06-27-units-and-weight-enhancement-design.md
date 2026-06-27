# Units & Weight Enhancement — Design Spec

**Date:** 2026-06-27
**Status:** Approved design

Replaces all hardcoded unit strings with a user-managed `Unit` table referenced via FK. Adds tabs to the Settings page for Company Info + Units management.

---

## 1. Unit Table (Backend)

New model `backend/app/models/unit.py`:

| Column | Type | Notes |
|--------|------|-------|
| `id` | `int` (PK) | |
| `name` | `str` (unique, max_length=50, indexed) | e.g. "kg", "pcs", "mtr" |
| `is_active` | `bool` (default True) | Soft-delete flag (unused with RESTRICT but useful future-proofing) |
| `created_at` | `datetime` | Auto-set |

---

## 2. Change All 14 Unit Columns to FK

Every model that stores a unit string gets a new `*_unit_id` FK column, the old string column is dropped.

| Table | Old Column | New Column |
|-------|-----------|------------|
| `inventory_item` | `unit` | `unit_id` → FK `unit.id` |
| `inventory_item` | `weight_unit` | `weight_unit_id` → FK `unit.id` |
| `bom_item` | `material_unit` | `material_unit_id` → FK `unit.id` |
| `grn_item` | `unit` | `unit_id` → FK `unit.id` |
| `dispatch_item` | `unit` | `unit_id` → FK `unit.id` |
| `dispatch` | `unit` | `unit_id` → FK `unit.id` |
| `gate_pass` | `unit` | `unit_id` → FK `unit.id` |
| `gate_pass_item` | `unit` | `unit_id` → FK `unit.id` |
| `purchase_order_item` | `unit` | `unit_id` → FK `unit.id` |
| `receipt_item` | `unit` | `unit_id` → FK `unit.id` |
| `supplier_materials` | `unit` | `unit_id` → FK `unit.id` |
| `supplier_jobs` | `unit` | `unit_id` → FK `unit.id` |
| `spare_item` | `unit` | `unit_id` → FK `unit.id` |
| `production_process` | `material_unit` | `material_unit_id` → FK `unit.id` |

---

## 3. Alembic Migration 0003

Steps (all in one migration file):

1. Create `unit` table
2. Extract all unique unit names from all 14 source columns (DISTINCT UNION across tables) → INSERT into `unit` with `is_active=True`
3. For each of the 14 source tables (using Alembic batch mode for SQLite):
   a. Add `*_unit_id` INTEGER column
   b. UPDATE: SET `unit_id = (SELECT id FROM unit WHERE unit.name = old_string_column)`
   c. DROP the old string column

The migration handles NULL values (where unit was not set) — those remain NULL in the FK column too.

---

## 4. Unit Router (`/api/v1/units`)

| Method | Path | Auth | Behavior |
|--------|------|------|----------|
| `GET` | `/api/v1/units` | Any authenticated | Returns active units. Admin: includes inactive. |
| `POST` | `/api/v1/units` | Admin only | Create unit (name required, unique). |
| `PUT` | `/api/v1/units/{id}` | Admin only | Rename unit. Updates name — all FK refs resolve to new name via JOIN. |
| `DELETE` | `/api/v1/units/{id}` | Admin only | RESTRICT: 409 Conflict if any FK reference exists. |
| `GET` | `/api/v1/units/{id}/usage-count` | Admin only | Returns `{total, by_table: {table.column: count}}` |

**Usage-count query**: SELECT count from each of the 14 tables WHERE the `*_unit_id` matches the given id, then sum.

**DELETE behavior**:
- Before deletion, query all 14 referencing columns
- If any count > 0 → return `409 Conflict` with `{total, by_table}` payload
- If all 0 → delete the row

---

## 5. Settings Page — Tabs

**File:** `frontend/app/dashboard/admin/settings/page.tsx`

Wrap current content in `<Tabs>` component:

**Tab 1: "Company Information"**
- Existing company info form (unchanged)

**Tab 2: "Units"**
- Table: columns = Name, Created, Usage Count, Actions
- "Add Unit" button → inline input at top of table or modal dialog
- Each row:
  - **Edit** → inline text input replaces name, save/cancel buttons
  - **Delete** → first calls usage-count. If total > 0: show "Cannot delete — in use by X items" (button disabled). If 0: confirmation dialog → delete
- After add/edit/delete, refresh the list

---

## 6. Frontend — Replace Hardcoded Units

| File | Change |
|------|--------|
| `inventory/new/page.tsx` | Remove `STD_UNITS` / `WEIGHT_UNITS` constants. Fetch `GET /api/v1/units` on mount. Populate both unit & weight_unit dropdowns from response. Remove "Other…" custom unit option. |
| `inventory/[id]/edit/page.tsx` | Same pattern. On load, resolve the current `*_unit_id` to select the right dropdown option. |
| `inventory/spares/page.tsx` | Remove `STD_UNITS` constant, fetch from API, populate dropdown. |
| `admin/bom/new/page.tsx` | Remove hardcoded `<option>` elements, fetch from API, generate dynamically. |
| `admin/bom/[id]/edit/page.tsx` | Same pattern. |

**Fallback**: If `units.length === 0` on any form, show a warning banner and disable the form. Link to `/dashboard/admin/settings?tab=units`.

**Empty state for dropdowns**: If API returns units but the current item's `*_unit_id` is null, show "-- Select unit --" as the placeholder.

---

## 7. FG Create — Validation

In `inventory/new/page.tsx`:
- On mount, fetch units 
- If `units.length === 0`:
  ```
  ⚠ No units configured.
  Please add units in Settings → Units before creating inventory items.
  [Go to Settings]
  ```
  Form is hidden/shown conditionally based on `units.length > 0`
- If `units.length > 0`, render normal form with populated unit dropdowns
- The Weight field (number + unit dropdown) is part of the standard form

---

## 8. API Response — Resolving Unit Names

All API endpoints that return unit data should include both the ID and the resolved name:

```json
{
  "unit_id": 5,
  "unit_name": "kg"
}
```

**Approach**: On read endpoints, batch-load unit names from the `unit` table. Each router's list/detail function does a single `SELECT id, name FROM unit WHERE id IN (...)` and populates the `*_unit_name` field from the map. Follow the existing pattern used for supplier/vendor name resolution in list endpoints.

Unit names are NEVER stored as strings in the source tables — always resolved via JOIN/lookup on read.

---

## 9. Weight Field on FG (already exists)

The `weight_value` / `weight_unit_id` fields were added in a previous task. The `weight_unit_id` dropdown now uses the dynamic units list (replacing the old `WEIGHT_UNITS` hardcoded array).

No extra work needed here beyond the unit dropdown migration.

---

## 10. Deletion Flow (RESTRICT)

```
Admin clicks Delete on unit
  → GET /api/v1/units/{id}/usage-count
  → if total > 0:
      Show: "Cannot delete '{name}' — in use by {total} items"
      Show per-table breakdown
      Delete button is disabled
      Suggest: "You can rename it instead"
  → if total == 0:
      Show: "Delete unit '{name}'?"
      On confirm → DELETE /api/v1/units/{id}
      On success → remove from list
```

Backend enforcement at `DELETE /api/v1/units/{id}`:
```python
total = 0
for table, column in REFERENCING_COLUMNS:
    count = session.exec(text(f"SELECT COUNT(*) FROM {table} WHERE {column} = :id"), {"id": unit_id}).scalar()
    total += count
    if count > 0: results.append({f"{table}.{column}": count})
if total > 0:
    raise HTTPException(409, detail={"message": "Unit in use", "total": total, "by_table": results})
session.delete(unit)
```

---

## Files Created / Modified

**New files:**
- `backend/app/models/unit.py`
- `backend/app/routers/units.py`
- `backend/alembic/versions/0003_create_unit_table_and_migrate.py`

**Modified files:**
- `backend/app/models/inventory.py` — unit → unit_id, weight_unit → weight_unit_id
- `backend/app/models/bom_item.py` — material_unit → material_unit_id
- `backend/app/models/grn_item.py`
- `backend/app/models/dispatch_item.py`
- `backend/app/models/dispatch.py`
- `backend/app/models/gate_pass.py`
- `backend/app/models/gate_pass_item.py`
- `backend/app/models/purchase_order.py`
- `backend/app/models/receipt_item.py`
- `backend/app/models/supplier_material.py`
- `backend/app/models/supplier_job.py`
- `backend/app/models/spare_item.py`
- `backend/app/models/production_process.py`
- `backend/app/routers/inventory.py` — update schemas, create/update to use unit_id
- `backend/app/routers/bom.py` — update schemas
- `backend/app/routers/grn.py` — update schemas
- `backend/app/routers/dispatch.py` — update schemas
- `backend/app/routers/gate_passes.py` — update schemas
- `backend/app/routers/purchase_orders.py` — update schemas
- `backend/app/routers/receipts.py` — update schemas
- `backend/app/routers/suppliers.py` — update supplier_materials
- `frontend/app/dashboard/admin/settings/page.tsx` — add tabs + units CRUD
- `frontend/app/dashboard/inventory/new/page.tsx` — dynamic units
- `frontend/app/dashboard/inventory/[id]/edit/page.tsx` — dynamic units
- `frontend/app/dashboard/inventory/spares/page.tsx` — dynamic units
- `frontend/app/dashboard/admin/bom/new/page.tsx` — dynamic units
- `frontend/app/dashboard/admin/bom/[id]/edit/page.tsx` — dynamic units
