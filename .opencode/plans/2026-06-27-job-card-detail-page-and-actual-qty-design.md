# Job Card Detail Page, Status Bug Fix & Actual Qty — Design Spec

**Date:** 2026-06-27
**Status:** Approved

Three changes: new job card detail pages (splitting the 1090-line processing detail page), fixing the FG auto-completion cascade bug, and adding an actual_qty field.

---

## 1. Page Structure Split

### Current
`/dashboard/production/processing/[id]` — 1090 lines, mixes order overview + job cards + history

### New Route Structure

| Route | File | Content |
|---|---|---|
| `processing/[id]` | **Simplified** (existing) | Order header, per-process bars, summary stats (FG/pending/hours), BOM. **No job card list.** "Add Job Card" button and "View all job cards" link. |
| `processing/[id]/jobs` | **New page** | All job cards grouped by process. Each links to its detail. Same content as current lines 551-806. |
| `processing/[id]/jobs/[jobId]` | **New page** | Single job card: card info, worker(s), hours, estimated vs actual, full history timeline, edit/duplicate/deactivate. |

---

## 2. FG Status Bug Fix

**File:** `backend/app/routers/production.py` — `_propagate_statuses()`

**Fix:** Before marking order as completed, check that FG has reached planned_qty:

```python
fg_complete = effective_qty >= plan.planned_qty
if all_completed and fg_complete and order.status != "completed":
    order.status = "completed"
```

This prevents the cascade (job card → order → plan → schedule) from completing when FG hasn't reached target.

---

## 3. Actual Products Produced Field

### Model
Add to `backend/app/models/job_card.py`:
```python
actual_qty: float = Field(default=0.0)
```

### Migration (Alembic 0004)
```python
op.add_column("job_card", sa.Column("actual_qty", sa.Float(), server_default="0.0"))
```

### Labels

| Context | qty_produced label | actual_qty label |
|---|---|---|
| Create/edit form | "Estimated Produced" (read-only) | "Actual Produced" (editable) |
| Detail/overview | "Estimated:" | "Actual:" |
| Comparison | — | "Diff: +X / -X" |

### Comparison Display
```
Estimated:  50 units  (from 5h × 60 ÷ 6 min/unit)
Actual:     48 units
Difference: -2 units (4% less)
```

### Backend Changes
- `JobCardCreate` / `JobCardUpdate` — add `actual_qty: float = 0.0`
- `JobCardResponse` — include `actual_qty`
- Router create/update — persist `actual_qty`
- `qty_pending` computed from `actual_qty`, not `qty_produced`:
  ```python
  total_for_process = sum(c.actual_qty for c in same_process_cards)
  ```

---

## 4. Files

### New
- `frontend/.../processing/[id]/jobs/page.tsx` — job cards list
- `frontend/.../processing/[id]/jobs/[jobId]/page.tsx` — job card detail

### Modified
- `backend/app/models/job_card.py` — add actual_qty
- `backend/app/routers/production.py` — schemas, status fix, use actual_qty
- `backend/alembic/versions/0004_add_job_card_actual_qty.py`
- `frontend/.../processing/[id]/page.tsx` — simplify, remove job cards
- `frontend/.../jobs/new/page.tsx` — add actual_qty input
- `frontend/.../jobs/[jobId]/edit/page.tsx` — add actual_qty + comparison

---

## 5. Build Order

1. Backend: actual_qty model + migration
2. Backend: update router schemas + create/update/response + status fix
3. Frontend: create jobs list page
4. Frontend: create job card detail page
5. Frontend: simplify processing detail page
6. Frontend: update job card create form
7. Frontend: update job card edit form
