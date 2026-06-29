# GRN & Work-Time Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 3 reported bugs (GRN item click race, GRN PR-link does nothing, Work Time Report search broken) by extracting a shared `<SearchCombobox>` + `useDebouncedSearch` hook, replacing 4 hand-rolled comboboxes, and adding a new backend endpoint for PR line-item prefill.

**Architecture:** Backend-first TDD for the new endpoint + workers search test. Then build the two frontend primitives (`useDebouncedSearch`, `<SearchCombobox>`) with plain + list variants. Then migrate the 4 call sites (3 in `grn/page.tsx`, 1 in `time-report/page.tsx`).

**Tech Stack:** Python 3 + FastAPI + SQLModel + pytest (backend); Next.js 16 + React 19 + TypeScript + shadcn/ui (frontend, no new test harness — manual verification only).

---

## File Map

**New files:**
- `backend/app/core/linkable_prs.py` — pure helper for the PR-items endpoint (kept separate from `grn.py` to keep `grn.py` from growing)
- `backend/tests/test_grn_bugfixes.py` — pytest tests for new endpoint + workers search
- `frontend/hooks/use-debounced-search.ts` — generic debounced-search hook
- `frontend/components/ui/search-combobox.tsx` — generic combobox (plain + list variants)

**Modified files:**
- `backend/app/routers/grn.py` — add `GET /api/v1/grn/linkable-prs/{pr_id}/items`
- `frontend/app/dashboard/grn/page.tsx` — replace `InvCombobox`, `PrCombobox`, `UserCombobox`; add `prefillItemsFromPr`
- `frontend/app/dashboard/production/time-report/page.tsx` — replace base-ui `Combobox` worker block

**Unchanged:** DB schema (no migration), all other modules.

---

## Task 1: Backend — PR items endpoint (TDD)

**Files:**
- Create: `backend/tests/test_grn_bugfixes.py`
- Create: `backend/app/core/linkable_prs.py`
- Modify: `backend/app/routers/grn.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_grn_bugfixes.py`:

```python
"""Tests for GRN bug fixes (2026-06-25): PR line-item prefill + workers search filter."""
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.security import hash_password
from app.models.purchase_request import PurchaseRequest
from app.models.purchase_request_item import PurchaseRequestItem
from app.models.user import User


def _create_user(session: Session, username: str, is_active: bool = True) -> User:
    user = User(
        username=username,
        password_hash=hash_password("test123"),
        role="staff",
        is_active=is_active,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _create_pr_with_items(
    session: Session,
    status: str = "approved",
    is_active: bool = True,
    item_count: int = 2,
) -> PurchaseRequest:
    pr = PurchaseRequest(
        sn_no=f"PR-{session.exec(__import__('sqlmodel').select(PurchaseRequest)).all().__len__() + 1:04d}",
        status=status,
        is_active=is_active,
        item_name="Header Item",
        quantity=0,
    )
    session.add(pr)
    session.commit()
    session.refresh(pr)
    for i in range(item_count):
        item = PurchaseRequestItem(
            purchase_request_id=pr.id,  # type: ignore[arg-type]
            sn_no=f"{pr.sn_no}-{i+1}",
            item_name=f"Item {i+1}",
            item_code=f"ITM-{i+1:03d}",
            quantity=10 + i,
            status="approved",
        )
        session.add(item)
    session.commit()
    return pr


def test_linkable_pr_items_returns_line_items(client: TestClient, session: Session) -> None:
    """GET /api/v1/grn/linkable-prs/{id}/items returns all line items for a linkable PR."""
    pr = _create_pr_with_items(session, status="approved", item_count=2)
    resp = client.get(f"/api/v1/grn/linkable-prs/{pr.id}/items")
    assert resp.status_code == 200, resp.text
    items = resp.json()
    assert len(items) == 2
    assert items[0]["sn_no"] == f"{pr.sn_no}-1"
    assert items[1]["sn_no"] == f"{pr.sn_no}-2"
    assert items[0]["quantity"] == 10
    assert items[1]["quantity"] == 11


def test_linkable_pr_items_404_for_inactive_pr(client: TestClient, session: Session) -> None:
    """Soft-deleted PR returns 404."""
    pr = _create_pr_with_items(session, status="approved", is_active=False)
    resp = client.get(f"/api/v1/grn/linkable-prs/{pr.id}/items")
    assert resp.status_code == 404


def test_linkable_pr_items_404_for_wrong_status(client: TestClient, session: Session) -> None:
    """PR in 'pending' status is not linkable → 404."""
    pr = _create_pr_with_items(session, status="pending")
    resp = client.get(f"/api/v1/grn/linkable-prs/{pr.id}/items")
    assert resp.status_code == 404


def test_linkable_pr_items_404_for_missing_pr(client: TestClient) -> None:
    """Non-existent PR id returns 404."""
    resp = client.get("/api/v1/grn/linkable-prs/999999/items")
    assert resp.status_code == 404


def test_linkable_pr_items_empty_for_pr_without_items(client: TestClient, session: Session) -> None:
    """PR with 0 items returns 200 + []."""
    pr = _create_pr_with_items(session, status="approved", item_count=0)
    resp = client.get(f"/api/v1/grn/linkable-prs/{pr.id}/items")
    assert resp.status_code == 200
    assert resp.json() == []


def test_workers_search_filters_by_username(client: TestClient, session: Session) -> None:
    """GET /api/v1/production/workers?search=al returns only matching users."""
    _create_user(session, "alice")
    _create_user(session, "bob")
    _create_user(session, "carol")
    resp = client.get("/api/v1/production/workers?search=al")
    assert resp.status_code == 200
    users = resp.json()
    usernames = [u["username"] for u in users]
    assert "alice" in usernames
    assert "bob" not in usernames
    assert "carol" not in usernames


def test_workers_search_includes_only_active(client: TestClient, session: Session) -> None:
    """Inactive users are excluded from worker search."""
    _create_user(session, "active_user")
    _create_user(session, "inactive_user", is_active=False)
    resp = client.get("/api/v1/production/workers?search=user")
    assert resp.status_code == 200
    usernames = [u["username"] for u in resp.json()]
    assert "active_user" in usernames
    assert "inactive_user" not in usernames
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && source venv-linux/bin/activate && pytest tests/test_grn_bugfixes.py -v
```

Expected: 7 failures (4 for `/api/v1/grn/linkable-prs/{id}/items`, 3 for `/api/v1/production/workers?search=` because the endpoint exists but a fresh in-memory DB has no users matching the search — actually 2 of these will FAIL with non-200 status, 1 may pass with empty list; the workers tests may be partially passing already. Run and see.)

- [ ] **Step 3: Create the helper module**

Create `backend/app/core/linkable_prs.py`:

```python
"""Helpers for 'linkable' Purchase Requests — used by GRN creation."""
from typing import Optional

from fastapi import HTTPException
from sqlmodel import Session, or_, select

from app.models.purchase_request import PurchaseRequest
from app.models.purchase_request_item import PurchaseRequestItem
from app.models.inventory import InventoryItem
from app.routers.grn import LinkablePROut  # reuses the response schema


def get_linkable_pr_or_404(session: Session, pr_id: int) -> PurchaseRequest:
    """Load a PR, raising 404 if it doesn't exist, is soft-deleted, or isn't linkable."""
    pr = session.get(PurchaseRequest, pr_id)
    if not pr or not pr.is_active:  # type: ignore[union-attr]
        raise HTTPException(status_code=404, detail="Purchase request not found")
    if pr.status not in ("approved", "in_progress"):
        raise HTTPException(status_code=404, detail="Purchase request not linkable")
    return pr


def get_linkable_pr_items(session: Session, pr_id: int) -> list[LinkablePROut]:
    """Return line items for a linkable PR, shaped like `LinkablePROut` so the
    existing PrCombobox can consume them without a new schema.

    Each line item is returned as if it were a single-row PR — `sn_no` is the
    line item's own sn_no; `quantity` is the line item's quantity; `inventory_item_id`,
    `item_name`, `item_code`, `item_type`, `unit` are the line item's fields.
    """
    pr = get_linkable_pr_or_404(session, pr_id)
    items = list(
        session.exec(
            select(PurchaseRequestItem).where(
                PurchaseRequestItem.purchase_request_id == pr.id  # type: ignore[arg-type]
            )
        ).all()
    )
    result: list[LinkablePROut] = []
    for it in items:
        unit: Optional[str] = None
        if it.inventory_item_id:
            inv = session.get(InventoryItem, it.inventory_item_id)
            if inv:
                unit = inv.unit
        result.append(
            LinkablePROut(
                id=it.id,  # type: ignore[arg-type]
                sn_no=it.sn_no,
                item_name=it.item_name,
                item_code=it.item_code,
                item_type=it.item_type,
                unit=unit,
                inventory_item_id=it.inventory_item_id,
                quantity=it.quantity,
                status=it.status,
            )
        )
    return result
```

- [ ] **Step 4: Verify `LinkablePROut` import path is correct**

```bash
cd backend && source venv-linux/bin/activate && python -c "from app.routers.grn import LinkablePROut; print(LinkablePROut.model_fields.keys())"
```

Expected: prints field names including `id`, `sn_no`, `item_name`, `item_code`, `item_type`, `unit`, `inventory_item_id`, `quantity`, `status`.

If the schema is defined elsewhere (e.g. in `app/schemas/`), update the import in `linkable_prs.py` to match the actual location. Confirm by reading `backend/app/routers/grn.py` around line 60 (where `LinkablePROut` is defined per the spec context).

- [ ] **Step 5: Add the endpoint to `backend/app/routers/grn.py`**

Open `backend/app/routers/grn.py`. Find the existing `/linkable-prs` endpoint (around line 209 per the spec). Add this directly after it (and add `from app.core.linkable_prs import get_linkable_pr_items` near the top of the file if not already present):

```python
@router.get("/linkable-prs/{pr_id}/items", response_model=list[LinkablePROut])
def get_linkable_pr_items_endpoint(
    pr_id: int,
    session: SessionDep,
    _: CurrentUser,
) -> list[LinkablePROut]:
    """Return line items for a linkable PR. 404 if PR is missing, soft-deleted, or not linkable."""
    from app.core.linkable_prs import get_linkable_pr_items as _get
    return _get(session, pr_id)
```

- [ ] **Step 6: Run the PR-items tests**

```bash
cd backend && source venv-linux/bin/activate && pytest tests/test_grn_bugfixes.py::test_linkable_pr_items_returns_line_items tests/test_grn_bugfixes.py::test_linkable_pr_items_404_for_inactive_pr tests/test_grn_bugfixes.py::test_linkable_pr_items_404_for_wrong_status tests/test_grn_bugfixes.py::test_linkable_pr_items_404_for_missing_pr tests/test_grn_bugfixes.py::test_linkable_pr_items_empty_for_pr_without_items -v
```

Expected: 5 PASS.

- [ ] **Step 7: Run the workers tests**

```bash
cd backend && source venv-linux/bin/activate && pytest tests/test_grn_bugfixes.py::test_workers_search_filters_by_username tests/test_grn_bugfixes.py::test_workers_search_includes_only_active -v
```

Expected: 2 PASS (the `/api/v1/production/workers?search=` endpoint already exists; this codifies the expected behavior so it doesn't regress).

- [ ] **Step 8: Run the full new test file**

```bash
cd backend && source venv-linux/bin/activate && pytest tests/test_grn_bugfixes.py -v
```

Expected: 7 PASS.

- [ ] **Step 9: Commit**

```bash
cd /home/jayanth/workspace/One/OneFlow && git add backend/app/core/linkable_prs.py backend/app/routers/grn.py backend/tests/test_grn_bugfixes.py && git commit -m "feat(grn): add /linkable-prs/{id}/items endpoint + workers search tests"
```

---

## Task 2: Frontend — `useDebouncedSearch` hook

**Files:**
- Create: `frontend/hooks/use-debounced-search.ts`

- [ ] **Step 1: Create the hook**

Create `frontend/hooks/use-debounced-search.ts`:

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type UseDebouncedSearchResult<T> = {
  query: string;
  setQuery: (q: string) => void;
  results: T[];
  busy: boolean;
  open: boolean;
  setOpen: (b: boolean) => void;
  reset: () => void;
};

export function useDebouncedSearch<T>(
  fetcher: (q: string) => Promise<T[]>,
  opts: { debounceMs?: number } = {},
): UseDebouncedSearchResult<T> {
  const { debounceMs = 300 } = opts;
  const [query, setQueryState] = useState("");
  const [results, setResults] = useState<T[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const runFetch = useCallback((q: string) => {
    setBusy(true);
    fetcherRef
      .current(q)
      .then((r) => {
        setResults(r);
      })
      .catch(() => {
        setResults([]);
      })
      .finally(() => setBusy(false));
  }, []);

  const setQuery = useCallback(
    (q: string) => {
      setQueryState(q);
      if (timer.current) clearTimeout(timer.current);
      const delay = debounceMs > 0 && q.trim() ? debounceMs : 0;
      timer.current = setTimeout(() => runFetch(q), delay);
    },
    [debounceMs, runFetch],
  );

  const reset = useCallback(() => {
    setQueryState("");
    setResults([]);
    setOpen(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return { query, setQuery, results, busy, open, setOpen, reset };
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd /home/jayanth/workspace/One/OneFlow && git add frontend/hooks/use-debounced-search.ts && git commit -m "feat(ui): add useDebouncedSearch hook"
```

---

## Task 3: Frontend — `<SearchCombobox>` component

**Files:**
- Create: `frontend/components/ui/search-combobox.tsx`

- [ ] **Step 1: Create the component (plain + list variants)**

Create `frontend/components/ui/search-combobox.tsx`:

```tsx
"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";

export type SearchComboboxVariant = "plain" | "list";

type CommonProps<T> = {
  value: string;
  onSelect: (item: T) => void;
  fetcher: (q: string) => Promise<T[]>;
  getItemKey: (item: T) => string | number;
  getItemLabel: (item: T) => string;
  placeholder?: string;
  disabled?: boolean;
  emptyText?: string;
  debounceMs?: number;
  className?: string;
};

type PlainProps<T> = CommonProps<T> & {
  variant?: "plain";
  renderItem: (item: T) => React.ReactNode;
};

type ListProps<T> = CommonProps<T> & {
  variant: "list";
  itemIdOf: (item: T) => string | number;
  renderItem: (item: T) => React.ReactNode;
};

export type SearchComboboxProps<T> = PlainProps<T> | ListProps<T>;

// Bug-1 fix: pointerdown on document closes the dropdown UNLESS the click was
// inside the combobox root. The old `setTimeout(setOpen(false), 150)` race
// against onMouseDown is gone.
function useOutsidePointerDown(
  ref: React.RefObject<HTMLElement | null>,
  onOutside: () => void,
) {
  React.useEffect(() => {
    function handler(e: PointerEvent) {
      const target = e.target as Node | null;
      if (target && ref.current && !ref.current.contains(target)) {
        onOutside();
      }
    }
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [ref, onOutside]);
}

export function SearchCombobox<T>(props: SearchComboboxProps<T>) {
  const { value, onSelect, fetcher, getItemKey, placeholder, disabled, emptyText = "No results", debounceMs, className } = props;
  const { query, setQuery, results, busy, open, setOpen } = useDebouncedSearch<T>(fetcher, { debounceMs });
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  useOutsidePointerDown(rootRef, () => setOpen(false));

  const handleSelect = (item: T) => {
    onSelect(item);
    setQuery(getItemLabel(item));
    setOpen(false);
  };

  if (props.variant === "list") {
    return (
      <div ref={rootRef} className={cn("relative", className)}>
        <Combobox
          value={value}
          onValueChange={(v: unknown) => {
            const id = v as string;
            const found = results.find((r) => String(props.itemIdOf(r)) === id);
            if (found) handleSelect(found);
          }}
        >
          <ComboboxInput
            placeholder={placeholder}
            disabled={disabled}
            value={query}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              setOpen(true);
              if (!query) setQuery("");
            }}
            className="w-full"
          />
          <ComboboxContent>
            <ComboboxList>
              {busy && results.length === 0 && (
                <div className="py-2 px-3 text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="size-3 animate-spin" /> Searching…
                </div>
              )}
              {!busy && results.length === 0 && open && (
                <div className="py-2 px-3 text-xs text-muted-foreground">{emptyText}</div>
              )}
              {results.map((item) => (
                <ComboboxItem key={String(getItemKey(item))} value={String(props.itemIdOf(item))}>
                  {props.renderItem(item)}
                </ComboboxItem>
              ))}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>
    );
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <input
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full px-3 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          if (!query) setQuery("");
        }}
      />
      {open && (results.length > 0 || busy) && (
        <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-md shadow-md overflow-hidden">
          {busy && results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="size-3 animate-spin" /> Searching…
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">{emptyText}</div>
          ) : (
            results.map((item) => (
              <button
                key={String(getItemKey(item))}
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(item);
                }}
              >
                {props.renderItem(item)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd /home/jayanth/workspace/One/OneFlow && git add frontend/components/ui/search-combobox.tsx && git commit -m "feat(ui): add SearchCombobox with plain + list variants"
```

---

## Task 4: Migrate `InvCombobox` in `grn/page.tsx`

**Files:**
- Modify: `frontend/app/dashboard/grn/page.tsx:168-238` (delete the local `InvCombobox` function definition)
- Modify: `frontend/app/dashboard/grn/page.tsx:858` (replace the call site)

- [ ] **Step 1: Find the local `InvCombobox` definition**

In `frontend/app/dashboard/grn/page.tsx`, locate the `function InvCombobox({` block (starts at line 168 per the spec). It runs through the closing `}` near line 238. Delete the entire function definition.

- [ ] **Step 2: Add the import for `SearchCombobox`**

In `frontend/app/dashboard/grn/page.tsx`, find the import block near the top of the file. Add this import alongside the other `@/components/ui/...` imports:

```ts
import { SearchCombobox } from "@/components/ui/search-combobox";
```

(If imports are alphabetized, place it after `Input` / `Label` / `Skeleton` alphabetically — exact placement doesn't matter as long as the import works.)

- [ ] **Step 3: Define a fetcher outside the component (above `function InvCombobox` was)**

Just above the `function GrnPage()` declaration, add:

```ts
async function fetchInventoryForGrn(q: string): Promise<InvItem[]> {
  const tf = ""; // category is set per-row via the parent's invTypeFilter; this fallback is unused
  void tf;
  const qs = q.trim() ? `&search=${encodeURIComponent(q)}` : "";
  const d = await apiFetchJson<PaginatedInv>(
    `/api/v1/inventory?page_size=12&include_inactive=false${qs}`,
  );
  return d.items.map((i) => ({ id: i.id, code: i.code, name: i.name, item_type: i.item_type, unit: i.unit }));
}
```

- [ ] **Step 4: Replace the call site at line 858**

Find this code:

```tsx
<InvCombobox value={row.item_name} disabled={saving} itemTypeFilter={row.invTypeFilter}
  onSelect={(item) => updateRow(row._key, {
    inventory_item_id: item.id, item_name: item.name,
    item_code: item.code, item_type: item.item_type, unit: item.unit,
  })} />
```

Replace it with:

```tsx
<SearchCombobox<InvItem>
  variant="plain"
  value={row.item_name}
  disabled={saving}
  placeholder="Search inventory item…"
  fetcher={async (q) => {
    const tf = row.invTypeFilter ? `&item_type=${encodeURIComponent(row.invTypeFilter)}` : "";
    const qs = q.trim() ? `&search=${encodeURIComponent(q)}` : "";
    const d = await apiFetchJson<PaginatedInv>(
      `/api/v1/inventory?page_size=12&include_inactive=false${tf}${qs}`,
    );
    return d.items.map((i) => ({ id: i.id, code: i.code, name: i.name, item_type: i.item_type, unit: i.unit }));
  }}
  getItemKey={(i) => i.id}
  getItemLabel={(i) => i.name}
  onSelect={(item) => updateRow(row._key, {
    inventory_item_id: item.id, item_name: item.name,
    item_code: item.code, item_type: item.item_type, unit: item.unit,
  })}
  renderItem={(i) => (
    <>
      <span className="font-medium">{i.name}</span>
      <span className="text-xs text-muted-foreground ml-2">{i.code}</span>
      <span className="text-xs text-muted-foreground ml-1">· {i.unit}</span>
    </>
  )}
/>
```

- [ ] **Step 5: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
cd /home/jayanth/workspace/One/OneFlow && git add frontend/app/dashboard/grn/page.tsx && git commit -m "refactor(grn): migrate InvCombobox to SearchCombobox"
```

---

## Task 5: Migrate `PrCombobox` + add `prefillItemsFromPr` (bug 2 fix)

**Files:**
- Modify: `frontend/app/dashboard/grn/page.tsx` (delete `PrCombobox`, add import, replace call site, add `prefillItemsFromPr`, wire it into `handlePrSelect`)

- [ ] **Step 1: Delete the local `PrCombobox` function**

In `frontend/app/dashboard/grn/page.tsx`, find the `function PrCombobox({` block (starts at line 242 per the spec). Delete the entire function definition (runs through the closing `}` near line 305).

- [ ] **Step 2: Add a `toFormItem` helper near the top of the file**

Just below the `FormItemRow` interface, add:

```ts
function prItemToFormRow(pr: PRItem): FormItemRow {
  return {
    _key: Date.now() + Math.random(),
    inventory_item_id: pr.inventory_item_id,
    item_name: pr.item_name ?? "",
    item_code: pr.item_code ?? "",
    item_type: pr.item_type ?? "",
    unit: pr.unit ?? "",
    quantity_received: "",
    quantity_pr_requested: String(pr.quantity ?? ""),
    invTypeFilter: "",
  };
}
```

- [ ] **Step 3: Update `handlePrSelect` (around line 506) to call prefill**

Find the existing `handlePrSelect` function:

```ts
function handlePrSelect(pr: PRItem) {
  setLinkedPrId(pr.id);
  setLinkedPrLabel(`${pr.sn_no} · ${pr.item_name ?? ""}`);
}
```

Replace it with:

```ts
async function handlePrSelect(pr: PRItem) {
  const replacingWithQty = formItems.some(
    (r) => parseFloat(r.quantity_received) > 0,
  );
  if (replacingWithQty) {
    if (!confirm("This will replace the items already added. Continue?")) {
      return;
    }
  }
  setLinkedPrId(pr.id);
  setLinkedPrLabel(`${pr.sn_no} · ${pr.item_name ?? ""}`);
  setPrefillErr(null);
  try {
    const items = await apiFetchJson<PRItem[]>(`/api/v1/grn/linkable-prs/${pr.id}/items`);
    setFormItems(items.length > 0 ? items.map(prItemToFormRow) : [prItemToFormRow(pr)]);
  } catch (e: unknown) {
    setLinkedPrId(null);
    setLinkedPrLabel("");
    setPrefillErr(e instanceof Error ? e.message : "Could not load PR items");
  }
}
```

- [ ] **Step 4: Add `prefillErr` state**

Find where other `useState` calls are declared (around line 416-430). Add:

```ts
const [prefillErr, setPrefillErr] = useState<string | null>(null);
```

- [ ] **Step 5: Replace the PrCombobox call site (around line 771)**

Find:

```tsx
<PrCombobox value={linkedPrLabel} onSelect={handlePrSelect} disabled={saving} />
```

Replace with:

```tsx
<SearchCombobox<PRItem>
  variant="plain"
  value={linkedPrLabel}
  disabled={saving}
  placeholder="Search purchase request…"
  fetcher={async (q) => {
    const qs = q.trim() ? `?search=${encodeURIComponent(q)}` : "";
    return apiFetchJson<PRItem[]>(`/api/v1/grn/linkable-prs${qs}`);
  }}
  getItemKey={(p) => p.id}
  getItemLabel={(p) => `${p.sn_no} · ${p.item_name ?? ""}`}
  onSelect={handlePrSelect}
  renderItem={(pr) => (
    <>
      <span className="font-mono font-medium text-xs">{pr.sn_no}</span>
      <span className="text-sm ml-2">{pr.item_name ?? "—"}</span>
      <span className="text-xs text-muted-foreground ml-1.5">
        qty {pr.quantity} · {pr.status}
      </span>
    </>
  )}
/>
{prefillErr && (
  <p className="text-xs text-destructive mt-1">{prefillErr}</p>
)}
```

The `{prefillErr}` `<p>` element goes **inside the same outer `<div>`** as the `SearchCombobox` and the "Clear linked PR" button (just below the inner `mt-1` wrapper) — not inside the inner wrapper.

- [ ] **Step 6: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
cd /home/jayanth/workspace/One/OneFlow && git add frontend/app/dashboard/grn/page.tsx && git commit -m "feat(grn): migrate PrCombobox + prefill items from linked PR"
```

---

## Task 6: Migrate `UserCombobox` in `grn/page.tsx`

**Files:**
- Modify: `frontend/app/dashboard/grn/page.tsx` (delete `UserCombobox` function, replace call site)

- [ ] **Step 1: Delete the local `UserCombobox` function**

In `frontend/app/dashboard/grn/page.tsx`, find the `function UserCombobox({` block (starts at line 309 per the spec). Delete the entire function definition (runs through the closing `}`).

- [ ] **Step 2: Replace the call site (around line 799)**

Find:

```tsx
<UserCombobox value={inspectedByUsername}
  onSelect={(u) => { setInspectedByUserId(u.id); setInspectedByUsername(u.username); }}
  disabled={saving} />
```

Replace with:

```tsx
<SearchCombobox<UserItem>
  variant="plain"
  value={inspectedByUsername}
  disabled={saving}
  placeholder="Search user…"
  fetcher={async () => apiFetchJson<UserItem[]>(`/api/v1/admin/users?include_inactive=false`)}
  getItemKey={(u) => u.id}
  getItemLabel={(u) => u.username}
  onSelect={(u) => { setInspectedByUserId(u.id); setInspectedByUsername(u.username); }}
  renderItem={(u) => <span>{u.username}</span>}
/>
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
cd /home/jayanth/workspace/One/OneFlow && git add frontend/app/dashboard/grn/page.tsx && git commit -m "refactor(grn): migrate UserCombobox to SearchCombobox"
```

---

## Task 7: Migrate worker `Combobox` in `time-report/page.tsx` (bug 3 fix)

**Files:**
- Modify: `frontend/app/dashboard/production/time-report/page.tsx` (remove the base-ui `Combobox` block + `searchQuery` state, use `SearchCombobox` instead)

- [ ] **Step 1: Inspect the current worker block**

In `frontend/app/dashboard/production/time-report/page.tsx`, locate the `<Combobox` block (starts at line 523 per the spec). It contains `ComboboxInput`, `ComboboxContent`, `ComboboxList`, `ComboboxItem`, etc. Lines 421-447 contain the `searchQuery` state and `fetchWorkers` callback.

- [ ] **Step 2: Delete the local `searchQuery` state and `fetchWorkers` callback**

Find and remove:

```ts
const [searchQuery, setSearchQuery] = useState("");
const [workerOptions, setWorkerOptions] = useState<WorkerOption[]>([]);
const [fetchingWorkers, setFetchingWorkers] = useState(false);
const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

And:

```ts
const fetchWorkers = useCallback((q: string) => {
  if (debounceRef.current) clearTimeout(debounceRef.current);
  debounceRef.current = setTimeout(async () => {
    setFetchingWorkers(true);
    try {
      const res = await apiFetchJson<WorkerOption[]>(`/api/v1/production/workers?search=${encodeURIComponent(q)}`);
      setWorkerOptions(res);
    } catch { /* ignore */ } finally {
      setFetchingWorkers(false);
    }
  }, 250);
}, []);

useEffect(() => { fetchWorkers(""); }, [fetchWorkers]);
```

- [ ] **Step 3: Remove now-unused imports**

If the file imports `Combobox`, `ComboboxContent`, `ComboboxList`, `ComboboxItem`, `ComboboxEmpty`, `ComboboxInput` and they are no longer used after this task, remove them from the import line. Keep any that are still used elsewhere in the file (read the file to confirm).

- [ ] **Step 4: Add the `SearchCombobox` import**

```ts
import { SearchCombobox } from "@/components/ui/search-combobox";
```

- [ ] **Step 5: Replace the `<Combobox>` block with `<SearchCombobox variant="list">`**

Find the existing `<Combobox` JSX block in the filter section. Replace it with:

```tsx
<div className="space-y-1.5">
  <Label className="flex items-center gap-1.5 text-sm font-medium">
    <User className="size-3.5" />Worker
  </Label>
  <SearchCombobox<WorkerOption>
    variant="list"
    value={selectedWorkerId !== null ? String(selectedWorkerId) : ""}
    placeholder="Search worker or select All Workers…"
    fetcher={async (q) => {
      return apiFetchJson<WorkerOption[]>(
        `/api/v1/production/workers${q.trim() ? `?search=${encodeURIComponent(q)}` : ""}`,
      );
    }}
    itemIdOf={(w) => w.id}
    getItemKey={(w) => w.id}
    getItemLabel={(w) => w.username}
    onSelect={(w) => handleWorkerSelect(String(w.id))}
    renderItem={(w) => (
      <>
        {w.id === -1 ? (
          <>
            <span className="font-medium">All Workers</span>
            <span className="ml-auto text-xs text-muted-foreground">comparison view</span>
          </>
        ) : (
          <span>{w.username}</span>
        )}
      </>
    )}
  />
</div>
```

NOTE: The original UI had a hard-coded "All Workers" `<ComboboxItem value="all">` row at the top of the dropdown. The new `<SearchCombobox>` takes a `fetcher` + `renderItem` for a homogeneous list, so "All Workers" must either be:

**(a)** Added as a synthetic item in the fetcher result, **and** `handleWorkerSelect` must special-case its id, **OR**

**(b)** Moved out of the dropdown into a sibling button next to the `<SearchCombobox>` (recommended — clearer UX, no special-casing).

**Recommended approach (b):** Add a sibling button to the right of the worker `<SearchCombobox>`:

```tsx
<div className="flex items-end gap-2">
  <div className="flex-1">
    <Label className="flex items-center gap-1.5 text-sm font-medium">
      <User className="size-3.5" />Worker
    </Label>
    <SearchCombobox<WorkerOption>
      variant="list"
      value={selectedWorkerId !== null ? String(selectedWorkerId) : ""}
      placeholder="Search worker…"
      fetcher={async (q) => apiFetchJson<WorkerOption[]>(
        `/api/v1/production/workers${q.trim() ? `?search=${encodeURIComponent(q)}` : ""}`,
      )}
      itemIdOf={(w) => w.id}
      getItemKey={(w) => w.id}
      getItemLabel={(w) => w.username}
      onSelect={(w) => handleWorkerSelect(String(w.id))}
      renderItem={(w) => <span>{w.username}</span>}
    />
  </div>
  <Button
    type="button"
    variant="outline"
    onClick={() => handleWorkerSelect("all")}
    disabled={selectedWorkerId === "all"}
  >
    All Workers
  </Button>
</div>
```

The `handleWorkerSelect` function does **not** need to change — its existing `if (value === "all")` branch handles the sibling button's string value.

- [ ] **Step 6: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
cd /home/jayanth/workspace/One/OneFlow && git add frontend/app/dashboard/production/time-report/page.tsx && git commit -m "fix(production): migrate worker combobox to SearchCombobox (bug 3)"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && source venv-linux/bin/activate && pytest -v
```

Expected: all tests pass, including the 7 new ones in `test_grn_bugfixes.py`.

- [ ] **Step 2: Type-check the frontend**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Lint the frontend**

```bash
cd frontend && npm run lint
```

Expected: 0 errors (or only pre-existing warnings, no new ones introduced by this work).

- [ ] **Step 4: Manual verification — follow the checklist**

Open the running app and walk through the manual verification checklist from the spec (grn/page.tsx, then time-report). Tick each box in the PR description. Particular focus:

- GRN: `own` transport → click inventory item → field populates
- GRN: `company` transport → click inventory item → field populates
- GRN: link a PR with 2 items → items section auto-fills with 2 rows
- GRN: link a different PR after prefill + non-zero qty → confirm dialog appears
- GRN: User combobox (inspected-by) still works
- Time Report: type "al" in worker input → server returns only matching workers
- Time Report: select a worker → report fetches and renders

- [ ] **Step 5: Final commit (only if lint/format fixed anything)**

```bash
cd /home/jayanth/workspace/One/OneFlow && git status
```

If there are uncommitted changes (lint --fix, etc.), commit them with a clear message. Otherwise skip.

---

## Notes for the executor

- The current git branch is `feat/internal-request-receipts` (with many uncommitted changes). The user did not ask for a worktree. **Do not** rebase or commit on top of the existing in-progress work — just commit this work's changes to the current branch as specified above.
- If `npx tsc --noEmit` reports errors in the modified files only, fix them inline. If it reports errors in OTHER files, those are pre-existing on the branch — do not touch.
- If `pytest` reports a fixture error in `conftest.py`, the existing fixtures should work — do not modify them.
- If the backend endpoint needs a different import path for `LinkablePROut` (e.g. it lives in `app/schemas/`), fix the import in `linkable_prs.py` accordingly.
- If the existing `UserCombobox`/`PrCombobox`/`InvCombobox` definitions don't start at the line numbers listed above, find them by name and use the code patterns shown.
