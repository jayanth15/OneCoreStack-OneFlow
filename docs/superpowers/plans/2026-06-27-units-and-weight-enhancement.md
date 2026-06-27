# Units & Weight Enhancement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all hardcoded unit strings with user-managed Unit table + FK references across 14 models.

**Architecture:** New `Unit` SQLModel table. Alembic migration converts all 14 existing string unit columns to FK references with batch data migration. New `/api/v1/units` router for CRUD. Settings page gains a "Units" tab. All 5 frontend forms with hardcoded unit dropdowns fetch from the API instead.

**Tech Stack:** SQLModel, FastAPI, Alembic (batch mode for SQLite), shadcn/ui Tabs

**Build order:**
1. Tasks 1-4: Backend (model + router + migration + models + routers)
2. Tasks 5-7: Frontend (settings tabs + form replacements + validation)

---

### Task 1: Unit model + router + usage-count + Alembic migration

**Files:**
- Create: `backend/app/models/unit.py`
- Create: `backend/app/routers/units.py`
- Create: `backend/alembic/versions/0003_unit_table_and_migration.py`

- [ ] **Step 1: Create Unit model**

Create `backend/app/models/unit.py`:

```python
from datetime import datetime, timezone
from typing import Optional
from sqlmodel import Field, SQLModel

class Unit(SQLModel, table=True):
    __tablename__ = "unit"
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True, max_length=50, index=True)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
```

Add `from app.models.unit import Unit  # noqa: F401` to `backend/app/models/__init__.py` (alphabetically, after the existing entries).

- [ ] **Step 2: Create Unit router**

Create `backend/app/routers/units.py`:

```python
from datetime import datetime, timezone
from typing import Annotated, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select, text
from app.core.database import get_session
from app.dependencies.auth import get_current_user, require_admin
from app.models.unit import Unit
from app.models.user import User

router = APIRouter(prefix="/api/v1/units", tags=["units"])

REFERENCING_COLUMNS = [
    ("inventory_item", "unit_id"),
    ("inventory_item", "weight_unit_id"),
    ("bom_item", "material_unit_id"),
    ("grn_item", "unit_id"),
    ("dispatch_item", "unit_id"),
    ("dispatch", "unit_id"),
    ("gate_pass", "unit_id"),
    ("gate_pass_item", "unit_id"),
    ("purchase_order_item", "unit_id"),
    ("receipt_item", "unit_id"),
    ("supplier_materials", "unit_id"),
    ("supplier_jobs", "unit_id"),
    ("spare_item", "unit_id"),
    ("production_process", "material_unit_id"),
]

class UnitCreate(BaseModel):
    name: str

class UnitRename(BaseModel):
    name: str

class UnitResponse(BaseModel):
    id: int
    name: str
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}

class UsageCountResponse(BaseModel):
    total: int
    by_table: dict[str, int]

@router.get("", response_model=list[UnitResponse])
def list_units(
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
    include_inactive: bool = False,
):
    q = select(Unit)
    if not include_inactive and current_user.role not in ("admin", "super_admin"):
        q = q.where(Unit.is_active == True)
    return session.exec(q.order_by(Unit.name)).all()

@router.post("", response_model=UnitResponse, status_code=201)
def create_unit(
    body: UnitCreate,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(require_admin)],
):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, detail="Unit name is required")
    existing = session.exec(select(Unit).where(Unit.name == name)).first()
    if existing:
        raise HTTPException(409, detail="Unit already exists")
    unit = Unit(name=name)
    session.add(unit)
    session.commit()
    session.refresh(unit)
    return unit

@router.put("/{unit_id}", response_model=UnitResponse)
def rename_unit(
    unit_id: int,
    body: UnitRename,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(require_admin)],
):
    unit = session.get(Unit, unit_id)
    if not unit:
        raise HTTPException(404, detail="Unit not found")
    name = body.name.strip()
    if not name:
        raise HTTPException(400, detail="Unit name is required")
    existing = session.exec(select(Unit).where(Unit.name == name, Unit.id != unit_id)).first()
    if existing:
        raise HTTPException(409, detail="Unit name already taken")
    unit.name = name
    session.add(unit)
    session.commit()
    session.refresh(unit)
    return unit

@router.get("/{unit_id}/usage-count", response_model=UsageCountResponse)
def get_unit_usage_count(
    unit_id: int,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(require_admin)],
):
    unit = session.get(Unit, unit_id)
    if not unit:
        raise HTTPException(404, detail="Unit not found")
    by_table: dict[str, int] = {}
    total = 0
    for table, column in REFERENCING_COLUMNS:
        count = session.scalar(text(f"SELECT COUNT(*) FROM {table} WHERE {column} = :uid"), {"uid": unit_id}) or 0
        if count > 0:
            by_table[f"{table}.{column}"] = count
            total += count
    return UsageCountResponse(total=total, by_table=by_table)

@router.delete("/{unit_id}", status_code=204)
def delete_unit(
    unit_id: int,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(require_admin)],
):
    unit = session.get(Unit, unit_id)
    if not unit:
        raise HTTPException(404, detail="Unit not found")
    # Check usage (RESTRICT)
    total = 0
    for table, column in REFERENCING_COLUMNS:
        count = session.scalar(text(f"SELECT COUNT(*) FROM {table} WHERE {column} = :uid"), {"uid": unit_id}) or 0
        if count > 0:
            total += count
    if total > 0:
        raise HTTPException(409, detail={"message": "Unit is in use and cannot be deleted", "total": total})
    session.delete(unit)
    session.commit()
```

Register the router. Add `from app.routers import units` and `app.include_router(units.router)` in `backend/app/main.py`.

- [ ] **Step 3: Create Alembic migration 0003**

Create `backend/alembic/versions/0003_unit_table_and_migration.py`:

```python
"""Create unit table and migrate all unit columns to FK references

Revision ID: 0003
Revises: 0002
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, Sequence[str], None] = "0002"
branch_labels = None
depends_on = None

# All tables and their old/new column names
SOURCE_COLUMNS = [
    ("inventory_item", "unit", "unit_id"),
    ("inventory_item", "weight_unit", "weight_unit_id"),
    ("bom_item", "material_unit", "material_unit_id"),
    ("grn_item", "unit", "unit_id"),
    ("dispatch_item", "unit", "unit_id"),
    ("dispatch", "unit", "unit_id"),
    ("gate_pass", "unit", "unit_id"),
    ("gate_pass_item", "unit", "unit_id"),
    ("purchase_order_item", "unit", "unit_id"),
    ("receipt_item", "unit", "unit_id"),
    ("supplier_materials", "unit", "unit_id"),
    ("supplier_jobs", "unit", "unit_id"),
    ("spare_item", "unit", "unit_id"),
    ("production_process", "material_unit", "material_unit_id"),
]

def upgrade():
    # 1. Create unit table
    op.create_table(
        "unit",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(50), unique=True, index=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
    )

    # 2. Extract all unique unit names and insert into unit table
    union_parts = []
    for table, old_col, _ in SOURCE_COLUMNS:
        union_parts.append(f"SELECT DISTINCT TRIM({old_col}) AS name FROM {table} WHERE {old_col} IS NOT NULL AND TRIM({old_col}) != ''")
    if union_parts:
        union_sql = " UNION ".join(union_parts)
        op.execute(f"""
            INSERT INTO unit (name)
            SELECT DISTINCT name FROM ({union_sql}) AS all_units
            WHERE name NOT IN (SELECT name FROM unit)
        """)

    # 3. For each table, add FK column, populate it, drop old column
    bind = op.get_bind()
    for table, old_col, new_col in SOURCE_COLUMNS:
        # Check if old column exists
        inspector = sa.inspect(bind)
        cols = {c["name"] for c in inspector.get_columns(table)}
        if old_col not in cols:
            continue

        # Add new FK column
        with op.batch_alter_table(table) as batch_op:
            batch_op.add_column(sa.Column(new_col, sa.Integer(), sa.ForeignKey("unit.id"), nullable=True))

        # Populate it by matching string values
        op.execute(f"""
            UPDATE {table}
            SET {new_col} = (SELECT id FROM unit WHERE unit.name = TRIM({table}.{old_col}))
            WHERE {old_col} IS NOT NULL AND TRIM({old_col}) != ''
        """)

        # Drop old column
        with op.batch_alter_table(table) as batch_op:
            batch_op.drop_column(old_col)


def downgrade():
    # Reverse: add back string columns, populate from FK, drop FK columns, drop unit table
    for table, old_col, new_col in reversed(SOURCE_COLUMNS):
        inspector = sa.inspect(op.get_bind())
        cols = {c["name"] for c in inspector.get_columns(table)}
        if old_col in cols:
            continue
        with op.batch_alter_table(table) as batch_op:
            batch_op.add_column(sa.Column(old_col, sa.String(50), nullable=True))
        op.execute(f"""
            UPDATE {table}
            SET {old_col} = (SELECT name FROM unit WHERE unit.id = {table}.{new_col})
            WHERE {new_col} IS NOT NULL
        """)
        with op.batch_alter_table(table) as batch_op:
            batch_op.drop_column(new_col)
    op.drop_table("unit")
```

- [ ] **Step 4: Run migration**

```bash
cd /home/jayanth/workspace/One/OneFlow/backend && source venv-linux/bin/activate && alembic upgrade head
```

Verify: `alembic current` should show 0003. Test a query to confirm the unit table has data.

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/unit.py backend/app/routers/units.py backend/alembic/versions/0003_unit_table_and_migration.py backend/app/main.py
git commit -m "feat: add Unit model, router, and migration for FK-based units"
```

---

### Task 2: Update all 14 backend models — change unit fields to FK

**Files:** Modify all 14 model files that have unit string fields.

For each model, the pattern is the same:
```
Old: unit: str | Optional[str]
New: unit_id: Optional[int] = Field(default=None, foreign_key="unit.id")
```

If the model previously required `unit: str`, change it to optional (since it can now be null before the user picks one).

The 14 files to modify:
1. `backend/app/models/inventory.py` — `unit` → `unit_id`, `weight_unit` → `weight_unit_id`
2. `backend/app/models/bom_item.py` — `material_unit` → `material_unit_id`
3. `backend/app/models/grn_item.py` — `unit` → `unit_id`
4. `backend/app/models/dispatch_item.py` — `unit` → `unit_id`
5. `backend/app/models/dispatch.py` — `unit` → `unit_id`
6. `backend/app/models/gate_pass.py` — `unit` → `unit_id`
7. `backend/app/models/gate_pass_item.py` — `unit` → `unit_id` (check if this file exists; if so, update)
8. `backend/app/models/purchase_order.py` — `unit` → `unit_id`
9. `backend/app/models/receipt_item.py` — `unit` → `unit_id`
10. `backend/app/models/supplier_material.py` — `unit` → `unit_id`
11. `backend/app/models/supplier_job.py` — `unit` → `unit_id`
12. `backend/app/models/spare_item.py` — `unit` → `unit_id`
13. `backend/app/models/production_process.py` — `material_unit` → `material_unit_id`

Read each file first, make the change, then move to the next.

Also add `from app.models.unit import Unit` implicitly by ensuring the unit module is imported. Check if there's a `backend/app/models/__init__.py` that imports all models.

- [ ] **Step 1: Update each model file**

For each file, read it, change the field definition. Example for `inventory.py`:

```python
# Before
unit: str
weight_unit: Optional[str] = None

# After
unit_id: Optional[int] = Field(default=None, foreign_key="unit.id")
weight_unit_id: Optional[int] = Field(default=None, foreign_key="unit.id")
```

For `spare_item.py` which had `unit: str = "pcs"`:
```python
# After
unit_id: Optional[int] = Field(default=None, foreign_key="unit.id")
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/models/inventory.py backend/app/models/bom_item.py backend/app/models/grn_item.py backend/app/models/dispatch_item.py backend/app/models/dispatch.py backend/app/models/gate_pass.py backend/app/models/gate_pass_item.py backend/app/models/purchase_order.py backend/app/models/receipt_item.py backend/app/models/supplier_material.py backend/app/models/supplier_job.py backend/app/models/spare_item.py backend/app/models/production_process.py
git commit -m "feat: migrate all unit fields to FK references in models"
```

---

### Task 3: Update all backend routers — accept unit_id, resolve unit_name

**Files:** All routers that accept or return unit values. Each needs:
- Create/update schemas: replace `unit: str` with `unit_id: int | None`
- Response: add `unit_name: str | None` resolved from Unit table
- Batch name resolution on list endpoints

The routers to modify:
1. `backend/app/routers/inventory.py` — `unit_id`, `weight_unit_id`
2. `backend/app/routers/bom.py` — `material_unit_id`
3. `backend/app/routers/grn.py` — `unit_id`
4. `backend/app/routers/dispatch.py` — `unit_id` (both dispatch header and dispatch items)
5. `backend/app/routers/gate_passes.py` — `unit_id` (both gate pass header and gate pass items)
6. `backend/app/routers/purchase_orders.py` — `unit_id`
7. `backend/app/routers/receipts.py` — `unit_id`
8. `backend/app/routers/suppliers.py` — `unit_id` (supplier materials and jobs)
9. `backend/app/routers/spares.py` — `unit_id`
10. `backend/app/routers/production.py` — `material_unit_id`

**Pattern for create schemas** (Pydantic models defined inline or as schemas):

For create/update functions:
```python
# Old: body.unit or body.get("unit")
# New: body.unit_id or body.get("unit_id")
```

For response dicts, resolve unit name:
```python
# After building the item dict, add resolved unit name
unit = session.get(Unit, item.unit_id) if item.unit_id else None
result["unit_name"] = unit.name if unit else None
result["unit_id"] = item.unit_id
```

For batch list endpoints, bulk-resolve all unit IDs:
```python
# Collect all unique unit_ids from all items
all_unit_ids = {item.unit_id for item in items if item.unit_id}
# Bulk fetch
units = {u.id: u.name for u in session.exec(select(Unit).where(Unit.id.in_(all_unit_ids))).all()} if all_unit_ids else {}
# Then for each item: item_dict["unit_name"] = units.get(item.unit_id)
```

Apply this pattern across all 10 routers. Read each file, make the changes, commit when done.

- [ ] **Step 1: Update inventory.py**

Add `from app.models.unit import Unit` import. Update:
- `InventoryItemCreate` schema: `unit_id` instead of `unit`
- `InventoryItemUpdate` schema: `unit_id` instead of `unit`
- `InventoryItemResponse` schema: `unit_id: Optional[int]`, `unit_name: Optional[str]`
- `InventoryItemDetailResponse`: same fields
- `list_items` dict builder: bulk-resolve unit names
- `get_item_detail` dict builder: resolve unit name
- `create_item`: pass `unit_id=body.unit_id`
- `update_item`: handle `body.unit_id`

Same pattern for `weight_unit_id` / `weight_unit_name`.

- [ ] **Step 2: Update bom.py**

Update the `BomItemCreate`, `BomItemUpdate`, `BomItemResponse` schemas: `material_unit_id` instead of `material_unit`. Add `material_unit_name` to response.

- [ ] **Step 3: Update remaining routers (grn, dispatch, gate_passes, purchase_orders, receipts, suppliers, spares, production)**

Same pattern for each. For routers that create items with nested items (dispatch, gate_passes), also update the nested item processing.

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/inventory.py backend/app/routers/bom.py backend/app/routers/grn.py backend/app/routers/dispatch.py backend/app/routers/gate_passes.py backend/app/routers/purchase_orders.py backend/app/routers/receipts.py backend/app/routers/suppliers.py backend/app/routers/spares.py backend/app/routers/production.py
git commit -m "feat: update all routers to use unit_id FK and resolve unit_name"
```

---

### Task 4: Settings page — add tabs + Units CRUD

**Files:**
- Modify: `frontend/app/dashboard/admin/settings/page.tsx`

- [ ] **Step 1: Read the current settings page**

Read `frontend/app/dashboard/admin/settings/page.tsx` to understand the existing structure.

- [ ] **Step 2: Add Tabs component**

Use shadcn Tabs (`@/components/ui/tabs`). Wrap the existing content:

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// In the JSX:
<Tabs defaultValue="company" value={activeTab} onValueChange={setActiveTab}>
  <TabsList>
    <TabsTrigger value="company">Company Information</TabsTrigger>
    <TabsTrigger value="units">Units</TabsTrigger>
  </TabsList>
  <TabsContent value="company">
    {/* Existing company info form */}
  </TabsContent>
  <TabsContent value="units">
    {/* New units management */}
  </TabsContent>
</Tabs>
```

- [ ] **Step 3: Build the Units tab content**

State:
```tsx
const [units, setUnits] = useState<Unit[]>([]);
const [newUnitName, setNewUnitName] = useState("");
const [editingId, setEditingId] = useState<number | null>(null);
const [editName, setEditName] = useState("");
const [usageCounts, setUsageCounts] = useState<Record<number, {total: number; by_table: Record<string, number>}>>({});
const [usageLoading, setUsageLoading] = useState<Record<number, boolean>>({});
```

Fetch on mount:
```tsx
useEffect(() => {
  apiFetchJson<Unit[]>("/api/v1/units?include_inactive=true").then(setUnits);
}, []);
```

Add unit:
```tsx
async function handleAddUnit() {
  if (!newUnitName.trim()) return;
  await apiFetchJson("/api/v1/units", {
    method: "POST",
    body: JSON.stringify({ name: newUnitName.trim() }),
  });
  setNewUnitName("");
  // Refresh list
  setUnits(await apiFetchJson("/api/v1/units?include_inactive=true"));
}
```

Rename unit:
```tsx
async function handleRename(id: number) {
  await apiFetchJson(`/api/v1/units/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name: editName.trim() }),
  });
  setEditingId(null);
  setUnits(await apiFetchJson("/api/v1/units?include_inactive=true"));
}
```

Delete unit with usage check:
```tsx
async function handleDelete(id: number) {
  const usage = await apiFetchJson<{total: number}>(`/api/v1/units/${id}/usage-count`);
  if (usage.total > 0) {
    // Show error dialog — cannot delete
    return;
  }
  await apiFetchJson(`/api/v1/units/${id}`, { method: "DELETE" });
  setUnits(await apiFetchJson("/api/v1/units?include_inactive=true"));
}
```

Usage loading on hover/expand:
```tsx
async function loadUsage(id: number) {
  setUsageLoading(prev => ({ ...prev, [id]: true }));
  const usage = await apiFetchJson(`/api/v1/units/${id}/usage-count`);
  setUsageCounts(prev => ({ ...prev, [id]: usage }));
  setUsageLoading(prev => ({ ...prev, [id]: false }));
}
```

UI layout:
```tsx
<div className="space-y-4">
  {/* Add unit row */}
  <div className="flex gap-2">
    <Input value={newUnitName} onChange={e => setNewUnitName(e.target.value)}
      placeholder="New unit name (e.g. kg)" />
    <Button onClick={handleAddUnit}>Add</Button>
  </div>

  {/* Units table */}
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Name</TableHead>
        <TableHead>Usage</TableHead>
        <TableHead>Created</TableHead>
        <TableHead>Actions</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {units.map(u => (
        <TableRow key={u.id}>
          <TableCell>
            {editingId === u.id ? (
              <div className="flex gap-2">
                <Input value={editName} onChange={e => setEditName(e.target.value)} className="w-32" />
                <Button size="sm" onClick={() => handleRename(u.id)}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
              </div>
            ) : (
              <span>{u.name} {!u.is_active && <Badge variant="outline">inactive</Badge>}</span>
            )}
          </TableCell>
          <TableCell>
            <Button variant="ghost" size="sm" onClick={() => loadUsage(u.id)}>
              {usageLoading[u.id] ? <Loader2 className="animate-spin size-3" /> : "Check usage"}
            </Button>
            {usageCounts[u.id] && (
              <span className="text-xs text-muted-foreground ml-1">
                {usageCounts[u.id].total > 0
                  ? `In use by ${usageCounts[u.id].total} items`
                  : "Not in use"}
              </span>
            )}
          </TableCell>
          <TableCell className="text-xs text-muted-foreground">
            {new Date(u.created_at).toLocaleDateString()}
          </TableCell>
          <TableCell>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={() => { setEditingId(u.id); setEditName(u.name); }}
                disabled={!u.is_active}><Pencil className="size-4" /></Button>
              <Button variant="ghost" size="icon" onClick={async () => {
                const usage = await apiFetchJson<{total: number; by_table: Record<string, number>}>(`/api/v1/units/${u.id}/usage-count`);
                if (usage.total > 0) {
                  setDeleteError(`Cannot delete "${u.name}" — in use by ${usage.total} items.`);
                  return;
                }
                if (confirm(`Delete unit "${u.name}"?`)) {
                  await apiFetchJson(`/api/v1/units/${u.id}`, { method: "DELETE" });
                  setUnits(await apiFetchJson("/api/v1/units?include_inactive=true"));
                }
              }}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/dashboard/admin/settings/page.tsx
git commit -m "feat: add Units tab to settings page with CRUD"
```

---

### Task 5: Replace hardcoded units in inventory forms (new + edit + spares)

**Files:**
- Modify: `frontend/app/dashboard/inventory/new/page.tsx`
- Modify: `frontend/app/dashboard/inventory/[id]/edit/page.tsx`
- Modify: `frontend/app/dashboard/inventory/spares/page.tsx`

**Pattern for each file:**

1. Remove `STD_UNITS` and `WEIGHT_UNITS` constant arrays
2. Add state: `const [units, setUnits] = useState<{id: number, name: string}[]>([]);`
3. Add fetch on mount: `apiFetchJson("/api/v1/units").then(setUnits).catch(() => {});`
4. Replace `<select>` / `<Select>` dropdowns that iterate over the hardcoded arrays with dropdowns that iterate over `units`
5. For the unit value: store `unit_id` (number) instead of `unit` (string)
6. For weight_unit: store `weight_unit_id` (number) instead of `weight_unit` (string)
7. Remove the "Other…" custom unit option (users add units in settings now)
8. If units.length === 0: show a warning banner and disable the form

- [ ] **Step 1: Update inventory/new/page.tsx**

Read the file. The unit field uses a custom `<select>` with `STD_UNITS` and a "Other…" toggle. Replace with:

```tsx
{/* Unit of Measure */}
<div className="space-y-1.5">
  <Label>Unit of Measure</Label>
  <Select value={form.unit_id ? String(form.unit_id) : ""}
    onValueChange={(v) => setForm(f => ({...f, unit_id: v ? Number(v) : null}))}>
    <SelectTrigger><SelectValue placeholder={units.length === 0 ? "No units configured" : "Select unit"} /></SelectTrigger>
    <SelectContent>
      {units.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
      {units.length === 0 && <SelectItem value="_none" disabled>Add units in Settings first</SelectItem>}
    </SelectContent>
  </Select>
</div>
```

Same pattern for weight_unit_id. Both dropdowns use the same `units` list.

Add the validation banner:
```tsx
{units.length === 0 && (
  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800">
    <p className="font-medium">No units configured</p>
    <p className="text-sm mt-1">Please add units in <Link href="/dashboard/admin/settings?tab=units" className="underline">Settings → Units</Link> before creating inventory items.</p>
  </div>
)}
```

- [ ] **Step 2: Update inventory/[id]/edit/page.tsx**

Same pattern. On load, the edit form receives the current item data with `unit_id`. The dropdown initial value should match the loaded `unit_id`.

- [ ] **Step 3: Update inventory/spares/page.tsx**

Read the file. Remove `STD_UNITS` constant. Fetch units from API on mount. Replace the unit dropdown.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/dashboard/inventory/new/page.tsx frontend/app/dashboard/inventory/\[id\]/edit/page.tsx frontend/app/dashboard/inventory/spares/page.tsx
git commit -m "feat: replace hardcoded units with dynamic Unit list in inventory forms"
```

---

### Task 6: Replace hardcoded units in BOM forms

**Files:**
- Modify: `frontend/app/dashboard/admin/bom/new/page.tsx`
- Modify: `frontend/app/dashboard/admin/bom/[id]/edit/page.tsx`

- [ ] **Step 1: Update BOM new page**

Read `frontend/app/dashboard/admin/bom/new/page.tsx`. The material unit field uses hardcoded `<option>` elements. Replace with:

```tsx
<select value={rm.material_unit_id ?? ""} onChange={e => updateRow(i, { material_unit_id: e.target.value ? Number(e.target.value) : null })}>
  <option value="">Select</option>
  {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
</select>
```

Also add fetch on mount: `apiFetchJson("/api/v1/units").then(setUnits).catch(() => {});`

- [ ] **Step 2: Update BOM edit page**

Same pattern. Read the file, replace hardcoded options with dynamic units.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/dashboard/admin/bom/new/page.tsx frontend/app/dashboard/admin/bom/\[id\]/edit/page.tsx
git commit -m "feat: replace hardcoded units with dynamic Unit list in BOM forms"
```

---

### Task 7: Run verification

- [ ] **Step 1: Run backend tests**

```bash
cd /home/jayanth/workspace/One/OneFlow/backend && source venv-linux/bin/activate && python -m pytest -x -v 2>&1 | tail -40
```

If tests fail, fix issues.

- [ ] **Step 2: Run frontend build**

```bash
cd /home/jayanth/workspace/One/OneFlow/frontend && npm run build 2>&1 | tail -30
```

If errors, fix them.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A && git commit -m "fix: resolve test and typecheck issues"
```
