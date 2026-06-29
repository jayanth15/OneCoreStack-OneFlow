# OneFlow — GRN & Work-Time Bug Fixes — Design

**Date:** 2026-06-27
**Status:** Approved (awaiting user review of written spec)
**Owner:** OneFlow
**Scope:** Bug fixes only (first of 7+ sub-projects carved out from `2026-06-25` notes)

## Context

User notes from `2026-06-25` enumerate ~8 independent sub-projects plus several bugs. The full set was decomposed into A–H. This spec covers **A** (GRN bugs) and the **Work Time Report** search bug — the user-chosen starting point for "bug fixes first".

The OneFlow app is a Next.js 16 + shadcn/ui frontend talking to a FastAPI + SQLModel backend. Both the `grn` page and the `production/time-report` page have broken search/select interactions:

1. **GRN item click** — selecting an inventory item in the GRN creation form is unreliable on both `own` and `company` transport types. User notes: "had some error to click the item on both Cown & Company Transport".
2. **GRN link purchase request** — the `PrCombobox` UI exists and the backend endpoint works, but selecting a PR only stores its `id`; the form's items section is **not** prefilled. User-visible result: the link has no effect.
3. **Work Time Report search** — typing in the worker combobox doesn't show filtered results. The page uses base-ui's `Combobox` with a `filter={_item => true}` no-op that the primitive still evaluates, hiding items.

Root cause for (1) and (2): the GRN page hand-rolls three near-identical combobox components (`InvCombobox`, `PrCombobox`, `UserCombobox` at `frontend/app/dashboard/grn/page.tsx:168, 242, 309`) with a `setTimeout(setOpen(false), 150)` blur handler that races with `onMouseDown` on the result buttons. The work-time-report bug has the same shape but uses the base-ui primitive in a way that doesn't fit.

## Goals

- Fix all 3 reported bugs on `main` branch.
- Eliminate the 3 hand-rolled comboboxes in `grn/page.tsx` by extracting a single shared `<SearchCombobox>` + `useDebouncedSearch` hook.
- Replace the broken base-ui `Combobox` usage in `time-report/page.tsx` with the same shared component.
- When a PR is linked during GRN creation, **prefill the items section** with the PR's line items so the user doesn't retype.
- Add pytest coverage for the new backend endpoint and the `workers?search=` filter.

## Non-goals (YAGNI)

- Refactoring other custom comboboxes (request-form, gate-passes, dispatch) — out of scope; tracked as a separate future spec.
- Touching the `Link Purchase Order` auto-fill flow on PO/Gate Pass/Dispatch pages — that's sub-project **B** in the decomposition, separate spec.
- New visual design or styling changes.
- Adding a frontend test harness (Playwright/Cypress). Manual verification only for UI.
- Removing legacy `PurchaseRequest` shadow tables.

## Decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Approach | **Extract shared `<SearchCombobox>` + `useDebouncedSearch`** (Approach B) |
| 2 | Bug 1 — click race | Replace `setTimeout`-on-blur with a `document` `pointerdown` listener that ignores clicks inside the combobox root |
| 3 | Bug 2 — prefill | New `GET /api/v1/grn/linkable-prs/{pr_id}/items` endpoint + `prefillItemsFromPr()` in the page |
| 4 | Bug 2 — re-link behavior | If user changes linked PR after prefill and any row has qty > 0, show `confirm()` dialog before replacing |
| 5 | Bug 3 — work-time report | Use shared `<SearchCombobox variant="list">` with base-ui's `Combobox` underneath; drop the broken `filter={() => true}` |
| 6 | Test coverage | pytest for backend (6 tests); no new frontend harness |
| 7 | Component location | `frontend/components/ui/search-combobox.tsx` + `frontend/hooks/use-debounced-search.ts` |
| 8 | Backward compat | The 3 removed hand-rolled comboboxes in `grn/page.tsx` are the only consumers; no other file references them |

## Architecture

Two new primitives, three call-site migrations, three bug fixes, one new endpoint.

### New primitives

**`useDebouncedSearch<T>(fetcher, opts?)`** — `frontend/hooks/use-debounced-search.ts`
- Encapsulates the `useState(query/results/busy) + useRef(timer) + useCallback(debounce)` triplet.
- Signature:
  ```ts
  function useDebouncedSearch<T>(
    fetcher: (q: string) => Promise<T[]>,
    opts?: { debounceMs?: number }
  ): {
    query: string;
    setQuery: (q: string) => void;
    results: T[];
    busy: boolean;
    open: boolean;
    setOpen: (b: boolean) => void;
    reset: () => void;
  }
  ```
- `debounceMs` default `300`. `0` disables debouncing.
- On unmount: clear pending timeout.
- `reset()` clears query + results + closes the dropdown.

**`<SearchCombobox<T>>`** — `frontend/components/ui/search-combobox.tsx`
- Generic wrapper around the existing `Combobox` primitives in `frontend/components/ui/combobox.tsx` (no new dep).
- Two variants:
  - `"plain"` — renders result buttons directly (for forms where the displayed value differs from the stored id, e.g. GRN items where we show `name` but store `inventory_item_id`).
  - `"list"` — uses base-ui `Combobox` + `ComboboxItem` for keyboard navigation (work-time report).
- Props:
  ```ts
  type Variant = "list" | "plain";
  type Props<T> = {
    value: string;                          // currently-displayed label
    onSelect: (item: T) => void;            // called on click
    fetcher: (q: string) => Promise<T[]>;   // for useDebouncedSearch
    renderItem?: (item: T) => ReactNode;    // for "list" variant
    itemIdOf?: (item: T) => string | number;// for "list" variant value
    getItemKey: (item: T) => string | number;
    getItemLabel: (item: T) => string;
    placeholder?: string;
    disabled?: boolean;
    emptyText?: string;
    variant?: Variant;                      // default "plain"
    debounceMs?: number;
    className?: string;
  };
  ```
- **Click race fix (bug 1):** `open` state is `true` after focus, set to `false` via a `document` `pointerdown` listener attached on mount that ignores clicks inside the combobox root. This replaces the `setTimeout` race in the old `onBlur` handler.

### Call-site migrations

| Site | File | Action |
|---|---|---|
| `InvCombobox` | `frontend/app/dashboard/grn/page.tsx:168` | Replace with `<SearchCombobox variant="plain">` |
| `PrCombobox` | `frontend/app/dashboard/grn/page.tsx:242` | Replace with `<SearchCombobox variant="plain">` |
| `UserCombobox` | `frontend/app/dashboard/grn/page.tsx:309` | Replace with `<SearchCombobox variant="plain">` |
| Time Report worker Combobox | `frontend/app/dashboard/production/time-report/page.tsx:523` | Replace with `<SearchCombobox variant="list">` |

### New backend endpoint

`GET /api/v1/grn/linkable-prs/{pr_id}/items` — `backend/app/routers/grn.py`

- Auth: any logged-in user.
- Returns: `list[LinkablePROut]` (reuses the existing schema; each item is the PR header, with `quantity` and `unit` populated per item).
- Behaviour:
  - 200: returns the PR's line items (one per `PurchaseRequestItem`).
  - 404: PR is soft-deleted (`is_active = false`) OR PR status not in `{approved, in_progress}` OR PR does not exist.
  - 401: not logged in.
- Idempotent and side-effect-free.

## Bug → fix mapping

| Bug | Root cause | Fix |
|---|---|---|
| 1. GRN item click unreliable on both transport types | `setTimeout(setOpen(false), 150)` in `onBlur` fires before `onMouseDown`'s `setOpen(false)` propagates through React's batched update, closing the dropdown mid-selection. Transport choice only affects `vehicleNumber`; items section is identical in both. | New `<SearchCombobox>` uses `document` `pointerdown` listener instead of the timeout |
| 2. PR link does nothing | `handlePrSelect` at grn/page.tsx:506 only sets `linkedPrId` + label; never touches `formItems` | `prefillItemsFromPr(prId)` fetches the new endpoint and replaces `formItems` |
| 3. Work Time Report search | `filter={(_item) => true}` is a no-op; base-ui's primitive still evaluates it and hides items whose rendered text doesn't match the input value | Replace with `<SearchCombobox variant="list">` whose base-ui `Combobox` is properly controlled and whose input is wired to `setQuery` |

## Data flow — PR prefill (bug 2)

```
User clicks PR row in PrCombobox
  → handlePrSelect(pr)
      - setLinkedPrId(pr.id)
      - setLinkedPrLabel(...)
      - if prefill already done and any row has qty > 0:
          confirm() → user cancels: abort prefill, keep current rows
      - else: await prefillItemsFromPr(pr.id)
          GET /api/v1/grn/linkable-prs/{id}/items
            → 200 [PRItem, ...]
            → 404 clear linkedPrId, inline error "PR no longer available"
            → 500 inline error "Could not load PR items. Try again or enter items manually."
          setFormItems(items.map(toFormItem))
            toFormItem: { inventory_item_id, item_name, item_code, item_type, unit,
                          quantity_received: "", quantity_pr_requested: pr.quantity }
```

Editing an existing GRN with a linked PR does **not** auto-prefill (form is already populated from `grn.items`). Prefill is a one-shot on the **new** GRN creation path.

## Error handling

| Failure | Behaviour |
|---|---|
| `fetcher` in `useDebouncedSearch` throws | Dropdown shows `emptyText`; no toast. User can retry by typing more. |
| PR prefill 404 | `linkedPrId` cleared; inline error shown under `PrCombobox` |
| PR prefill 500 | `linkedPrId` cleared; generic inline error |
| Backend auth failures | Existing `apiFetchJson` behaviour (401 → redirect to login; 403 → toast) |
| Worker search error | Dropdown shows "No workers found"; report still renders for previously selected worker |

## Testing

### Backend — `backend/tests/test_grn_bugfixes.py`

1. `test_linkable_pr_items_returns_line_items` — create PR with 2 items; GET endpoint returns both with correct shape.
2. `test_linkable_pr_items_404_for_inactive_pr` — soft-delete a PR; assert 404.
3. `test_linkable_pr_items_404_for_wrong_status` — PR in `pending` (not `approved/in_progress`); assert 404.
4. `test_linkable_pr_items_empty_for_pr_without_items` — PR with 0 items; assert `[]` and 200.
5. `test_workers_search_filters_by_username` — create 3 users (alice, bob, carol); GET `?search=al` returns only alice.
6. `test_workers_search_includes_only_active` — create inactive user; assert not in results.

Reuse fixtures from `backend/tests/conftest.py` (`admin_token`, `client`, `session`).

### Frontend — manual verification checklist (in PR description)

- [ ] GRN: select `own` transport → click inventory item → field populates, no flicker
- [ ] GRN: select `company` transport → click inventory item → field populates, no flicker
- [ ] GRN: type 3+ chars in inventory combobox → debounced server search fires, results appear
- [ ] GRN: link a PR with 2 items → items section auto-fills with 2 rows, qty_pr_requested shown as hint
- [ ] GRN: link a different PR after prefill + non-zero qty → confirm dialog appears
- [ ] GRN: User combobox (inspected-by) still works
- [ ] Time Report: type "al" in worker input → server returns only matching workers, list updates
- [ ] Time Report: select a worker → report fetches and renders

### Verification commands (run before claiming done)

- `cd backend && pytest tests/test_grn_bugfixes.py -v`
- `cd frontend && npx tsc --noEmit`
- `cd frontend && npm run lint` (if defined in `package.json`; else skip)

## Files touched

**New:**
- `frontend/hooks/use-debounced-search.ts`
- `frontend/components/ui/search-combobox.tsx`
- `backend/tests/test_grn_bugfixes.py`

**Modified:**
- `frontend/app/dashboard/grn/page.tsx` (remove 3 hand-rolled comboboxes, use `<SearchCombobox>`; add `prefillItemsFromPr`)
- `frontend/app/dashboard/production/time-report/page.tsx` (replace base-ui `Combobox` block with `<SearchCombobox variant="list">`)
- `backend/app/routers/grn.py` (add `GET /api/v1/grn/linkable-prs/{pr_id}/items`)

**No DB migration:** schema unchanged. The new endpoint reads existing `PurchaseRequest` + `PurchaseRequestItem` rows.
