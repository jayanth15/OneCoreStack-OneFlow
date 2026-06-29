# Comprehensive Fixes & Enhancements — Design Spec

**Date:** 2026-06-27
**Status:** Approved design

Covers 13 items grouped into 4 areas: Weight & Scrap System, Document Linking & Auto-Fill, Print & Reports, Production Enhancements.

---

## A. Weight & Scrap System

### A1. FG / RM Weight Fields

Add two nullable fields to `InventoryItem`:

| Field | Type | Example |
|-------|------|---------|
| `weight_value` | `Optional[float]` | `2.5` |
| `weight_unit` | `Optional[str]` | `"kg"`, `"g"`, `"mg"`, `"lb"` |

- Displayed & editable on the item detail page, create form, and edit form
- Visible for all item types (FG gets the finished weight, RM gets weight per unit)
- Not required — null means weight not tracked

### A2. BOM Scrap Calculation from Weights

Replace the current manual `scrap` entry (per BOM line) with computed scrap:

**Normalization:** Convert all weights to grams for calculation using a unit conversion map (`kg → 1000, g → 1, mg → 0.001, lb → 453.592`).

**Per BOM line:**
- `input_weight_g = qty_per_unit × rm.weight_value_g`
- Total input weight = sum across all RM lines

**Scrap:**
- `total_scrap_g = max(0, total_input_g - fg.weight_value_g)`
- If FG has no weight or total ≤ FG weight, scrap = 0
- Scrap apportioned per RM: `scrap_rm_g = total_scrap_g × (input_weight_rm_g / total_input_g)`
- Displayed as both grams and the RM's `material_unit` (converted back)

**BOM UI:**
- Keep manual `scrap` input per line as optional override — when a manual value is set, use it instead of the computed value (respects existing data)
- Add computed row: "Scrap: X.X g (X.X%)" per RM line (shown when no manual override)
- Add "Recalculate from weights" button that clears manual scrap overrides and fills computed values
- Keep `material_used` field as optional manual tracking

**bom-preview & inventory demand:**
- `effective_qty_per_unit = qty_per_unit + (qty_per_unit × scrap_rate)` where `scrap_rate = total_scrap_g / total_input_g`
- This ensures raw material demand includes scrap loss

### A3. BOM Clone from Product

- Add "Copy BOM from existing product" button on the new BOM page (`/dashboard/admin/bom/new`)
- Opens a product search/select dialog
- On select: fetch all active BOM lines for the source product, duplicate them for the target product
- Only copies `raw_material_id`, `qty_per_unit`, `notes` — does NOT copy scrap/material_used (these are recomputed from weights)

---

## B. Document Linking & Auto-Fill

Common pattern for all four: search combobox → select → fetch detail → populate form fields.

### B1. GRN → Link Purchase Order

- Add backend endpoint: `GET /api/v1/purchase-orders/linkable?search=&status=approved`
- Add backend endpoint: `GET /api/v1/purchase-orders/{id}/items` (gets PO + its items)
- Frontend: Add a `<SearchCombobox>` for POs alongside the existing free-text `po_number` input (keep both — user can type manually OR link)
- On select from combobox: auto-fill vendor/supplier name, all PO items (name, qty, unit, rate) into GRN form line items

### B2. Gate Pass → Link Purchase Order

- Add `purchase_order_id` + `po_number` fields to `GatePass` model
- Backend: same linking endpoint reuse
- Frontend: add PO search combobox alongside the existing PR dropdown
- On select: auto-fill vendor/supplier, items, purpose/date from PO
- Keep existing `purchase_request_id` linking functional

### B3. Purchase Order → Fix PR Auto-Fill

- Root cause: `GET /api/v1/purchase-requests` returns `RequestListRead` schema without items
- Fix: Add a detail endpoint (or extend existing) that returns PR items when fetching a single PR: `GET /api/v1/purchase-requests/{id}`
- `seedFromPR()` uses this detail endpoint instead of the list endpoint
- Result: PR items actually populate the PO form instead of creating blank rows

### B4. Dispatch → Link Customer Dispatch Request

- Add `request_id` + `request_sn_no` fields to `Dispatch` model
- Backend endpoint: `GET /api/v1/requests?request_type=customer_dispatch&status=approved`
- Frontend: add request search combobox in the dispatch form
- On select: auto-fill customer name, phone, address, inventory type, item SN, qty into dispatch
- The dispatch already has `DispatchItem` with `inv_type`/`inv_item_id` — map the request's item data to these

---

## C. Print & Reports

### C1. Company Info on All Print Templates

Affected files with print functions that need a company header block:

| Document | File | Print function |
|----------|------|----------------|
| Purchase Order | `purchase-orders/page.tsx` | `printPurchaseOrder()` |
| Gate Pass | `gate-passes/page.tsx` | `printGatePass()`, `printAllGatePasses()` |
| Dispatch | `dispatch/page.tsx` | `printDispatch()` |
| GRN | `grn/page.tsx` | `printGRN()` |
| Receipts | `receipts/page.tsx` | **create** `printReceipt()` |

**Pattern (follow stock-alerts):**
1. Fetch `GET /api/v1/settings/company` on page mount, store in state
2. Each print function prepends: company name (bold, 20px), address line, phone/email/GSTIN
3. Receipts page: add print button + `printReceipt()` function from scratch

### C2. History — Filter by Name

- Backend: Add `entity_name` query param to `GET /api/v1/history/{category}`
  - After resolving entity names from parent tables, filter by ILIKE match on the name
  - Case-insensitive substring match
- Frontend: Add text input labeled "Item / Entity name" alongside date/user filters, debounced at 400ms

### C3. History — Print

- Add a Printer icon button on the history page (always visible)
- `printHistory()`: builds HTML table of the currently displayed/filtered results (respects active category + filters)
- Uses same pattern: `window.open()` → write HTML → `win.print()` → `win.close()`

### C4. Spares — Cycle Count Print

- Add "Print Cycle Count" button on the spares page (`/dashboard/inventory/spares`)
- Generates a print table with columns: **Category → Sub-category → Item → Variant → Current Qty → Counted Qty** (blank)
- Prints all items matching the current search filter (or all if no search)
- Simple HTML table format, suitable for physical cycle counting

### C5. Work Time Report — Print

- Add "Print Report" button on the worker detail view (when a single worker is selected)
- Generates: worker name, date range, summary stats (total hours, qty produced, avg qty/hr, working days)
- Then breakdown tables: by process, by date (daily activity), by production order, by machine
- Follows same `window.open()` → HTML → print pattern

---

## D. Production Enhancements

### D1. Job Card — Auto-Propagate Estimated Time

- Already have `ProductionProcess.estimated_time_minutes` (entered manually on process definition)
- When creating a job card for a process: auto-fill `estimated_time` field from the process's `estimated_time_minutes`
- Display comparison on job card: `"Estimated: 2.0 hr | Actual: 1.5 hr"` 
- Display on order detail page: aggregate estimated vs actual across all job cards
- Highlight with amber text if actual > estimated

### D2. Quick Job Card Creator on Main Production Screen

Add a fourth card/panel on `/dashboard/production` (the main screen):

**Form fields:**
1. **Production order** — dropdown of active `in_progress` orders
2. **Date** — defaults to today, editable
3. **Quantity produced** — number input
4. **Worker name** — text input (defaults to current user, editable for supervisor entry)

**On submit:**
- Creates a JobCard linked to the selected production order
- If the order has a single process, uses it automatically. If multiple processes, show a process selector dropdown.
- Sets `work_date`, `qty_produced`, `worker_names` (as JSON array)
- Auto-computes `qty_pending` = planned - total produced
- Triggers BOM consumption, FG recalculation, status cascade

Kept intentionally simpler than the full job card form (no machine, tool, notes, multi-worker complexity).

---

## Implementation Order

Recommended build order (each builds on the previous):

1. **Weight fields** (A1) — model change, foundational
2. **BOM scrap calc** (A2) — depends on A1
3. **BOM clone** (A3) — independent, but part of BOM module
4. **PO PR fix** (B3) — smallest fix, unblocks linking
5. **GRN→PO link** (B1) — uses working PO API
6. **Gate Pass→PO link** (B2) — similar to B1
7. **Dispatch→Request link** (B4) — similar pattern
8. **Company info on prints** (C1) — straightforward
9. **Spares cycle count print** (C4) — independent
10. **History filter + print** (C2, C3) — independent
11. **Work Time Report print** (C5) — independent
12. **Job Card time propagation** (D1) — small change
13. **Quick job card creator** (D2) — independent
