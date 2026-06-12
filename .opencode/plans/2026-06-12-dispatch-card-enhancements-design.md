# Dispatch Card Enhancements Design

**Date:** 2026-06-12  
**Status:** Approved for Implementation

## Overview

Two enhancements to the dispatch card in the Dispatch list view:

1. **Print button** — Print dispatch details in a format mirroring the gate-pass print layout
2. **Inline status dropdown** — Replace static status badge with interactive `<select>` that saves immediately via API

## Current State

**File:** `frontend/app/dashboard/dispatch/page.tsx`

**Current card structure (lines 336-371):**
```
[PackageCheck Icon] [Content: dispatch_number + status badge + details] [Edit button]
```

**Status badge (lines 343-345):**
```tsx
<span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[d.status]}`}>
  {d.status}
</span>
```

**Edit button (lines 368-370):**
```tsx
<Button size="icon" variant="ghost" className="size-8 shrink-0" onClick={() => openEdit(d)}>
  <Pencil className="size-3.5" />
</Button>
```

## Design

### 1. Card Layout

**New card structure:**
```
[PackageCheck Icon] [Content: dispatch_number + status <select> + details] [Print button] [Edit button]
```

Changes:
- Static `<span>` status badge → styled `<select>` element
- Add `Printer` icon button to the left of existing `Pencil` edit button
- Edit button remains unchanged

### 2. Inline Status Dropdown

**Replacement for status badge (line 343-345):**

```tsx
<select
  value={d.status}
  onChange={(e) => handleStatusChange(d.id, e.target.value)}
  disabled={statusUpdatingId === d.id}
  className={`text-xs px-2 py-0.5 rounded-full font-medium border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring ${STATUS_COLORS[d.status] ?? "bg-slate-100 text-slate-600"}`}
>
  {STATUSES.map(s => (
    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
  ))}
</select>
```

**New state:**
```tsx
const [statusUpdatingId, setStatusUpdatingId] = useState<number | null>(null);
```

**Handler function:**
```tsx
async function handleStatusChange(dispatchId: number, newStatus: string) {
  setStatusUpdatingId(dispatchId);
  try {
    await apiFetchJson(`/api/v1/dispatch/${dispatchId}`, {
      method: "PUT",
      body: JSON.stringify({ status: newStatus }),
    });
    // Update local state
    setItems(prev => prev.map(item => 
      item.id === dispatchId ? { ...item, status: newStatus } : item
    ));
  } catch (err) {
    // Revert on error - reload to get accurate state
    load();
  } finally {
    setStatusUpdatingId(null);
  }
}
```

**Behavior:**
- On change, fires `PUT /api/v1/dispatch/{id}` with `{ status: newValue }`
- Backend already handles partial status updates and records history (backend/app/routers/dispatch.py:148-225)
- Shows disabled state while API call in flight (prevents double-clicks)
- On success, updates local `items` state for immediate visual feedback
- On error, reloads list to revert to accurate state

### 3. Print Functionality

**New function (mirrors gate-passes/page.tsx:287-331):**

```tsx
function printDispatch(d: Dispatch) {
  const items = d.items && d.items.length > 0 
    ? d.items 
    : [{ item_name: d.product_name, quantity: d.quantity, unit: d.unit, inv_type: null }];
  const partyName = d.party_type === "supplier" ? d.supplier_name : d.vendor_name;
  const partyLabel = d.party_type === "vendor" ? "Vendor" : "Supplier";
  
  const win = window.open("", "_blank", "width=800,height=600");
  if (!win) return;
  
  win.document.write(`<!DOCTYPE html><html><head><title>Dispatch — ${d.dispatch_number}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 13px; margin: 24px; color: #111; }
  h2 { margin: 0 0 4px; font-size: 18px; }
  .meta { color: #555; font-size: 12px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
  th { background: #f5f5f5; font-weight: 600; }
  .row { display: flex; gap: 32px; margin-bottom: 8px; }
  .lbl { color: #666; font-size: 11px; }
  @media print { body { margin: 0; } }
</style></head><body>
<h2>Dispatch — ${d.dispatch_number}</h2>
<p class="meta">Generated on ${new Date().toLocaleString("en-IN")}</p>
<div class="row">
  <div><div class="lbl">Party</div><div>${partyLabel}: ${partyName ?? "—"}</div></div>
  <div><div class="lbl">Status</div><div>${d.status}</div></div>
  ${d.dispatch_date ? `<div><div class="lbl">Date</div><div>${d.dispatch_date}</div></div>` : ""}
</div>
<div class="row">
  ${d.vehicle_number ? `<div><div class="lbl">Vehicle</div><div>${d.vehicle_number}</div></div>` : ""}
  ${d.driver_name ? `<div><div class="lbl">Driver</div><div>${d.driver_name}</div></div>` : ""}
  ${d.schedule_number ? `<div><div class="lbl">Schedule</div><div>${d.schedule_number}</div></div>` : ""}
</div>
<table>
  <thead><tr><th>#</th><th>Item</th><th>Type</th><th>Quantity</th><th>Unit</th></tr></thead>
  <tbody>
    ${items.map((it, i) => `<tr><td>${i + 1}</td><td>${it.item_name ?? ""}</td><td>${it.inv_type ?? "—"}</td><td>${it.quantity}</td><td>${it.unit ?? ""}</td></tr>`).join("")}
  </tbody>
</table>
${d.notes ? `<p style="margin-top:12px"><strong>Notes:</strong> ${d.notes}</p>` : ""}
<p style="margin-top:16px;font-size:11px;color:#666">Created by: ${d.created_by ?? "—"} | Printed: ${new Date().toLocaleString("en-IN")}</p>
</body></html>`);
  
  win.document.close();
  win.focus();
  win.print();
}
```

**Print button:**
```tsx
<Button size="icon" variant="ghost" className="size-8 shrink-0" onClick={() => printDispatch(d)}>
  <Printer className="size-3.5" />
</Button>
```

**Import addition (line 17):**
```tsx
import { PackageCheck, Plus, Search, Pencil, Minus, Printer } from "lucide-react";
```

## Backend

No backend changes required. The existing `PUT /api/v1/dispatch/{id}` endpoint already supports partial status updates and records status change history.

## Files Modified

- `frontend/app/dashboard/dispatch/page.tsx`
  - Add `Printer` to lucide-react imports (line 17)
  - Add `statusUpdatingId` state
  - Add `handleStatusChange` function
  - Add `printDispatch` function
  - Replace status badge `<span>` with `<select>` (lines 343-345)
  - Add Print button before Edit button (line 368)

## Testing

Manual testing:
1. Change status via dropdown → verify API call succeeds, card updates, history recorded
2. Change status while another is updating → verify disabled state prevents conflicts
3. Trigger API error → verify list reloads to accurate state
4. Click Print button → verify new window opens with formatted dispatch details
5. Print from new window → verify print dialog appears with correct layout
