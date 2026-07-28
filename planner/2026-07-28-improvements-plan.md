# OneFlow Improvements Implementation Plan

**Date:** 2026-07-28  
**Audience:** AI implementation agent  
**Document type:** Architecture, implementation, migration, and validation plan  
**Repository:** OneFlow ERP  
**Planning constraint:** Implement the changes described here, but do not reinterpret the business rules without documenting the discrepancy and obtaining product-owner confirmation.

---

## 1. Objective

Implement the following improvements as one coordinated release:

1. Correct dispatch-time inventory behavior for OEM/vendor versus dealer/supplier dispatches.
2. Make Gate Pass history complete and expose the correct party-specific purchase reference.
3. Add secure PDF uploads to Attachment inventory items.
4. Add audit-quality printing to every inventory list/report page.
5. Ensure deductions target the selected leaf item/sub-category/variant only.
6. Add complete-history printing to every history viewer.

The release must preserve:

- Existing authorization rules.
- Existing inventory quantities during migration.
- Existing request, receipt, dispatch, Gate Pass, and history records.
- SQLite development support and PostgreSQL production compatibility.
- The current Next.js/FastAPI API boundary.
- Existing PWA and responsive behavior.

---

## 2. Current-System Findings

These findings are based on the repository state on 2026-07-28 and must be rechecked immediately before implementation.

### 2.1 Dispatch

- Dispatch statuses are currently `pending`, `dispatched`, `delivered`, and `cancelled`.
- `party_type` is `vendor` for OEM clients and `supplier` for the UI category labelled “Dealer / Supplier.”
- Dispatch items store `inv_type`, `inv_item_id`, and quantity.
- A linked `customer_dispatch` request currently deducts stock when the dispatch first enters `dispatched` or `delivered`.
- The linked request status is used as the implicit idempotency guard. Once it becomes `received`, a later transition does not deduct again.
- A standalone OEM/vendor dispatch without a linked `customer_dispatch` request currently has no equivalent stock deduction.
- Dealer/supplier dispatches currently expose a request reference, not the requested receipt-only reference.
- The Dispatch model has no `receipt_id`, `receipt_number`, or explicit stock-deduction marker.

Relevant files:

- `backend/app/routers/dispatch.py`
- `backend/app/models/dispatch.py`
- `backend/app/models/dispatch_item.py`
- `backend/app/models/dispatch_history.py`
- `backend/app/services/request_inventory.py`
- `frontend/app/dashboard/dispatch/page.tsx`
- `backend/tests/test_request_inventory_dispatch_notifications.py`

### 2.2 Gate Pass

- `GatePassHistory` already exists and can represent `created`, `updated`, and status changes.
- Creation writes one history row.
- Updates write history only when status changes. Ordinary field/item/reference edits are not logged.
- Deletion changes the status to `deleted` but does not write a Gate Pass history row.
- There is no Gate Pass-specific history API endpoint or detailed Gate Pass history UI.
- The aggregate History page can query Gate Pass history, but it can only display records that were actually written.
- Gate Pass currently stores and displays both purchase-request and purchase-order references for either party type.

Relevant files:

- `backend/app/routers/gate_passes.py`
- `backend/app/models/gate_pass.py`
- `backend/app/models/gate_pass_history.py`
- `backend/app/routers/history.py`
- `frontend/app/dashboard/gate-passes/page.tsx`

### 2.3 Attachment inventory

- “Attachments” is an inventory domain, not a generic file-attachment service.
- An Attachment item currently supports a single base64 image.
- The API is JSON-based and has no multipart upload/download endpoints.
- `python-multipart` is already installed.
- The application database and its backup flow are the safest portable persistence boundary for small PDF documents.

Relevant files:

- `backend/app/routers/attachments.py`
- `backend/app/models/attachment_item.py`
- `frontend/app/dashboard/inventory/attachments/page.tsx`
- `backend/app/core/backup.py`
- `backend/app/routers/settings.py`

### 2.4 Inventory identity and deduction

- Generic inventory uses `InventoryItem.id`.
- Spares requests correctly search variant records and submit `SpareItemVariant.id`.
- `deduct_request_stock()` resolves `spare` IDs as `SpareItemVariant`, then recomputes the parent `SpareItem.recorded_qty`.
- The Gate Pass spare selector currently returns parent `SpareItem.id`, unlike request/dispatch selectors. Gate Pass does not currently deduct stock, but this inconsistency must not be copied into deduction flows.
- Weeder categories contain distinct `WeederItem` leaf rows. Deduction must target `WeederItem.id`, not a category ID or category total.
- Parent-level spare adjustment currently distributes a change across active variants. That behavior is unsafe when the user intended one selected leaf/variant.

Relevant files:

- `backend/app/services/request_inventory.py`
- `backend/app/routers/spares.py`
- `backend/app/models/spare_item.py`
- `backend/app/models/spare_item_variant.py`
- `backend/app/routers/weeders.py`
- `backend/app/models/weeder_item.py`
- `frontend/components/requests/request-form.tsx`
- `frontend/app/dashboard/dispatch/page.tsx`
- `frontend/app/dashboard/gate-passes/page.tsx`

### 2.5 Printing

- Dispatch, GRN, Gate Pass, Receipt, Purchase Order, time-report, and stock-alert pages contain separate hand-built printing implementations.
- The aggregate History page already has a Print button, but it prints only the history records already loaded into browser state, not the complete filtered result.
- Some generated print HTML interpolates database/user text without a shared HTML-escaping function.
- Per-item history dialogs exist for generic inventory, consumables, spares/variants, weeders, and attachments.
- Schedule and request-detail history views also need printing.
- A shared print/report utility does not yet exist.

---

## 3. Required Business Rules and Architectural Decisions

### 3.1 Terminology

Use the following canonical mapping consistently in code comments, tests, and UI:

| UI/business term | Existing internal value | Meaning |
|---|---|---|
| OEM / Vendor | `party_type="vendor"` | OEM client receiving goods from OneFlow |
| Dealer / Supplier | `party_type="supplier"` | Dealer, distributor, walk-in customer, or supplier-side flow |
| Purchase Number | `PurchaseOrder.po_number` | Purchase Order number, not Purchase Request serial number |
| Dispatch completion | First transition into `dispatched` | Inventory-affecting completion boundary |
| Final delivery | `delivered` | Later logistics confirmation; must not deduct again |

If the product owner intends “Purchase Number” to mean Purchase Request `sn_no`, stop before implementation and resolve the terminology. Do not silently choose a different reference.

### 3.2 Dispatch stock rules

#### OEM / Vendor dispatch

- Do not deduct on dispatch creation.
- Do not deduct while status remains `pending`.
- On the first successful transition from a non-completed status into `dispatched`, validate and deduct every inventory-backed dispatch line atomically.
- A later transition from `dispatched` to `delivered` must not deduct again.
- Re-saving `dispatched` must not deduct again.
- If any line is invalid or has insufficient stock, reject the entire transition with HTTP 409 and preserve:
  - all inventory quantities,
  - dispatch status,
  - linked request state,
  - history state.
- Manual text-only lines without `inv_type`/`inv_item_id` may remain non-stock lines, but the UI must clearly identify them as not inventory-linked. Do not silently pretend they were deducted.

#### Dealer / Supplier dispatch

- Never deduct inventory in the Dispatch transaction.
- Treat the relevant upstream request/receipt process as the owner of stock deduction.
- Record the inventory quantity before and after dispatch completion in tests and prove it is unchanged.
- Display and link only the Receipt Number as the business reference.
- Do not display or link Request Number, Purchase Request Number, Purchase Order Number, or Schedule Number in the dealer/supplier reference block or printout.

#### Idempotency

Do not rely only on request status for stock idempotency. Add explicit dispatch-level state:

- `inventory_deducted_at: datetime | None`
- `inventory_deducted_by_user_id: int | None`
- `inventory_deducted_by_username: str | None`

The completion transaction must lock/re-read the dispatch and check `inventory_deducted_at is None` before deduction. Set the marker in the same database transaction as quantity changes, inventory history, dispatch status, dispatch history, and linked-request updates.

For SQLite, use one transaction and avoid committing in helper functions. For PostgreSQL, use a row lock where supported. The correctness condition must not depend on a frontend button becoming disabled.

#### Receipt reference

Add explicit nullable dispatch fields:

- `receipt_id`
- `receipt_number` as a denormalized immutable display snapshot

For `party_type="supplier"`:

- Require a valid Receipt reference before transitioning to `dispatched`.
- Resolve `receipt_number` on the server from `receipt_id`; do not trust a client-supplied number.
- Ensure the receipt exists, is visible to the current user, and is in the product-approved state. Prefer `signed_off`; if current operations require `created`, document that exception in the code and tests.
- Ensure one receipt cannot be linked to incompatible or duplicate active dispatches unless partial dispatch is intentionally supported. Partial dispatch is out of scope for this release.

For `party_type="vendor"`:

- Force `receipt_id` and `receipt_number` to `NULL`.

Add a receipt deep link. Prefer a stable detail route such as `/dashboard/receipts/{id}`. If the existing list/dialog design must be retained, support `/dashboard/receipts?receipt_id={id}` and automatically open the referenced receipt. Do not create a non-functional link.

### 3.3 Gate Pass reference rules

#### Vendor Gate Pass

- Show only Purchase Order Number (`po_number`) as the purchase reference.
- The number must link to a working Purchase Order detail target.
- Hide Purchase Request Number everywhere:
  - create/edit form,
  - list/table/card,
  - detail dialog,
  - print view,
  - API DTO intended for the frontend, if possible without breaking compatibility.

#### Supplier Gate Pass

- Do not show or link any purchase number.
- Hide both Purchase Request and Purchase Order selectors.
- On party change from vendor to supplier, clear all purchase reference fields in frontend state.
- Enforce the invariant in the backend by setting all purchase reference fields to `NULL` for supplier Gate Passes, even if a malicious/stale client submits them.

#### Backward-compatible cleanup

- Preserve old database columns for the initial release to avoid destructive migration.
- Backfill/clean inconsistent supplier records by nulling purchase references only after producing a migration report or backup.
- Existing vendor records with both PR and PO should retain the PO and stop exposing the PR.
- Existing vendor records with only a PR need product-owner review; do not mislabel a PR number as a PO number.

### 3.4 Gate Pass history rules

Every material action must create one or more append-only history rows:

- `created`
- `updated`
- `status_change`
- `approved` if approval is a supported status/action
- `dispatched` if dispatch is a supported status/action
- `closed`
- `deleted`
- `reference_changed`
- `items_changed`

Do not invent approval/dispatch workflow states solely to make history labels appear. If the existing Gate Pass workflow is expanded, define and test allowed transitions separately. The history system must generically capture those transitions.

History rows must include:

- Gate Pass ID.
- Action/change type.
- UTC timestamp.
- Acting user ID and username.
- Old status and new status when applicable.
- Field name or a structured diff for edits.
- A human-readable note.
- Item changes with before/after snapshots or a structured JSON diff.

Recommended schema extension:

- Add `changed_by_user_id`.
- Add `field_name`.
- Add `old_value`.
- Add `new_value`.
- Add `details_json` for item/reference change metadata.

Do not overwrite or delete history when a Gate Pass is deleted. Gate Pass deletion remains a soft delete.

Expose:

- `GET /api/v1/gate-passes/{id}/history?limit=&offset=`
- A paginated/total-aware response, or a consistent shared pagination envelope.
- A History action in desktop and mobile Gate Pass views.
- A detailed chronological dialog/drawer showing action, timestamp, user, before/after state, and notes.
- A Print action that prints the complete history, not just the visible page.

### 3.5 PDF attachment storage

Support multiple PDF documents per Attachment inventory item using a child table rather than expanding `image_base64`.

Recommended table: `attachment_document`

Fields:

- `id`
- `attachment_id` indexed and foreign-keyed to `attachment_item.id`
- `original_filename`
- `content_type`
- `size_bytes`
- `sha256`
- `content` as SQLAlchemy `LargeBinary`
- `uploaded_by_user_id`
- `uploaded_by_username`
- `created_at`
- `is_active` for soft deletion

Rationale:

- Works with SQLite and PostgreSQL.
- Keeps PDF data inside the existing database backup boundary.
- Avoids base64 inflation and large JSON payloads.
- Allows multiple documents and independent deletion.

API:

- `GET /api/v1/attachments/{item_id}/documents`
- `POST /api/v1/attachments/{item_id}/documents` using multipart form data
- `GET /api/v1/attachments/{item_id}/documents/{document_id}/content`
- `DELETE /api/v1/attachments/{item_id}/documents/{document_id}`

Security and validation:

- Require authentication to list/view/download.
- Preserve current admin-level mutation authorization for upload/delete unless product permissions explicitly differ.
- Accept only `application/pdf`.
- Verify the file starts with the PDF signature `%PDF-`; do not trust filename or browser MIME alone.
- Normalize the filename to a safe basename and never use it as a filesystem path.
- Default maximum size: 10 MiB, configurable through backend settings.
- Stream/read with a hard byte limit; reject oversized uploads with HTTP 413.
- Calculate SHA-256 for integrity and optional duplicate detection.
- Serve with `Content-Type: application/pdf`, `X-Content-Type-Options: nosniff`, and a safe `Content-Disposition`.
- Return 404 when the document does not belong to the specified attachment.
- Soft-delete metadata; decide whether binary content is retained for audit or purged by a separately authorized retention task. Default to retaining it in this release.

UI:

- Add a “PDF documents” section to create/edit/detail workflows.
- Because the Attachment item must exist before child documents can be uploaded, create the item first, then upload queued PDFs.
- Show filename, size, uploader, upload time, View/Download, and Delete.
- Provide upload progress/busy state and per-file error messages.
- Accept `.pdf,application/pdf`.
- Keep image upload behavior unchanged.
- Ensure mobile layouts do not overflow on long filenames.

### 3.6 Leaf-only deduction invariant

All inventory-affecting operations must use a canonical stock locator:

```text
inventory_type + leaf_item_id
```

Examples:

- Generic inventory: `raw_material + InventoryItem.id`
- Finished goods: `finished_good + InventoryItem.id`
- Spares: `spare + SpareItemVariant.id`
- Weeders: `weeder + WeederItem.id`
- Attachments: `attachment + AttachmentItem.id`
- Consumables: `consumable + Consumable.id`

Rules:

- Category IDs, sub-category IDs, and aggregate parent IDs are not valid stock deduction targets.
- For spares with variants, deduction changes exactly one selected `SpareItemVariant.qty`.
- Recompute `SpareItem.recorded_qty` from active variants after the leaf change. This aggregate update is not a second deduction.
- History must identify the selected variant and its before/after quantities. Parent aggregate before/after values may be included as secondary metadata.
- For weeders, deduction changes exactly one selected `WeederItem.qty`; category totals are calculated from children.
- For any future sub-category inventory model, deduction must target the selected child row and recompute/report parent totals without distributing a delta across siblings.
- Never proportionally spread a subtract operation across sibling variants when the user selected one variant.
- Parent-level manual stock adjustment must either:
  1. be removed/disabled when multiple leaf variants exist, or
  2. require explicit per-variant allocation.
  
  Do not retain the current implicit proportional distribution for subtract/set actions.

Validation must reject:

- A parent spare ID submitted as a `spare` leaf ID.
- A leaf that does not belong to the displayed parent/sub-category.
- An inactive leaf.
- Missing inventory identity for a line presented as inventory-backed.
- Negative or zero completion quantities where inappropriate.
- Insufficient stock on any leaf.

### 3.7 Inventory printing

Add a common Print action to these inventory list/report surfaces:

- Inventory overview/consolidated list.
- Raw Materials.
- Finished Goods.
- Semi-Finished.
- Scraps.
- Consumables.
- Spares, including category, sub-category, item, and variant identity.
- Weeders, including category and item identity.
- Attachments.
- Stock Alerts.

Do not add Print to create/edit forms unless they contain a distinct report.

Provide two print modes:

1. **Cycle Count Sheet**
2. **Inventory Audit Snapshot**

Cycle Count columns:

- Row number.
- Inventory type.
- Item code/SN/part number.
- Item/variant description.
- Category.
- Sub-category.
- Storage location.
- Unit.
- System quantity.
- Blank “Physical count” column.
- Blank “Variance” column.
- Blank “Counter initials” column.
- Blank “Notes” column.

Inventory Audit Snapshot columns:

- All relevant identification fields above.
- Opening quantity where available.
- Current/system quantity.
- Reorder level.
- Rate and total value where the user is authorized to view financial fields.
- Active/inactive status when included by filter.
- “As of” timestamp with timezone.
- Applied filters/search terms.
- Generated-by username.

Printing behavior:

- Print the complete filtered result, not only the current page.
- Fetch data in bounded pages using the existing APIs or a dedicated report endpoint.
- Show a loading state while preparing a large report.
- Do not open the print dialog until data retrieval succeeds.
- Escape every interpolated HTML value.
- Include company name/address/GST/contact details from company settings.
- Use a reusable print shell with consistent typography, margins, repeated table headers, page-break behavior, and report metadata.
- Use landscape orientation for wide tables.
- Avoid splitting a single table row across pages.
- Preserve units and decimal precision.
- Print leaf rows for sub-categorized inventories; do not print only an aggregate category total.
- Include an optional summary total only where units are compatible. Never sum pieces, kilograms, and unrelated units into one number.

### 3.8 Complete history printing

Add Print to every history view:

- Aggregate `/dashboard/history` tabs.
- Generic Inventory item history dialog.
- Raw/finished/semi-finished/scrap item history dialogs.
- Consumable history dialog.
- Spare parent history dialog.
- Spare variant history dialog.
- Weeder history dialog.
- Attachment history dialog.
- Schedule history view.
- Request detail history.
- GRN history view.
- Dispatch history view.
- Gate Pass detailed history view.
- Any additional history UI discovered during implementation.

The report must include:

- Company header.
- Report/entity title and stable number/code.
- Applied filters.
- Generated-at timestamp and generated-by username.
- Complete ordered history.
- Acting user.
- Action/change type.
- Field/variant/item affected.
- Before value.
- After value.
- Quantity delta where applicable.
- Notes.
- Timestamp including timezone.

Completeness requirement:

- The print action must retrieve all matching history pages before printing.
- The aggregate History page currently prints only `st.items`; replace that behavior.
- Per-item dialogs currently load ten records at a time; printing must fetch all offsets in chunks up to each endpoint’s supported maximum.
- Preserve deterministic order, preferably oldest-to-newest for audit narratives. If the on-screen order remains newest-first, clearly label the printed ordering.
- If retrieval fails part-way, do not print a partial report. Display an error.
- Add a reasonable safety limit and an explicit warning for exceptionally large reports; do not silently truncate.

---

## 4. Shared Components and Services

Avoid duplicating more hand-built HTML print functions.

### 4.1 Frontend report utility

Create a reusable module, for example:

- `frontend/lib/print-report.ts`

Responsibilities:

- `escapeHtml(value)`
- safe date/number formatting
- company header rendering
- report metadata rendering
- print-window lifecycle
- common print CSS
- empty-state handling
- page orientation
- repeated headers/page breaks
- closing or cleaning the generated window

Create reusable helpers/components where appropriate:

- `InventoryPrintDialog`
- `HistoryPrintButton`
- `fetchAllPages`

`fetchAllPages` must:

- preserve current filters,
- request bounded pages,
- verify received counts against API totals where available,
- deduplicate by stable ID,
- stop on empty page or total reached,
- throw on inconsistent pagination rather than looping forever.

### 4.2 Backend stock service

Refactor stock mutation behind one service-level transaction contract.

Recommended responsibilities:

- Resolve a canonical leaf stock target.
- Validate type and identity.
- Validate quantity and availability.
- Apply multiple deductions atomically.
- Write leaf-level inventory history.
- Recompute parent aggregates.
- Return before/after snapshots for dispatch history and tests.

Do not commit inside the stock service. The caller owns the transaction.

### 4.3 Backend audit helper

Create a reusable Gate Pass audit helper that:

- takes before and after snapshots,
- calculates changed fields,
- records one status action plus field/item detail rows or a structured JSON detail,
- records actor ID/username and UTC time,
- never commits independently.

Use stable JSON serialization and avoid storing secrets or entire binary documents in audit detail.

---

## 5. Database Migrations

Create Alembic migrations. Do not use runtime `create_all()` as the only schema-change mechanism.

Expected schema changes:

1. Dispatch:
   - `receipt_id`
   - `receipt_number`
   - `inventory_deducted_at`
   - `inventory_deducted_by_user_id`
   - `inventory_deducted_by_username`
2. Gate Pass history:
   - `changed_by_user_id`
   - `field_name`
   - `old_value`
   - `new_value`
   - `details_json`
3. Attachment document:
   - new `attachment_document` table and indexes.

Migration requirements:

- Upgrade succeeds on a populated legacy SQLite database.
- Upgrade succeeds on a clean database.
- Downgrade is defined where safely possible.
- Do not infer that an old dispatched OEM record already deducted stock unless evidence exists.
- Do not retroactively deduct any stock during migration.
- For old dispatches, leave `inventory_deducted_at=NULL` unless a reliable linked inventory history entry proves deduction. Prefer a separate reconciliation report over guessing.
- Old completed dispatches must not become automatically deductible merely because their marker is NULL. The service must distinguish legacy terminal records from a new completion transition.
- Back up before cleanup of Gate Pass references.
- Add indexes for `receipt_id`, `inventory_deducted_at` if query patterns justify them, and `attachment_document.attachment_id`.

---

## 6. Implementation Sequence

### Phase 0: Baseline and characterization

1. Run the existing backend test suite.
2. Run frontend lint and production build.
3. Add characterization tests for current dispatch, request, receipt, and leaf inventory behavior.
4. Capture representative database fixtures:
   - OEM pending dispatch.
   - OEM dispatched legacy dispatch.
   - Dealer/supplier dispatch with linked request.
   - Receipt-linked request.
   - Spare with two variants in different sub-category contexts.
   - Weeder category with two item rows.
5. Confirm the exact meaning of “Purchase Number.”

### Phase 1: Canonical stock identity

1. Introduce/refine the leaf stock locator.
2. Make all request and dispatch selectors return the correct leaf ID.
3. Remove parent-ID ambiguity from backend deduction.
4. Stop parent-level subtract/set from spreading across siblings.
5. Add leaf-level history metadata.
6. Complete backend tests before changing dispatch workflow.

### Phase 2: Dispatch and receipt behavior

1. Add migration fields.
2. Add receipt lookup/link validation.
3. Implement OEM completion deduction with explicit idempotency marker.
4. Implement dealer/supplier no-deduction path.
5. Make linked-request updates and notifications part of the same transaction.
6. Update API DTOs.
7. Update Dispatch create/edit/detail/list/print UI.
8. Add receipt deep-link behavior.
9. Add concurrency/idempotency tests.

### Phase 3: Gate Pass references and history

1. Enforce party-specific reference rules server-side.
2. Add full Gate Pass audit logging.
3. Add Gate Pass history endpoint.
4. Add detailed responsive history UI.
5. Add complete history printing.
6. Update aggregate History mapping if new fields/actions require it.

### Phase 4: PDF documents

1. Add `attachment_document` migration/model.
2. Add secure upload/list/content/delete endpoints.
3. Add API tests for authorization, validation, size, ownership, and download headers.
4. Add Attachment UI document section.
5. Validate backup and restore with PDF content.

### Phase 5: Shared printing

1. Build shared report utility and pagination helper.
2. Convert the aggregate History page first.
3. Add History Print to every item/entity history viewer.
4. Add the two inventory print modes to every inventory list/report.
5. Reuse shared company header and formatting.
6. Retain existing specialized business-document printouts unless intentionally migrated and regression-tested.

### Phase 6: Full validation and graph update

1. Run all automated checks.
2. Perform the manual validation matrix below.
3. Test on Chromium print preview at desktop and mobile viewport.
4. Test a populated SQLite upgrade.
5. Test PostgreSQL if available in CI/deployment.
6. Run `graphify update .`.
7. Update relevant OKF documentation and endpoint documentation.

---

## 7. Backend Test Plan

Add focused tests rather than relying only on broad end-to-end tests.

### 7.1 Dispatch tests

1. OEM pending creation leaves stock unchanged.
2. OEM edit while pending leaves stock unchanged.
3. OEM transition to `dispatched` deducts every linked leaf exactly once.
4. OEM transition `dispatched -> delivered` does not deduct again.
5. Repeated PUT with `status=dispatched` does not deduct again.
6. OEM standalone dispatch lines deduct without requiring a customer-dispatch request.
7. Insufficient stock on one of several lines rolls back every line and status/history change.
8. Invalid/inactive leaf rolls back the transaction.
9. A spare dispatch deducts the selected variant only.
10. A weeder dispatch deducts the selected weeder item only.
11. Dealer/supplier `pending -> dispatched` leaves all inventory unchanged.
12. Dealer/supplier completion requires and returns a valid Receipt reference.
13. Dealer/supplier response contains the receipt number and no exposed request/purchase reference in its frontend-facing reference object.
14. OEM rejects/clears receipt fields.
15. Two concurrent completion attempts produce one deduction and one completion marker.
16. Legacy terminal dispatch update does not unexpectedly deduct.
17. Cancellation before completion leaves inventory unchanged.
18. Attempting to revert a completed OEM dispatch does not automatically restore inventory. Stock reversal is out of scope and must require a separately audited adjustment.

### 7.2 Gate Pass tests

1. Create writes `created` history with actor and timestamp.
2. Field edit writes `updated` history with before/after values.
3. Item replacement writes `items_changed` detail.
4. Status change writes old/new status.
5. Delete writes `deleted` history and retains all earlier history.
6. History endpoint enforces Gate Pass access.
7. History endpoint pagination is deterministic.
8. Vendor Gate Pass accepts a valid PO and returns a working PO reference.
9. Vendor Gate Pass clears/rejects Purchase Request reference.
10. Supplier Gate Pass clears/rejects all purchase references.
11. Changing vendor to supplier clears stale references.
12. Aggregate History includes all new Gate Pass actions.

### 7.3 PDF tests

1. Valid PDF upload succeeds.
2. Multiple PDFs can belong to one Attachment item.
3. Non-PDF MIME is rejected.
4. `.pdf` file without `%PDF-` signature is rejected.
5. Valid PDF with misleading extension is handled according to the explicit filename policy.
6. Oversized upload returns 413 and stores no partial row.
7. Unauthenticated list/upload/download/delete fails.
8. Non-admin mutation fails if existing Attachment mutation policy is retained.
9. A document cannot be fetched through another Attachment item ID.
10. Download headers are safe and correct.
11. Soft-deleted document is not listed or downloadable.
12. Backup/restore preserves exact SHA-256 and bytes.

### 7.4 Leaf deduction tests

For each domain, create at least two sibling leaves:

- Spare variants A and B.
- Spare items in sub-categories A and B.
- Weeder items A and B in one or different categories.
- Generic inventory children where applicable.

Deduct from A and assert:

- A decreases by the expected amount.
- B remains byte-for-byte/quantity-for-quantity unchanged.
- Parent aggregate equals the recomputed child sum.
- Exactly one leaf stock history entry exists.
- History identifies A, not only the parent.
- Insufficient A stock cannot borrow from B.

### 7.5 History/report API tests

1. Filters apply consistently to count and item queries.
2. Entity-name filtering occurs before pagination/counting, not after slicing.
3. Page totals remain correct.
4. No report endpoint silently truncates.
5. Authorization matches the corresponding UI/history view.

---

## 8. Frontend Validation Plan

Use component/integration tests if the repository adds a frontend test harness. Regardless, perform the following manual checks.

### 8.1 Dispatch manual matrix

| Party | Initial status | Action | Expected stock | Expected reference |
|---|---|---|---|---|
| OEM/vendor | create pending | Save | unchanged | no receipt |
| OEM/vendor | pending | mark dispatched | deduct once | no receipt |
| OEM/vendor | dispatched | mark delivered | unchanged from dispatched | no receipt |
| OEM/vendor | dispatched | save again | unchanged | no receipt |
| dealer/supplier | create pending | Save | unchanged by dispatch | receipt only |
| dealer/supplier | pending | mark dispatched | unchanged by dispatch | linked receipt only |

Also verify:

- Short stock produces a useful error.
- UI refresh after completion shows new quantities.
- Browser refresh does not repeat deduction.
- Printout follows reference visibility rules.
- Mobile cards follow the same rules as desktop table/detail views.

### 8.2 Gate Pass manual matrix

- Vendor create/edit displays only Purchase Order selector/reference.
- Vendor list/detail/print link opens the correct PO.
- Supplier create/edit shows no purchase controls.
- Supplier list/detail/print shows no purchase number.
- Switching party types clears stale hidden references.
- History shows created, edits, status changes, and deletion with correct users/times.
- Complete history print contains records not currently visible in pagination.

### 8.3 PDF manual matrix

- Upload a small valid PDF.
- View it in-browser.
- Download it and compare hash.
- Upload two PDFs with long names.
- Reject renamed text/image files.
- Reject a file over the configured maximum.
- Delete one PDF without deleting the Attachment inventory item or its image.
- Verify mobile filename wrapping and action buttons.

### 8.4 Inventory print matrix

For every listed inventory route:

- Apply search/category/sub-category filters.
- Print Cycle Count.
- Print Inventory Audit Snapshot.
- Verify all filtered rows are present, including rows beyond page one.
- Verify excluded rows are absent.
- Verify leaf/variant identity is unambiguous.
- Verify company metadata and generation timestamp.
- Verify blank physical-count fields.
- Verify page headers repeat and rows are not split.
- Verify sensitive rates follow authorization.
- Verify special characters such as `<`, `>`, `&`, quotes, and Unicode cannot break/inject print HTML.

### 8.5 History print matrix

For every history viewer:

- Create more records than one page.
- Print without manually loading additional pages.
- Count printed rows against API total.
- Verify ordering and timezone.
- Verify before/after/delta values.
- Verify empty histories produce a clear non-error state.
- Simulate an API failure while fetching a later page and confirm no partial printout is produced.

---

## 9. Commands and Quality Gates

Run commands from the repository root unless noted.

Backend:

```bash
cd backend
pytest -q
```

Run targeted suites during development:

```bash
cd backend
pytest -q tests/test_request_inventory_dispatch_notifications.py
pytest -q tests/test_receipts.py
pytest -q tests/test_spares_stock_adjustment.py
pytest -q tests/test_gate_passes.py
pytest -q tests/test_attachment_documents.py
pytest -q tests/test_inventory_leaf_deductions.py
```

Create the missing focused test files named above if they do not exist.

Frontend:

```bash
cd frontend
npm run lint
npm run build
```

Database:

```bash
cd backend
alembic upgrade head
alembic current
```

Knowledge graph after implementation:

```bash
graphify update .
```

Release gates:

- All existing tests pass.
- All new tests pass.
- Frontend lint passes.
- Production build passes.
- Fresh database migration succeeds.
- Populated database migration succeeds.
- No unexpected inventory changes occur during migration.
- No print report is limited to the visible page.
- No supplier Gate Pass exposes a purchase number.
- No dealer/supplier dispatch performs a second deduction.
- No OEM dispatch can deduct twice.
- No sub-category deduction affects a sibling leaf.
- Uploaded PDFs survive backup/restore.

---

## 10. Rollout and Reconciliation

1. Back up the production database.
2. Run a read-only pre-deployment report identifying:
   - terminal OEM dispatches with no reliable deduction evidence,
   - supplier dispatches without receipts,
   - supplier Gate Passes carrying purchase references,
   - vendor Gate Passes carrying only PR and no PO,
   - spare parent totals that disagree with active variant sums.
3. Review the report with the product owner.
4. Apply migrations.
5. Do not automatically adjust historical inventory.
6. Recompute display-only parent aggregates from leaf quantities where safe and approved.
7. Deploy backend and frontend together because DTO/reference behavior changes.
8. Smoke-test one record per party/inventory type.
9. Monitor HTTP 409/422 responses and inventory history for unexpected duplicate deductions.

---

## 11. Non-Goals

Do not include these without separate approval:

- Automatic reversal/restocking when a completed dispatch is cancelled.
- Partial dispatch across multiple receipts.
- General-purpose document management outside Attachment inventory.
- Non-PDF uploads.
- Deleting historical audit rows.
- Replacing every existing specialized business-document printout.
- Inventing a new Gate Pass approval workflow only to populate history.
- Retroactively deducting or restoring stock based on assumptions.
- Combining quantities that use incompatible units.

---

## 12. Definition of Done

The work is complete only when:

1. OEM/vendor stock is deducted atomically exactly once at dispatch completion.
2. Dealer/supplier dispatch never deducts stock and exposes only a working Receipt Number link.
3. Gate Pass history is complete, detailed, actor-attributed, printable, and retained after deletion.
4. Vendor Gate Pass exposes only a working Purchase Order Number link.
5. Supplier Gate Pass exposes no purchase reference in any UI, API display DTO, or printout.
6. Attachment inventory supports secure, authorized, persistent PDF upload/view/download/delete.
7. Every inventory list/report provides complete-data Cycle Count and Audit Snapshot printing.
8. Every history viewer provides complete-data printing.
9. Every deduction targets a leaf item/variant and leaves sibling sub-categories untouched.
10. Migrations preserve existing records and do not mutate stock.
11. Automated and manual validation described above passes.
12. Documentation and Graphify output are updated.

---

## 13. Implementation-Agent Reporting Requirements

At handoff, report:

- Files changed, grouped by backend, frontend, migrations, tests, and docs.
- Schema changes and migration revision IDs.
- Exact business-rule decisions made.
- Any discrepancy between this plan and the live code.
- Test commands run and their results.
- Manual validation performed.
- Reconciliation records requiring product-owner action.
- Remaining risks or explicitly deferred work.

Do not claim completion if any required validation was skipped. Clearly distinguish “implemented,” “automated-tested,” “manually verified,” and “not verified.”
