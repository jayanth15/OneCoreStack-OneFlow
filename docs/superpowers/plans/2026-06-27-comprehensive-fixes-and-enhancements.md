# Comprehensive Fixes & Enhancements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 13 fixes and enhancements across weight/scrap system, document linking, printing, and production.

**Architecture:** Backend changes follow existing FastAPI+SQLModel patterns. Frontend changes follow existing Next.js App Router + shadcn/ui patterns. Print changes follow the stock-alerts company-info pattern.

**Tech Stack:** Next.js 16 (App Router), FastAPI+SQLModel, shadcn/ui, Tailwind CSS v4

**Build Order:**
1. Tasks 1-3: Weight & Scrap (model foundation)
2. Tasks 4-6: Document Linking & Auto-fill
3. Tasks 7-11: Print & Reports
4. Tasks 12-13: Production Enhancements

---

### Task 1: Add weight fields to InventoryItem model

**Files:**
- Modify: `backend/app/models/inventory.py`
- Create: `backend/app/core/legacy_db_migrations.py` (or modify existing migration section)
- Modify: `backend/app/routers/inventory.py`

- [ ] **Step 1: Add weight fields to InventoryItem model**

Edit `backend/app/models/inventory.py` to add after `design_drawing_pdf`:

```python
    weight_value: Optional[float] = Field(default=None)               # weight of one unit
    weight_unit: Optional[str] = Field(default=None)                  # "kg", "g", "mg", "lb"
```

- [ ] **Step 2: Add migration for new columns**

Edit `backend/app/core/legacy_db_migrations.py` — find the inventory_item migration section (around line 167), add after the design_drawing_pdf migration:

```python
# --- weight_value / weight_unit columns ---
cursor.execute("SELECT COUNT(*) AS cnt FROM pragma_table_info('inventory_item') WHERE name='weight_value'")
if cursor.fetchone()[0] == 0:
    cursor.execute("ALTER TABLE inventory_item ADD COLUMN weight_value REAL")
    cursor.execute("ALTER TABLE inventory_item ADD COLUMN weight_unit TEXT")
```

- [ ] **Step 3: Add weight fields to inventory response**

Edit `backend/app/routers/inventory.py` — find the `InventoryItemResponse` and `InventoryItemDetailResponse` schemas, add `weight_value` and `weight_unit` fields to both.

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/inventory.py backend/app/core/legacy_db_migrations.py backend/app/routers/inventory.py
git commit -m "feat: add weight_value and weight_unit fields to InventoryItem"
```

---

### Task 2: Add weight fields to inventory frontend forms

**Files:**
- Modify: `frontend/app/dashboard/inventory/new/page.tsx`
- Modify: `frontend/app/dashboard/inventory/[id]/edit/page.tsx`
- Modify: `frontend/app/dashboard/inventory/[id]/page.tsx`

- [ ] **Step 1: Add weight fields to create form**

Edit `frontend/app/dashboard/inventory/new/page.tsx`. After the "Unit of Measure" field group, add:

```tsx
{/* Weight */}
<div className="grid grid-cols-2 gap-4">
  <div className="space-y-1.5">
    <Label htmlFor="weight_value">Weight per unit</Label>
    <Input id="weight_value" type="number" step="any" min="0"
      value={form.weight_value ?? ""}
      onChange={(e) => setForm(f => ({ ...f, weight_value: e.target.value ? Number(e.target.value) : null }))}
    />
  </div>
  <div className="space-y-1.5">
    <Label htmlFor="weight_unit">Weight unit</Label>
    <Select value={form.weight_unit ?? ""} onValueChange={(v) => setForm(f => ({ ...f, weight_unit: v || null }))}>
      <SelectTrigger id="weight_unit"><SelectValue placeholder="Select unit" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="kg">kg</SelectItem>
        <SelectItem value="g">g</SelectItem>
        <SelectItem value="mg">mg</SelectItem>
        <SelectItem value="lb">lb</SelectItem>
      </SelectContent>
    </Select>
  </div>
</div>
```

Update the `handleSave` function to include `weight_value` and `weight_unit` in the payload.

- [ ] **Step 2: Add weight fields to edit form**

Edit `frontend/app/dashboard/inventory/[id]/edit/page.tsx` — same pattern as create, add after the existing fields, include in load payload and save payload.

- [ ] **Step 3: Display weight on detail page**

Edit `frontend/app/dashboard/inventory/[id]/page.tsx`. Add a weight display in the info section:

```tsx
{item.weight_value != null && (
  <div className="flex items-center gap-2 text-sm">
    <Scale className="size-4 text-muted-foreground" />
    <span className="text-muted-foreground">Weight:</span>
    <span className="font-medium">{item.weight_value} {item.weight_unit}</span>
  </div>
)}
```

Add `Scale` to the lucide-react import.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/dashboard/inventory/new/page.tsx frontend/app/dashboard/inventory/\[id\]/edit/page.tsx frontend/app/dashboard/inventory/\[id\]/page.tsx
git commit -m "feat: add weight field UI to inventory create/edit/detail pages"
```

---

### Task 3: BOM scrap calculation from weights + clone

**Files:**
- Modify: `backend/app/routers/production.py` — update bom-preview
- Modify: `backend/app/routers/bom.py` — add clone endpoint
- Modify: `frontend/app/dashboard/admin/bom/new/page.tsx` — add clone button
- Modify: `frontend/app/dashboard/admin/bom/page.tsx` — show computed scrap
- Modify: `frontend/app/dashboard/admin/bom/[id]/edit/page.tsx` — show computed scrap

- [ ] **Step 1: Add weight-to-grams helper to production.py**

Edit `backend/app/routers/production.py`, add after imports:

```python
WEIGHT_TO_GRAM = {"kg": 1000.0, "g": 1.0, "mg": 0.001, "lb": 453.592}

def _weight_to_grams(value: float | None, unit: str | None) -> float:
    if value is None or not unit:
        return 0.0
    return value * WEIGHT_TO_GRAM.get(unit, 1.0)
```

- [ ] **Step 2: Update bom_preview to include scrap in demand**

Edit `backend/app/routers/production.py`. Find the `bom_preview` endpoint (around line 765). After loading BOM items and the FG item, compute scrap rate and adjust `required_qty`:

```python
# Compute weight-based scrap factor
fg = session.get(InventoryItem, fg_item.id) if fg_item else None
total_input_g = 0.0
rm_weights = []
for b in bom_items:
    rm = session.get(InventoryItem, b.raw_material_id)
    if rm:
        w = _weight_to_grams(rm.weight_value, rm.weight_unit) * b.qty_per_unit
        total_input_g += w
        rm_weights.append(w)
    else:
        rm_weights.append(0.0)

fg_weight_g = _weight_to_grams(fg.weight_value, fg.weight_unit) if fg else 0.0
scrap_rate = 0.0
if total_input_g > 0 and fg_weight_g > 0 and total_input_g > fg_weight_g:
    scrap_rate = (total_input_g - fg_weight_g) / total_input_g

# Adjust required_qty by scrap factor
for req in material_requirements:
    req["required_qty"] = round(req["qty_per_unit"] * planned_qty * (1 + scrap_rate), 4)
    req["scrap_rate"] = round(scrap_rate * 100, 2)
```

- [ ] **Step 3: Add BOM clone endpoint**

Add to `backend/app/routers/bom.py`:

```python
class BomCloneBody(BaseModel):
    source_product_name: str
    target_product_name: str

@router.post("/clone", response_model=list[BomItemResponse], status_code=201)
def clone_bom(
    body: BomCloneBody,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(require_admin)],
) -> list[dict]:
    # Fetch source BOM lines
    source_lines = list(session.exec(
        select(BomItem).where(
            BomItem.product_name == body.source_product_name.strip(),
            BomItem.is_active == True,
        )
    ).all())
    if not source_lines:
        raise HTTPException(status_code=404, detail="Source product BOM not found")

    # Check target doesn't already have BOM lines
    existing = session.exec(
        select(BomItem).where(BomItem.product_name == body.target_product_name.strip())
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Target product already has BOM entries")

    created = []
    for src in source_lines:
        bom = BomItem(
            product_name=body.target_product_name.strip(),
            raw_material_id=src.raw_material_id,
            qty_per_unit=src.qty_per_unit,
            notes=src.notes,
            is_active=True,
        )
        session.add(bom)
        session.flush()
        rm = session.get(InventoryItem, bom.raw_material_id)
        created.append({
            **bom.__dict__,
            "raw_material_code": rm.code if rm else None,
            "raw_material_name": rm.name if rm else None,
            "raw_material_unit": rm.unit if rm else None,
        })
    session.commit()
    return created
```

- [ ] **Step 4: Add clone button to BOM new page**

Edit `frontend/app/dashboard/admin/bom/new/page.tsx`. Add a "Copy from existing" button near the top that opens a search/select dialog, then calls `POST /api/v1/bom/clone` and redirects to edit the new BOM.

- [ ] **Step 5: Show computed scrap in BOM list**

Edit `frontend/app/dashboard/admin/bom/page.tsx`. In the BOM line display, add a computed scrap column. When an item's scrap is null (no manual override), show "—" with a note: "Scrap computed from weights during production".

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/production.py backend/app/routers/bom.py frontend/app/dashboard/admin/bom/
git commit -m "feat: BOM weight-based scrap calculation and clone endpoint"
```

---

### Task 4: Fix Purchase Order PR auto-fill

**Files:**
- Modify: `frontend/app/dashboard/purchase-orders/page.tsx`

- [ ] **Step 1: Understand the current PR API**

- `GET /api/v1/purchase-requests` returns `RequestListRead` — no `items`, no `item_name`
- `GET /api/v1/purchase-requests/{id}` already exists and returns `RequestRead` which HAS `items: List[RequestItemRead]` (each with `item_name`, `quantity`, etc.)
- Fix: `seedFromPR` must call the detail endpoint instead of relying on the list data

- [ ] **Step 2: Fix seedFromPR to fetch PR detail**

Edit `frontend/app/dashboard/purchase-orders/page.tsx`. Change `seedFromPR` from synchronous lookup to async fetch:

```typescript
async function seedFromPR(prId: number) {
  try {
    const prDetail = await apiFetchJson<any>(`/api/v1/purchase-requests/${prId}`);
    const prItems = (prDetail.items || []).map((i: any) => ({
      item_name: i.item_name ?? "",
      quantity: i.quantity,
      unit: i.unit ?? "",
      rate: 0,
      notes: "",
    }));
    setCreateForm(f => ({
      ...f,
      items: prItems.length > 0 ? prItems : [{ item_name: "", quantity: 1, unit: "", rate: 0, notes: "" }],
      purchase_request_id: prDetail.id,
      purchase_request_number: prDetail.sn_no,
    }));
    setShowCreate(true);
  } catch {
    setCreateForm(f => ({ ...f, items: [{ item_name: "", quantity: 1, unit: "", rate: 0, notes: "" }] }));
    setShowCreate(true);
  }
}
```

Update both callers — `applyFromRequest()` and the `useEffect` for `from_pr` search param — to `await seedFromPR(prId)`. The `applyFromRequest` already closes the dialog after calling `seedFromPR`, keep that same flow.

- [ ] **Step 3: Fix PR dropdown display**

The `From Request` dialog shows PR options as `pr.sn_no — pr.item_name`. Since `item_name` is not in the list response, change to just show `pr.sn_no` or `pr.sn_no — (items: pr.quantity)`.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/dashboard/purchase-orders/page.tsx
git commit -m "fix: purchase order PR auto-fill now fetches items from detail endpoint"
```

---

### Task 5: GRN → Link Purchase Order

**Files:**
- Modify: `backend/app/routers/purchase_orders.py` — add linkable/linked-items endpoints
- Modify: `frontend/app/dashboard/grn/page.tsx` — add PO combobox + auto-fill

- [ ] **Step 1: Add linkable POs endpoint**

Edit `backend/app/routers/purchase_orders.py`. Add:

```python
@router.get("/linkable")
def list_linkable_pos(
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
    search: str = "",
) -> list[dict[str, Any]]:
    _require_access(current_user)
    q = select(PurchaseOrder).where(PurchaseOrder.status.in_(["approved", "draft"]))
    pos = list(session.exec(q.order_by(PurchaseOrder.po_number)).all())
    if search:
        s = search.lower()
        pos = [p for p in pos if s in (p.po_number or "").lower() or s in (p.supplier_name or "").lower() or s in (p.vendor_name or "").lower()]
    return [{"id": p.id, "po_number": p.po_number, "supplier_name": p.supplier_name, "vendor_name": p.vendor_name, "party_type": p.party_type} for p in pos]
```

- [ ] **Step 2: Add PO items endpoint for linking**

The existing `GET /api/v1/purchase-orders/{po_id}` already returns items. The frontend can call this directly.

- [ ] **Step 3: Add PO combobox + auto-fill to GRN form**

Edit `frontend/app/dashboard/grn/page.tsx`:

1. Add state: `poSearchQuery`, `pos`, `poLinking` (loading state)
2. Add debounced fetch for linkable POs
3. Add a `<SearchCombobox>` for PO next to the existing PR combobox
4. On PO select: fetch `GET /api/v1/purchase-orders/{id}`, auto-fill:
   - `vendor_name` / `supplier_name` into form
   - `po_number` into the po_number field
   - PO items into `formItems` (with `quantity_received` left empty for user to fill)
5. Keep the existing free-text po_number input functional

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/purchase_orders.py frontend/app/dashboard/grn/page.tsx
git commit -m "feat: GRN can link and auto-fill from Purchase Orders"
```

---

### Task 6: Gate Pass → Link Purchase Order + Dispatch → Link Customer Request

**Files:**
- Modify: `backend/app/models/gate_pass.py` — add po fields
- Modify: `backend/app/routers/gate_passes.py` — update CRUD
- Modify: `frontend/app/dashboard/gate-passes/page.tsx` — add PO combobox
- Modify: `backend/app/models/dispatch.py` — add request fields
- Modify: `backend/app/routers/dispatch.py` — update CRUD
- Modify: `frontend/app/dashboard/dispatch/page.tsx` — add request combobox
- Modify: `backend/app/core/legacy_db_migrations.py`

- [ ] **Step 1: Add PO fields to GatePass model**

Edit `backend/app/models/gate_pass.py`, add after `purchase_request_number`:

```python
    purchase_order_id: Optional[int] = Field(default=None)
    purchase_order_number: Optional[str] = None
```

- [ ] **Step 2: Add migration for gate_pass PO columns**

Edit `backend/app/core/legacy_db_migrations.py` — find gate_pass migration section, add:

```python
cursor.execute("SELECT COUNT(*) AS cnt FROM pragma_table_info('gate_pass') WHERE name='purchase_order_id'")
if cursor.fetchone()[0] == 0:
    cursor.execute("ALTER TABLE gate_pass ADD COLUMN purchase_order_id INTEGER")
    cursor.execute("ALTER TABLE gate_pass ADD COLUMN purchase_order_number TEXT")
```

- [ ] **Step 3: Update gate_pass router for PO fields**

Edit `backend/app/routers/gate_passes.py`. In the create and update endpoints, add `purchase_order_id` and `purchase_order_number` to the accepted fields and the response dictionary.

- [ ] **Step 4: Add PO combobox to gate pass form**

Edit `frontend/app/dashboard/gate-passes/page.tsx`. Add a `<SearchCombobox>` for POs alongside the existing PR dropdown. Use the same `/api/v1/purchase-orders/linkable` endpoint. On select: auto-fill vendor/supplier name, items into the form.

- [ ] **Step 5: Add request fields to Dispatch model**

Edit `backend/app/models/dispatch.py`, add after `schedule_number`:

```python
    request_id: Optional[int] = Field(default=None)
    request_sn_no: Optional[str] = None
```

- [ ] **Step 6: Add migration for dispatch request columns**

Edit `backend/app/core/legacy_db_migrations.py` — find dispatch migration section, add:

```python
cursor.execute("SELECT COUNT(*) AS cnt FROM pragma_table_info('dispatch') WHERE name='request_id'")
if cursor.fetchone()[0] == 0:
    cursor.execute("ALTER TABLE dispatch ADD COLUMN request_id INTEGER")
    cursor.execute("ALTER TABLE dispatch ADD COLUMN request_sn_no TEXT")
```

- [ ] **Step 7: Update dispatch router for request fields**

Edit `backend/app/routers/dispatch.py`. In create, update, and `_to_dict`, add `request_id` and `request_sn_no`.

- [ ] **Step 8: Add request combobox to dispatch form**

Edit `frontend/app/dashboard/dispatch/page.tsx`. Add a `<SearchCombobox>` that fetches from `GET /api/v1/requests?request_type=customer_dispatch&status=approved`. On select: auto-fill customer info (name, phone, address), inventory type, item SN, qty into the dispatch form and items.

- [ ] **Step 9: Commit**

```bash
git add backend/app/models/gate_pass.py backend/app/routers/gate_passes.py frontend/app/dashboard/gate-passes/page.tsx backend/app/models/dispatch.py backend/app/routers/dispatch.py frontend/app/dashboard/dispatch/page.tsx backend/app/core/legacy_db_migrations.py
git commit -m "feat: Gate Pass PO linking and Dispatch customer request linking"
```

---

### Task 7: Add company info to all print templates

**Files:**
- Modify: `frontend/app/dashboard/purchase-orders/page.tsx`
- Modify: `frontend/app/dashboard/gate-passes/page.tsx`
- Modify: `frontend/app/dashboard/dispatch/page.tsx`
- Modify: `frontend/app/dashboard/grn/page.tsx`
- Modify: `frontend/app/dashboard/receipts/page.tsx` — add print

- [ ] **Step 1: Fetch company info on all affected pages**

For each page listed above, fetch company info in the `useEffect` on mount:

```typescript
const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);

useEffect(() => {
  apiFetchJson<CompanyInfo>("/api/v1/settings/company")
    .then(setCompanyInfo)
    .catch(() => {});
}, []);
```

Define the `CompanyInfo` interface (or import it if shared):

```typescript
interface CompanyInfo {
  company_name?: string;
  company_address?: string;
  company_city?: string;
  company_state?: string;
  company_pincode?: string;
  company_phone?: string;
  company_email?: string;
  company_gstin?: string;
}
```

- [ ] **Step 2: Add company header to each print function**

For each print function, prepend to the HTML string:

```typescript
const companyBlock = companyInfo?.company_name
  ? `<div style="text-align:center;margin-bottom:20px;padding-bottom:10px;border-bottom:2px solid #333;">
      <h1 style="margin:0;font-size:20px;font-weight:bold;">${companyInfo.company_name}</h1>
      ${companyInfo.company_address ? `<p style="margin:4px 0;">${companyInfo.company_address}${companyInfo.company_city ? ', ' + companyInfo.company_city : ''}${companyInfo.company_state ? ', ' + companyInfo.company_state : ''}${companyInfo.company_pincode ? ' - ' + companyInfo.company_pincode : ''}</p>` : ''}
      <p style="margin:2px 0;font-size:12px;">
        ${companyInfo.company_phone ? `Phone: ${companyInfo.company_phone} | ` : ''}
        ${companyInfo.company_email ? `Email: ${companyInfo.company_email} | ` : ''}
        ${companyInfo.company_gstin ? `GST: ${companyInfo.company_gstin}` : ''}
      </p>
    </div>`
  : '';
```

Prepend `companyBlock` to the existing print HTML.

- [ ] **Step 3: Create print function for Receipts**

Edit `frontend/app/dashboard/receipts/page.tsx`. Add a print button that opens a window with receipt details, following the same pattern as other print functions.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/dashboard/purchase-orders/page.tsx frontend/app/dashboard/gate-passes/page.tsx frontend/app/dashboard/dispatch/page.tsx frontend/app/dashboard/grn/page.tsx frontend/app/dashboard/receipts/page.tsx
git commit -m "feat: add company info to all print templates and add receipts print"
```

---

### Task 8: History — filter by name + print

**Files:**
- Modify: `backend/app/routers/history.py`
- Modify: `frontend/app/dashboard/history/page.tsx`

- [ ] **Step 1: Add entity_name filter to backend**

Edit `backend/app/routers/history.py`. In the `list_history` endpoint, add an `entity_name` query parameter. After resolving entity names from parent tables, apply a case-insensitive filter:

```python
async def list_history(
    # ... existing params ...
    entity_name: str = "",
) -> dict:
    # ... existing code ...
    items = await _get_history(category, page, page_size, start_date, end_date, changed_by, entity_name)
```

In each `_*_history()` helper, after resolving entity names, filter the list by `entity_name` using `str.lower()` substring match against the resolved name field.

- [ ] **Step 2: Add filter input to history frontend**

Edit `frontend/app/dashboard/history/page.tsx`. Add a text input "Item / Entity name" in the filters row:

```tsx
<Input
  placeholder="Item / Entity name"
  value={entityName}
  onChange={(e) => { setEntityName(e.target.value); /* trigger debounced reload */ }}
  className="max-w-xs"
/>
```

Update `buildQuery()` to include `entity_name` param.

- [ ] **Step 3: Add print button to history frontend**

Add a Printer icon button. `printHistory()` builds an HTML table of the currently displayed results (respecting active category + active filters):

```typescript
function printHistory() {
  const win = window.open("", "_blank");
  if (!win) return;
  const rows = filteredItems.map(item => `<tr>${/* build cells based on category */}</tr>`).join("");
  win.document.write(`<html><head><title>History - ${activeCategory}</title><style>table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px;text-align:left}th{background:#f5f5f5}</style></head><body><h2>History - ${activeCategoryLabel}</h2><table><thead>${headers}</thead><tbody>${rows}</tbody></table></body></html>`);
  win.document.close();
  win.print();
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/history.py frontend/app/dashboard/history/page.tsx
git commit -m "feat: history entity name filter and print functionality"
```

---

### Task 9: Spares — cycle count print

**Files:**
- Modify: `frontend/app/dashboard/inventory/spares/page.tsx`

- [ ] **Step 1: Add "Print Cycle Count" button and function**

Edit `frontend/app/dashboard/inventory/spares/page.tsx`. Add a Printer icon button in the header area. The function collects all visible spare items (respecting current search filter) and generates:

```typescript
function printCycleCount() {
  const win = window.open("", "_blank");
  if (!win) return;
  // Collect items from the expanded tree
  const rows = /* iterate through categories→subcategories→items→variants */;
  win.document.write(`<html><head><title>Spares Cycle Count</title>
    <style>
      table{width:100%;border-collapse:collapse;font-size:12px;}
      th,td{border:1px solid #999;padding:6px;text-align:left;}
      th{background:#e5e5e5;}
      .counted{border-bottom:1px solid #333;min-width:60px;display:inline-block;padding:0 4px;}
      .cat{background:#f0f0f0;font-weight:bold;}
      .subcat{padding-left:20px!important;font-weight:600;}
    </style></head><body>
    <h2 style="text-align:center;">Spares Cycle Count</h2>
    <p style="text-align:center;">Date: ${new Date().toLocaleDateString()}</p>
    <table><thead><tr>
      <th>Category</th><th>Sub-Category</th><th>Item</th><th>Variant</th><th>Current Qty</th><th>Counted Qty</th>
    </tr></thead><tbody>${rows}</tbody></table>
    <p style="text-align:center;margin-top:20px;font-style:italic;">Counted by: _________________  Date: _______________</p>
    </body></html>`);
  win.document.close();
  win.print();
}
```

Each row has the current qty filled in and a blank "Counted Qty" column (an underlined blank space for manual entry).

- [ ] **Step 2: Commit**

```bash
git add frontend/app/dashboard/inventory/spares/page.tsx
git commit -m "feat: spares cycle count print functionality"
```

---

### Task 10: Work Time Report — print option

**Files:**
- Modify: `frontend/app/dashboard/production/time-report/page.tsx`

- [ ] **Step 1: Add print button and function**

Edit `frontend/app/dashboard/production/time-report/page.tsx`. Add a Printer icon button visible when a single worker is selected. The print function builds a report:

```typescript
function printWorkerReport() {
  const win = window.open("", "_blank");
  if (!win) return;
  const { worker, report } = /* current state */;
  win.document.write(`<html><head><title>Time Report - ${worker}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:20px;}
      table{width:100%;border-collapse:collapse;margin:10px 0;}
      th,td{border:1px solid #ccc;padding:6px;text-align:left;}
      th{background:#f0f0f0;}
      .section{margin-top:20px;}
      .section h3{background:#e8e8e8;padding:6px 10px;margin:0;}
      .stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:10px 0;}
      .stat-card{background:#f9f9f9;border:1px solid #ddd;padding:10px;text-align:center;}
    </style></head><body>
    <h2 style="text-align:center;">Worker Time Report</h2>
    <p style="text-align:center;">Worker: <strong>${worker}</strong> | Period: ${dateFrom} to ${dateTo}</p>
    <div class="stat-grid">
      <div class="stat-card"><div>Total Hours</div><strong>${report.total_hours}</strong></div>
      <div class="stat-card"><div>Qty Produced</div><strong>${report.qty_produced}</strong></div>
      ...
    </div>
    <!-- By Process table -->
    <div class="section"><h3>By Process</h3><table>...</table></div>
    <!-- Daily Activity table -->
    <div class="section"><h3>Daily Activity</h3><table>...</table></div>
    <!-- By Order table -->
    <div class="section"><h3>By Production Order</h3><table>...</table></div>
    </body></html>`);
  win.document.close();
  win.print();
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/dashboard/production/time-report/page.tsx
git commit -m "feat: worker time report print functionality"
```

---

### Task 11: Job Card — auto-propagate estimated time

**Files:**
- Modify: `frontend/app/dashboard/production/processing/[id]/page.tsx`

- [ ] **Step 1: Show estimated vs actual time on order detail**

Edit `frontend/app/dashboard/production/processing/[id]/page.tsx`. In the job cards section, for each job card, look up the corresponding process's `estimated_time_minutes` (available from the processes array loaded for the order). Display:

```tsx
<div className="flex items-center gap-2 text-xs text-muted-foreground">
  <Clock className="size-3" />
  <span>Est: {estimatedMinutes}m</span>
  <span>|</span>
  <span className={card.hours_worked > estimatedMinutes ? "text-amber-600 font-medium" : ""}>
    Actual: {card.hours_worked}h
  </span>
</div>
```

At the top of the order detail, add an aggregate comparison:

```tsx
{/* Aggregate time summary */}
<div className="grid grid-cols-2 gap-4 mb-4">
  <div className="bg-muted/30 rounded-lg p-3">
    <div className="text-xs text-muted-foreground">Total Estimated Time</div>
    <div className="text-lg font-bold">{totalEstimatedHr}h {totalEstimatedMin}m</div>
  </div>
  <div className="bg-muted/30 rounded-lg p-3">
    <div className="text-xs text-muted-foreground">Total Actual Time</div>
    <div className="text-lg font-bold">{totalActualHr}h</div>
  </div>
</div>
```

- [ ] **Step 2: When creating a job card, show estimated time from process**

In the job card create form (`processing/[id]/jobs/new/page.tsx`), when a process is selected, display the estimated time from that process as a reference.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/dashboard/production/processing/\[id\]/page.tsx frontend/app/dashboard/production/processing/\[id\]/jobs/new/page.tsx
git commit -m "feat: job card estimated vs actual time display"
```

---

### Task 12: Quick job card creator on main production screen

**Files:**
- Modify: `frontend/app/dashboard/production/page.tsx`

- [ ] **Step 1: Add quick create panel**

Edit `frontend/app/dashboard/production/page.tsx`. Add a fourth card/panel with a simple form:

```tsx
"use client";
// ... existing imports ...
import { apiFetchJson } from "@/lib/api";
import { getCurrentUser } from "@/lib/user";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, PlusCircle } from "lucide-react";

interface ProductionOrder { id: number; order_number: string; product_name: string; planned_qty: number; }

export default function ProductionDashboard() {
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [workDate, setWorkDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [qty, setQty] = useState(1);
  const [workerName, setWorkerName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetchJson<{items: ProductionOrder[]}>("/api/v1/production/orders?status=in_progress")
      .then(r => setOrders(r.items))
      .catch(() => {});
    const user = getCurrentUser();
    if (user) setWorkerName(user.username);
  }, []);

  async function handleQuickCreate() {
    if (!selectedOrderId || qty <= 0) return;
    setSaving(true);
    try {
      const order = orders.find(o => o.id === Number(selectedOrderId));
      // Get order detail to find processes
      const detail = await apiFetchJson<any>(`/api/v1/production/orders/${selectedOrderId}`);
      const processName = detail.processes?.[0]?.name || "General";
      await apiFetchJson(`/api/v1/production/orders/${selectedOrderId}/jobs`, {
        method: "POST",
        body: JSON.stringify({
          process_name: processName,
          worker_names: [workerName],
          hours_worked: 0,
          qty_produced: qty,
          work_date: workDate,
          notes: "Quick entry from production dashboard",
        }),
      });
      // Reset form
      setQty(1);
      // Show success feedback
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Existing 3 nav cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* ... existing cards ... */}
      </div>

      {/* New: Quick Job Card Creator */}
      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <PlusCircle className="size-5" />
          Quick Job Card Entry
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Production Order</label>
            <Select value={selectedOrderId} onValueChange={setSelectedOrderId}>
              <SelectTrigger><SelectValue placeholder="Select order..." /></SelectTrigger>
              <SelectContent>
                {orders.map(o => (
                  <SelectItem key={o.id} value={String(o.id)}>
                    {o.order_number} — {o.product_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Date</label>
            <Input type="date" value={workDate} onChange={e => setWorkDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Qty Produced</label>
            <Input type="number" min={1} value={qty} onChange={e => setQty(Number(e.target.value) || 1)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Worker</label>
            <Input value={workerName} onChange={e => setWorkerName(e.target.value)} />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={handleQuickCreate} disabled={!selectedOrderId || saving}>
            {saving ? <Loader2 className="size-4 animate-spin mr-1" /> : <PlusCircle className="size-4 mr-1" />}
            Create Job Card
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/dashboard/production/page.tsx
git commit -m "feat: quick job card creator on production dashboard"
```

---

### Task 13: Verify and run tests

**Files:**
- Run: backend tests
- Run: any existing tests

- [ ] **Step 1: Run backend tests**

```bash
cd backend && python -m pytest -x -v 2>&1 | tail -60
```

Expected: all tests pass (including existing ones and any new ones added during implementation).

- [ ] **Step 2: Run frontend build check**

```bash
cd frontend && npm run build 2>&1 | tail -30
```

Expected: TypeScript compilation succeeds with no errors.

- [ ] **Step 3: Commit any fixes**

If tests fail, fix issues and commit fixes.

- [ ] **Step 4: Final commit**

```bash
git commit -m "chore: fix lint and typecheck issues"
```
