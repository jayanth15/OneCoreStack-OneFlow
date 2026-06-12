# Dispatch Card Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Print button and inline status dropdown to dispatch cards for quick status updates and printing.

**Architecture:** All changes are in a single file (`frontend/app/dashboard/dispatch/page.tsx`). The inline status `<select>` replaces the static badge and fires an immediate `PUT` to the existing backend endpoint. The print function opens a new window with formatted HTML mirroring the gate-pass print pattern.

**Tech Stack:** React 19, Next.js 16, Tailwind CSS 4, lucide-react, existing `apiFetchJson` utility

---

### Task 1: Add Printer icon import

**Files:**
- Modify: `frontend/app/dashboard/dispatch/page.tsx:17`

- [ ] **Step 1: Add Printer to the lucide-react import**

Change line 17 from:
```tsx
import { PackageCheck, Plus, Search, Pencil, Minus } from "lucide-react";
```
to:
```tsx
import { PackageCheck, Plus, Search, Pencil, Minus, Printer } from "lucide-react";
```

- [ ] **Step 2: Run lint to verify**

Run: `cd frontend && npx eslint app/dashboard/dispatch/page.tsx`
Expected: No errors

---

### Task 2: Add statusUpdatingId state and handleStatusChange function

**Files:**
- Modify: `frontend/app/dashboard/dispatch/page.tsx` (state near line 135, handler near line 246)

- [ ] **Step 1: Add statusUpdatingId state**

After line 135 (`const searchRef = useRef<HTMLInputElement>(null);`), add:

```tsx
  const [statusUpdatingId, setStatusUpdatingId] = useState<number | null>(null);
```

- [ ] **Step 2: Add handleStatusChange function**

After the `handleEdit` function (after line 245, before the `return` on line 247), add:

```tsx
  async function handleStatusChange(dispatchId: number, newStatus: string) {
    setStatusUpdatingId(dispatchId);
    try {
      await apiFetchJson(`/api/v1/dispatch/${dispatchId}`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
      });
      setItems(prev => prev.map(item =>
        item.id === dispatchId ? { ...item, status: newStatus } : item
      ));
    } catch {
      load();
    } finally {
      setStatusUpdatingId(null);
    }
  }
```

- [ ] **Step 3: Run lint to verify**

Run: `cd frontend && npx eslint app/dashboard/dispatch/page.tsx`
Expected: No errors

---

### Task 3: Add printDispatch function

**Files:**
- Modify: `frontend/app/dashboard/dispatch/page.tsx` (after handleStatusChange, before the `return`)

- [ ] **Step 1: Add printDispatch function**

After the `handleStatusChange` function (added in Task 2), add:

```tsx
  function printDispatch(d: Dispatch) {
    const items = d.items && d.items.length > 0
      ? d.items
      : [{ item_name: d.product_name, quantity: d.quantity, unit: d.unit, inv_type: null }];
    const partyName = d.party_type === "supplier" ? d.supplier_name : d.vendor_name;
    const partyLabel = d.party_type === "vendor" ? "Vendor" : "Supplier";
    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Dispatch &mdash; ${d.dispatch_number}</title>
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
<h2>Dispatch &mdash; ${d.dispatch_number}</h2>
<p class="meta">Generated on ${new Date().toLocaleString("en-IN")}</p>
<div class="row">
  <div><div class="lbl">Party</div><div>${partyLabel}: ${partyName ?? "&mdash;"}</div></div>
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
    ${items.map((it, i) => `<tr><td>${i + 1}</td><td>${it.item_name ?? ""}</td><td>${it.inv_type ?? "&mdash;"}</td><td>${it.quantity}</td><td>${it.unit ?? ""}</td></tr>`).join("")}
  </tbody>
</table>
${d.notes ? `<p style="margin-top:12px"><strong>Notes:</strong> ${d.notes}</p>` : ""}
<p style="margin-top:16px;font-size:11px;color:#666">Created by: ${d.created_by ?? "&mdash;"} | Printed: ${new Date().toLocaleString("en-IN")}</p>
</body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }
```

- [ ] **Step 2: Run lint to verify**

Run: `cd frontend && npx eslint app/dashboard/dispatch/page.tsx`
Expected: No errors

---

### Task 4: Replace status badge with inline dropdown and add Print button on card

**Files:**
- Modify: `frontend/app/dashboard/dispatch/page.tsx` (card rendering, lines 336-371 in original)

- [ ] **Step 1: Replace the status badge `<span>` with a `<select>` dropdown**

Find the status badge in the card rendering (originally lines 343-345):
```tsx
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[d.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {d.status}
                      </span>
```

Replace with:
```tsx
                      <select
                        value={d.status}
                        onChange={(e) => handleStatusChange(d.id, e.target.value)}
                        disabled={statusUpdatingId === d.id}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 ${STATUS_COLORS[d.status] ?? "bg-slate-100 text-slate-600"}`}
                      >
                        {STATUSES.map(s => (
                          <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                        ))}
                      </select>
```

- [ ] **Step 2: Add Print button before the Edit button**

Find the Edit button in the card (originally lines 368-370):
```tsx
                  <Button size="icon" variant="ghost" className="size-8 shrink-0" onClick={() => openEdit(d)}>
                    <Pencil className="size-3.5" />
                  </Button>
```

Replace with:
```tsx
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="size-8" onClick={() => printDispatch(d)}>
                      <Printer className="size-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="size-8" onClick={() => openEdit(d)}>
                      <Pencil className="size-3.5" />
                    </Button>
                  </div>
```

- [ ] **Step 3: Run lint to verify**

Run: `cd frontend && npx eslint app/dashboard/dispatch/page.tsx`
Expected: No errors

- [ ] **Step 4: Run build to verify no type errors**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 5: Manual verification**

Open the dispatch page in the browser and verify:
1. Each dispatch card shows a status dropdown (styled with colors) instead of a static badge
2. Changing the dropdown value immediately updates the status (check network tab for PUT call)
3. Dropdown is disabled briefly while the API call is in flight
4. Each card has a Print icon button to the left of the Edit icon button
5. Clicking Print opens a new window with formatted dispatch details
6. The Edit button still opens the full edit dialog as before

---

### Task 5: Commit

- [ ] **Step 1: Stage and commit**

```bash
git add frontend/app/dashboard/dispatch/page.tsx
git commit -m "feat(dispatch): add inline status dropdown and print button to dispatch cards"
```
