# Graph Report - OneFlow  (2026-07-22)

## Corpus Check
- 299 files · ~238,509 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2953 nodes · 7512 edges · 232 communities (158 shown, 74 thin omitted)
- Extraction: 79% EXTRACTED · 21% INFERRED · 0% AMBIGUOUS · INFERRED: 1572 edges (avg confidence: 0.62)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `45c341e7`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Admin Dashboard Pages
- Spare Parts Data Model
- Departments and Inventory History
- New BOM Creation UI
- Consumables Data Model
- Inventory Edit Pages
- Linkable Purchase Requests
- Database Session and Auth Core
- Inventory Detail Pages
- Requests Page UI
- BOM Edit Pages
- Layout and Empty State Components
- Auth and Inventory Module
- Purchase Request Item Model
- Weeder Category Model
- Superpowers Design Specs
- Combobox UI Component
- Units and Vendors Model
- Supplier Job Model
- Legacy Migrations and Scheduling
- Request Items and Router
- Dashboard Layout and Auth Guard
- Receipts and Requests Model
- Receipts Test Suite
- Inventory Spares PDF Data
- Production and Jobs UI
- GRN and Dispatch Logic
- Request Approval Workflow
- Stock Adjustment Module
- Purchase Request Routes
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- Community 90
- Community 91
- Community 92
- Community 93
- Community 94
- Community 95
- Community 96
- Community 97
- Community 98
- Community 104
- Community 105
- Community 107
- Community 108
- Community 109
- Community 110
- Community 111
- Community 112
- Community 113
- Community 114
- Community 115
- Community 116
- Community 117
- Community 118
- Community 119
- Community 120
- Community 121
- Community 122
- Community 123
- Community 124
- Community 125
- Community 126
- Community 127
- Community 128
- Community 129
- Community 130
- Community 131
- Community 132
- Community 133
- Community 134
- Community 135
- Community 136
- Community 137
- Community 138
- Community 139
- Community 140
- Community 141
- Community 142
- Community 143
- Community 144
- Community 145
- Community 146
- Community 147
- Community 148
- Community 149
- Community 150
- Community 151
- Community 152
- Community 153
- Community 154
- Community 161
- Community 162
- Community 163
- Community 164
- Community 165
- Community 166
- Community 167
- Community 168
- Community 169
- Community 170
- Community 171
- Community 178
- Community 179
- Community 180
- Community 181
- Community 182
- Community 183
- Community 185
- Community 186
- Community 187
- Community 188
- Community 189
- Community 190
- Community 191
- Community 192
- Community 193
- get_linkable_pr_items
- card.tsx
- Dispatch Card Enhancements Design
- OneFlow Backend Overhaul Implementation Plan
- API Endpoints
- Apply shadcn preset `b1tzNKAUa` to OneFlow frontend
- Frontend Architecture
- Units & Weight Enhancement — Implementation Plan
- Unified Request System
- File Structure
- Phase 1: Backend — New Models
- Comprehensive Fixes & Enhancements Plan
- System Architecture
- Auth System
- Phase 3: Backend — New Unified Requests Router
- Phase 7: Frontend — Unified /requests page
- Inventory System
- Logistics System
- Procurement System
- OneFlow Fresh Machine Setup Guide
- Production System
- Prerequisites — What to Download
- RequestHistory
- Phase 4: Backend — Shim Routers (back-compat)
- Phase 5: Backend — Integration Tests for new router
- Phase 8: Frontend — Redirects + Sidebar + Receipts
- README.md
- _migrate_grn_v2
- _migrate_job_card_worker_id
- _migrate_po_vendor_fields
- tabs.tsx
- _migrate_production_plan_v2
- _migrate_purchase_request_items
- _migrate_purchase_request_tables
- _migrate_spare_item_v2
- index.md
- index.md
- index.md

## God Nodes (most connected - your core abstractions)
1. `cn()` - 151 edges
2. `User` - 138 edges
3. `get_session()` - 128 edges
4. `Unit` - 117 edges
5. `InventoryItem` - 98 edges
6. `apiFetchJson()` - 98 edges
7. `get_current_user()` - 78 edges
8. `Schedule` - 76 edges
9. `InventoryHistory` - 68 edges
10. `isAdminOrAbove()` - 64 edges

## Surprising Connections (you probably didn't know these)
- `Inventory Spares Demo Hand-Drawn Schematic` --semantically_similar_to--> `SpareCategory-SubCategory-Item-Variant Hierarchy`  [INFERRED] [semantically similar]
  backend/INVENTORY SPARES DEMO20260307_13532991.pdf → okf/inventory/inventory-system.md
- `Spare Category: Auger (hand push, single wheel, trolley type)` --conceptually_related_to--> `Inventory Management System`  [INFERRED]
  backend/INVENTORY SPARES DEMO20260307_13532991.pdf → okf/inventory/inventory-system.md
- `Spare Category: Engines (Petrol + Diesel variants)` --conceptually_related_to--> `Inventory Management System`  [INFERRED]
  backend/INVENTORY SPARES DEMO20260307_13532991.pdf → okf/inventory/inventory-system.md
- `Spare Category: Fast Weeder (model series 91-XX)` --conceptually_related_to--> `Inventory Management System`  [INFERRED]
  backend/INVENTORY SPARES DEMO20260307_13532991.pdf → okf/inventory/inventory-system.md
- `Spare Category: Gearbox (Centre Rotary + Back Rotary)` --conceptually_related_to--> `Inventory Management System`  [INFERRED]
  backend/INVENTORY SPARES DEMO20260307_13532991.pdf → okf/inventory/inventory-system.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **PWA Install Architecture (HTTPS proxy + self-signed CA + device trust)** — setup_pwa_ca_architecture, docs_oneflow_flow_map_three_tier_stack, setup_doc [INFERRED 0.75]
- **Unified Request Lifecycle (request → approval → delivery → acknowledgment)** — docs_superpowers_plans_2026_06_18_oneflow_unified_request_request_model, docs_superpowers_plans_2026_06_19_internal_request_rework_delivery_ack_fields, docs_superpowers_plans_2026_06_19_internal_request_rework_notify_department_users, docs_superpowers_plans_2026_06_18_oneflow_unified_request_request_receipt [EXTRACTED 0.95]
- **Alembic Cutover + Batch-Mode Migrations** — docs_superpowers_plans_2026_06_21_backend_overhaul_alembic_migration, docs_superpowers_plans_2026_06_27_units_and_weight_enhancement_alembic_batch, docs_superpowers_plans_2026_06_27_units_and_weight_enhancement_unit_model, docs_oneflow_flow_map_idempotent_migrations [INFERRED 0.85]
- **Unified Request System** — docs_superpowers_specs_2026_06_18_oneflow_unified_request_design_request_model, docs_superpowers_specs_2026_06_18_oneflow_unified_request_design_request_item_model, docs_superpowers_specs_2026_06_18_oneflow_unified_request_design_request_customer_dispatch_model, docs_superpowers_specs_2026_06_18_oneflow_unified_request_design_request_history_model, docs_superpowers_specs_2026_06_18_oneflow_unified_request_design_request_receipt_model, docs_superpowers_specs_2026_06_18_oneflow_unified_request_design_requests_router, docs_superpowers_specs_2026_06_18_oneflow_unified_request_design_strangler_fig_pattern, docs_superpowers_specs_2026_06_18_oneflow_unified_request_design_migrate_unified_request_script [EXTRACTED 1.00]
- **Internal Request Rework delivery-confirmation loop** — docs_superpowers_specs_2026_06_19_internal_request_rework_design_awaiting_signoff_status, docs_superpowers_specs_2026_06_19_internal_request_rework_design_deliver_endpoint, docs_superpowers_specs_2026_06_19_internal_request_rework_design_acknowledge_delivery_endpoint, docs_superpowers_specs_2026_06_19_internal_request_rework_design_inbox_endpoint, docs_superpowers_specs_2026_06_19_internal_request_rework_design_create_notification_helper, docs_superpowers_specs_2026_06_19_internal_request_rework_design_notify_department_users_helper, docs_superpowers_specs_2026_06_19_internal_request_rework_design_receipt_merger, docs_superpowers_specs_2026_06_19_internal_request_rework_design_admin_only_cancel, docs_superpowers_specs_2026_06_19_internal_request_rework_design_user_can_accept_targeting [EXTRACTED 1.00]
- **Units table + 14 FK refactor** — docs_superpowers_specs_2026_06_27_units_and_weight_enhancement_design_unit_model, docs_superpowers_specs_2026_06_27_units_and_weight_enhancement_design_units_router, docs_superpowers_specs_2026_06_27_units_and_weight_enhancement_design_alembic_migration_0003, docs_superpowers_specs_2026_06_27_units_and_weight_enhancement_design_14_unit_fk_columns, docs_superpowers_specs_2026_06_27_units_and_weight_enhancement_design_settings_tabs, docs_superpowers_specs_2026_06_27_units_and_weight_enhancement_design_unit_restrict_delete, docs_superpowers_specs_2026_06_27_comprehensive_fixes_and_enhancements_design_inventory_item_weight_fields [EXTRACTED 1.00]
- **OneFlow ERP Knowledge Bundle** — okf_index, okf_inventory_inventory-system, okf_production_production-system, okf_procurement_procurement-system, okf_requests_request-system, okf_logistics_logistics-system, okf_operations_deployment [EXTRACTED 1.00]
- **Request Delivery Workflow (request -> procurement PO / logistics receipt -> inventory)** — okf_requests_request-system, okf_procurement_procurement-system, okf_logistics_logistics-system, okf_inventory_inventory-system [EXTRACTED 0.95]
- **Production BOM consumes raw materials and credits finished goods to inventory** — okf_production_production-system, okf_inventory_inventory-system, okf_procurement_procurement-system [EXTRACTED 0.95]

## Communities (232 total, 74 thin omitted)

### Community 0 - "Admin Dashboard Pages"
Cohesion: 0.04
Nodes (88): BomItem, BomPage(), Department, DepartmentsPage(), DeptRef, ROLE_BADGE_VARIANT, ROLE_LABELS, User (+80 more)

### Community 1 - "Spare Parts Data Model"
Cohesion: 0.05
Nodes (140): AttachmentItem, SQLModel, Attachment inventory item., Consumable, ConsumableHistory, SQLModel, Audit trail for every stock change on a Consumable item., SQLModel (+132 more)

### Community 2 - "Departments and Inventory History"
Cohesion: 0.14
Nodes (47): InventoryHistory, SQLModel, Audit trail for every stock change on an InventoryItem.      Written on: create,, JobCardHistory, SQLModel, Audit trail for every change on a JobCard.      One row per changed field per ed, JobCard, SQLModel (+39 more)

### Community 3 - "New BOM Creation UI"
Cohesion: 0.04
Nodes (59): InventoryItem, NewBomForm(), PaginatedInventory, RMRow, BomLine, JobCard, ORDER_STATUSES, ProcessItem (+51 more)

### Community 4 - "Consumables Data Model"
Cohesion: 0.10
Nodes (53): GatePass, GatePassHistory, SQLModel, GatePassItem, SQLModel, SQLModel, MarketingRequestHistory, SQLModel (+45 more)

### Community 5 - "Inventory Edit Pages"
Cohesion: 0.04
Nodes (89): BomDetail, EditBomPage(), InventoryItem, PaginatedInventory, NewDepartmentPage(), DeptRef, EditUserPage(), UserData (+81 more)

### Community 6 - "Linkable Purchase Requests"
Cohesion: 0.09
Nodes (56): get_linkable_pr_items(), get_linkable_pr_or_404(), Session, Helpers for 'linkable' Purchase Requests — used by GRN creation., Load a PR, raising 404 if it doesn't exist, is soft-deleted, or isn't linkable., Return line items for a linkable PR, shaped like `LinkablePROut`.      The PR it, GRNRecord, GRNItem (+48 more)

### Community 7 - "Database Session and Auth Core"
Cohesion: 0.11
Nodes (62): get_session(), Session, add_process(), bom_preview(), _calculated_hours_from_produced_qty(), _check_backward_status(), _consume_bom_materials(), create_job() (+54 more)

### Community 8 - "Inventory Detail Pages"
Cohesion: 0.17
Nodes (13): avatarColor(), daysUntil(), FGItem, fmt(), fmtDate(), POEntry, ProductSummary, ScheduleEntry (+5 more)

### Community 9 - "Requests Page UI"
Cohesion: 0.29
Nodes (9): SectionCard(), SectionCardProps, Card(), CardAction(), CardContent(), CardDescription(), CardFooter(), CardHeader() (+1 more)

### Community 10 - "BOM Edit Pages"
Cohesion: 0.21
Nodes (23): AttachmentItem, AttachmentHistory, SQLModel, Audit trail for every stock change on an Attachment item., adjust_attachment_stock(), AdjustRequest, AttachmentCreate, AttachmentOut (+15 more)

### Community 11 - "Layout and Empty State Components"
Cohesion: 0.07
Nodes (39): EmptyState(), EmptyStateProps, PageShell(), PageShellProps, AlertDialogMedia(), AlertDialogOverlay(), Breadcrumb(), BreadcrumbEllipsis() (+31 more)

### Community 12 - "Auth and Inventory Module"
Cohesion: 0.14
Nodes (39): get_current_user(), Session, InventoryItem, SQLModel, adjust_stock(), AdjustStockBody, _compute_extra(), create_item() (+31 more)

### Community 13 - "Purchase Request Item Model"
Cohesion: 0.10
Nodes (27): CustomerDispatchBlock(), CustomerDispatchBlockProps, SnItem, ApiRecord, DEFAULT_ITEM, DeptRef, fetchInventoryItems(), InventoryItem (+19 more)

### Community 14 - "Weeder Category Model"
Cohesion: 0.16
Nodes (40): SQLModel, Top-level category for weeder inventory (e.g. 'Weeder Power Machine')., WeederCategory, SQLModel, Audit trail for every stock change on a Weeder item., WeederHistory, SQLModel, Weeder inventory sub-item (belongs to a WeederCategory). (+32 more)

### Community 15 - "Superpowers Design Specs"
Cohesion: 0.05
Nodes (44): migrate_unified_request.py data migration script, RequestCustomerDispatch SQLModel (1:1 child of Request), RequestHistory SQLModel (audit log), RequestItem SQLModel (replaces PurchaseRequestItem), Request SQLModel (replaces PurchaseRequest), RequestReceipt SQLModel (renamed from Receipt), request_type enum: internal_transfer | vendor_purchase | customer_dispatch, requests router (/api/v1/requests) (+36 more)

### Community 16 - "Combobox UI Component"
Cohesion: 0.11
Nodes (38): alembic_version_exists(), init_db(), Create all tables from SQLModel metadata. Called on startup.      For fresh data, Run Alembic migrations to bring the database to the latest revision., Stamp the database at the current Alembic head (for legacy catch-up)., Check if the alembic_version table exists (i.e., DB is already Alembic-managed)., run_alembic_upgrade(), stamp_alembic_head() (+30 more)

### Community 18 - "Supplier Job Model"
Cohesion: 0.14
Nodes (34): SQLModel, Job / process a supplier performs for us (e.g. laser cutting, powder coating)., SupplierJob, SQLModel, Material / raw material a supplier provides to us., SupplierMaterial, SQLModel, Suppliers: companies that provide parts/materials AND may perform job work. (+26 more)

### Community 19 - "Legacy Migrations and Scheduling"
Cohesion: 0.17
Nodes (27): SQLModel, Audit trail for schedule status changes., ScheduleHistory, SQLModel, Schedule, check_availability(), create_schedule(), delete_schedule() (+19 more)

### Community 20 - "Request Items and Router"
Cohesion: 0.16
Nodes (39): SQLModel, Line item for a Request.      Used for internal_transfer and vendor_purchase typ, RequestItem, accept_fulfilment(), accept_item(), _acceptance_departments(), acknowledge_delivery(), _apply_department_visibility_filter() (+31 more)

### Community 21 - "Dashboard Layout and Auth Guard"
Cohesion: 0.07
Nodes (46): PurchaseOrdersPage(), AuthGuard(), ADMIN_MORE_NAV, BottomNav(), GENERAL_MORE_NAV, NavItem, PRIMARY_NAV, ADMIN_CORE_NAV (+38 more)

### Community 22 - "Receipts and Requests Model"
Cohesion: 0.16
Nodes (31): SQLModel, Line item for a Receipt — links to a RequestItem and records delivered/signed-of, ReceiptItem, SQLModel, Goods Receipt — records delivery of items for an internal transfer request., Receipt, _build_receipt_read(), create_department_receipts_for_request() (+23 more)

### Community 23 - "Receipts Test Suite"
Cohesion: 0.08
Nodes (37): Tests for Receipt creation, signoff, and dispute workflow., A user in the requester's department can identify receipt source/target context., Accepting the auto-created receipt closes the linked request., Short delivered quantities are recorded and still close the request once signed, Delivery splits receipts by line-item department and closes only after all are s, Receipt can be created with item-level quantity_delivered., Only the original requester or an admin can sign off a receipt., The original requester can sign off a receipt. (+29 more)

### Community 24 - "Inventory Spares PDF Data"
Cohesion: 0.05
Nodes (40): Inventory Spares Demo Hand-Drawn Schematic, Spare Category: Auger (hand push, single wheel, trolley type), Spare Category: Engines (Petrol + Diesel variants), Spare Category: Fast Weeder (model series 91-XX), Spare Category: Gearbox (Centre Rotary + Back Rotary), Inventory UI Form Spec (Main Screen + Add Inventory Item fields), Spare Category: Reaper (model 400), Spare Category: Stubble Mover (AS-170 / 60-C177 engines) (+32 more)

### Community 25 - "Production and Jobs UI"
Cohesion: 0.08
Nodes (27): CHANGE_ICON, ConsumableLowStockItem, DashboardData, DashboardPage(), fmtCurrencyFull(), fmtCurrencyShort(), formatType(), InventoryByType (+19 more)

### Community 26 - "GRN and Dispatch Logic"
Cohesion: 0.05
Nodes (36): Add columns to `request` table, API Endpoints, Authorization Rules, Backfill in-flight `RequestReceipt` rows, `can_create_receipt` column, Context, Data Model Changes, Decisions (+28 more)

### Community 27 - "Request Approval Workflow"
Cohesion: 0.07
Nodes (28): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+20 more)

### Community 28 - "Stock Adjustment Module"
Cohesion: 0.13
Nodes (20): DeptForm, EditDepartmentPage(), BLANK, CompanyInfo, SettingsPage(), UnitItem, JobCard, JobCardsListInner() (+12 more)

### Community 29 - "Purchase Request Routes"
Cohesion: 0.19
Nodes (29): Dispatch, DispatchHistory, SQLModel, DispatchItem, SQLModel, SQLModel, create_dispatch(), delete_dispatch() (+21 more)

### Community 30 - "Community 30"
Cohesion: 0.18
Nodes (7): Sheet(), SheetContent(), SheetDescription(), SheetFooter(), SheetHeader(), SheetOverlay(), SheetTitle()

### Community 31 - "Community 31"
Cohesion: 0.14
Nodes (19): ApiRecord, BLANK_FORM(), BLANK_ITEM(), CompanyInfo, fetchInventoryItems(), INVENTORY_LABELS, INVENTORY_TYPES, InventoryItem (+11 more)

### Community 32 - "Community 32"
Cohesion: 0.07
Nodes (29): Auth Model, Compat shims (Strangler Fig), Context, Data Migration, Data Model, Decisions, Effort Estimate, Error Handling (+21 more)

### Community 33 - "Community 33"
Cohesion: 0.08
Nodes (40): PurchaseRequestItem, SQLModel, Line item for a purchase request., SQLModel, Change log entry for a Request., RequestHistory, _build_pr_id_to_new_req_id(), _generate_sn() (+32 more)

### Community 34 - "Community 34"
Cohesion: 0.21
Nodes (20): BomItem, SQLModel, Bill of Materials — maps a product name to required raw materials.      product_, BomCloneBody, BomItemCreate, BomItemResponse, BomItemUpdate, clone_bom() (+12 more)

### Community 35 - "Community 35"
Cohesion: 0.16
Nodes (21): create_user_with_dept(), login(), worker_token(), Regression tests for department-scoped request acceptance., test_department_cannot_accept_for_another_target(), test_each_department_delivers_only_its_own_items(), test_each_target_department_accepts_independently(), test_same_department_accepts_each_item_separately() (+13 more)

### Community 36 - "Community 36"
Cohesion: 0.18
Nodes (11): JobCard.actual_qty Field, Job Card Detail Page and Actual Qty Design, FG Auto-completion Cascade Bug, OneFlow ERP Application Flow Map, Idempotent _migrate_*() Function Pattern, RBAC Roles & Permissions Matrix, Status Propagation (job→order→plan→schedule), Three-Tier Stack (Client/Edge/App/Data) (+3 more)

### Community 37 - "Community 37"
Cohesion: 0.10
Nodes (17): CompanyInfo, fmtDate(), fmtDateTime(), FormItemRow, GRNItem, GRNPage(), GRNRecord, INV_TYPE_OPTIONS (+9 more)

### Community 38 - "Community 38"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 39 - "Community 39"
Cohesion: 0.17
Nodes (19): CompanySettings, SQLModel, Key-value store for company-wide settings., CompanyInfoResponse, CompanyInfoUpdate, create_backup(), _db_file_path(), get_company_info() (+11 more)

### Community 40 - "Community 40"
Cohesion: 0.29
Nodes (16): get_current_active_user(), is_admin_or_above(), Depends, User, Require purchase_access flag on the user (or admin/super_admin)., Require admin or super_admin role., Require super_admin role only., Require grn_access flag on the user (or admin/super_admin). (+8 more)

### Community 41 - "Community 41"
Cohesion: 0.16
Nodes (15): BLANK_ITEM, BLANK_SUB, CatsPage, fmtQty(), fmtRate(), highlight(), isLow(), ItemsPage (+7 more)

### Community 42 - "Community 42"
Cohesion: 0.06
Nodes (65): _arm_timer(), _backup_dir_for(), cleanup_old_backups(), _db_path(), perform_backup(), datetime, Database backup scheduler.  Schedule:   - 17:30 (5:30 PM) every day: take a safe, Return the number of seconds until the next 17:30:00 (today or tomorrow). (+57 more)

### Community 43 - "Community 43"
Cohesion: 0.26
Nodes (14): SQLModel, Unified request: internal transfer | vendor purchase | customer dispatch.      R, Request, _customer_request(), _headers(), _internal_request(), InventoryItem, WeederItem (+6 more)

### Community 44 - "Community 44"
Cohesion: 0.09
Nodes (23): File Structure, OneFlow Internal Request Rework Implementation Plan, Spec Coverage Self-Check, Task 10: Remove `can_create_receipt` from backend (user model, users router, auth router), Task 11: Delete the `RequestReceipt` subsystem (backend), Task 12: Backfill in-flight `RequestReceipt` rows into `Request` + drop tables, Task 13: Update `Notification.type` and `RequestHistory.change_type` doc comments, Task 14: Frontend — extend `requests.ts` API client (+15 more)

### Community 45 - "Community 45"
Cohesion: 0.10
Nodes (20): A1. FG / RM Weight Fields, A2. BOM Scrap Calculation from Weights, A3. BOM Clone from Product, A. Weight & Scrap System, B1. GRN → Link Purchase Order, B2. Gate Pass → Link Purchase Order, B3. Purchase Order → Fix PR Auto-Fill, B4. Dispatch → Link Customer Dispatch Request (+12 more)

### Community 46 - "Community 46"
Cohesion: 0.25
Nodes (20): Department, SQLModel, create_department(), delete_department(), DepartmentCreate, DepartmentResponse, DepartmentUpdate, DeptSimple (+12 more)

### Community 47 - "Community 47"
Cohesion: 0.18
Nodes (18): BaseModel, Pydantic schemas for the unified Request API., RequestAcknowledgeDeliveryAction, RequestCreate, RequestCustomerDispatchCreate, RequestCustomerDispatchRead, RequestDeliverAction, RequestDeliverItemAction (+10 more)

### Community 48 - "Community 48"
Cohesion: 0.11
Nodes (19): @base-ui/react, class-variance-authority, clsx, dependencies, @base-ui/react, class-variance-authority, clsx, next (+11 more)

### Community 49 - "Community 49"
Cohesion: 0.23
Nodes (18): Notification, SQLModel, create_notification(), list_notifications(), mark_all_read(), mark_read(), NotificationOut, _out() (+10 more)

### Community 50 - "Community 50"
Cohesion: 0.13
Nodes (16): BLANK_FORM(), blankGPItem(), CompanyInfo, GatePass, GatePassAPIItem, GatePassesPage(), GP_INV_TYPES, GPForm() (+8 more)

### Community 51 - "Community 51"
Cohesion: 0.14
Nodes (13): fmtDate(), HEADERS, HistoryCard(), HistoryItem, HistoryPage, INITIAL_TAB_STATE, InventoryColumns(), QtyColumns() (+5 more)

### Community 52 - "Community 52"
Cohesion: 0.12
Nodes (17): ComboboxContent(), ComboboxInput(), ComboboxItem(), ComboboxList(), useComboboxAnchor(), CommonProps, ListProps, PlainProps (+9 more)

### Community 53 - "Community 53"
Cohesion: 0.24
Nodes (16): SQLModel, Configurable work-type categories for time tracking.      Managed by admins; ref, WorkType, create_work_type(), delete_work_type(), list_work_types(), BaseModel, Depends (+8 more)

### Community 54 - "Community 54"
Cohesion: 0.12
Nodes (17): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/node (+9 more)

### Community 55 - "Community 55"
Cohesion: 0.12
Nodes (15): _migrate_attachment_tables(), _migrate_departments_purchase_request_access(), _migrate_gate_pass_pr_fields(), _migrate_grn_v3(), _migrate_job_card_worker_names(), _migrate_production_process_v2(), _migrate_receipts_into_requests(), Legacy database migrations — one-time catch-up for pre-Alembic databases.  This (+7 more)

### Community 56 - "Community 56"
Cohesion: 0.12
Nodes (16): _migrate_company_settings(), _migrate_departments_handles_dispatch(), _migrate_inventory_drawing_pdf(), _migrate_marketing_request_tables(), _migrate_spare_item_history(), _migrate_spare_item_v3(), _migrate_user_access_flags(), Add design_drawing_pdf column to inventory_item if it doesn't exist (idempotent) (+8 more)

### Community 57 - "Community 57"
Cohesion: 0.16
Nodes (11): currentMonthStart(), DateBreakdown, fmtDate(), MachineBreakdown, OrderBreakdown, ProcessBreakdown, TimeReportPage(), todayStr() (+3 more)

### Community 58 - "Community 58"
Cohesion: 0.30
Nodes (14): DispatchStatus, GatePassStatus, is_admin_or_above(), JobCardStatus, OrderStatus, PlanStatus, PurchaseOrderStatus, Enums for roles, request statuses, and other string constants.  Replaces scatter (+6 more)

### Community 59 - "Community 59"
Cohesion: 0.15
Nodes (13): RequestFormProps, TABS, TypeTabs(), TypeTabsProps, TypeTabsValue, CreateRequestPayload, DeliverRequestPayload, RequestHistory (+5 more)

### Community 60 - "Community 60"
Cohesion: 0.27
Nodes (9): build_department_label_map(), generate_sn(), notify_department_users(), _prefix_for(), Session, Helpers used by both the new /requests router and the legacy shims., Create a notification for every active user belonging to the department     whos, Return {code: "CODE — Name"} for all active departments. Used to attach     a hu (+1 more)

### Community 61 - "Community 61"
Cohesion: 0.11
Nodes (17): Architecture, Backend — `backend/tests/test_grn_bugfixes.py`, Bug → fix mapping, Call-site migrations, Context, Data flow — PR prefill (bug 2), Decisions, Error handling (+9 more)

### Community 62 - "Community 62"
Cohesion: 0.35
Nodes (11): create_purchase_request(), delete_purchase_request(), get_purchase_request(), list_purchase_requests(), Session, User, Shim router for /api/v1/purchase-requests.  Delegates to the unified /api/v1/req, List internal_transfer + vendor_purchase requests.      Fetches each type separa (+3 more)

### Community 63 - "Community 63"
Cohesion: 0.17
Nodes (8): CERTS_DIR, fs, http, https, net, path, server, tlsOptions

### Community 64 - "Community 64"
Cohesion: 0.36
Nodes (10): create_marketing_request(), delete_marketing_request(), get_marketing_request(), list_marketing_requests(), Session, User, Shim router for /api/v1/marketing-requests.  Delegates to the unified /api/v1/re, List customer_dispatch requests.      Fetches the single allowed type. (Same pat (+2 more)

### Community 65 - "Community 65"
Cohesion: 0.43
Nodes (5): ToggleGroup(), ToggleGroupContext, ToggleGroupItem(), Toggle(), toggleVariants

### Community 66 - "Community 66"
Cohesion: 0.20
Nodes (13): admin_token(), create_admin(), create_dept(), prod_dept(), Department, User, qa_dept(), Pytest fixtures for OneFlow backend — in-memory SQLite, transaction-isolated per (+5 more)

### Community 67 - "Community 67"
Cohesion: 0.47
Nodes (7): _columns(), _create_receipt_item_table(), _create_receipt_table(), _migrate_legacy_receipts(), Repair the schema used by request delivery.  Revision ID: 0009 Revises: 0008 Cre, _table_exists(), upgrade()

### Community 68 - "Community 68"
Cohesion: 0.25
Nodes (8): Any, datetime, Session, Shared CRUD utilities for soft-delete and history writing., Soft-delete an entity by setting is_active=False and committing.      Args:, Return current UTC time (replaces deprecated datetime.utcnow())., soft_delete(), utcnow()

### Community 69 - "Community 69"
Cohesion: 0.36
Nodes (8): BaseModel, Pydantic schemas for Receipt API., ReceiptCreate, ReceiptDispute, ReceiptItemCreate, ReceiptItemRead, ReceiptRead, ReceiptSignoff

### Community 70 - "Community 70"
Cohesion: 0.22
Nodes (7): CERT_FILE, ENV_FILE, envContent, fs, ip, os, path

### Community 71 - "Community 71"
Cohesion: 0.29
Nodes (8): Unified Request System Implementation Plan, Unified Request SQLModel (3 types), RequestReceipt Model (replaces Receipt), Strangler Fig Migration Pattern, Request Delivery + Acknowledgment Fields (8 new), Internal Request Rework Implementation Plan, notify_department_users Fan-out Helper, RequestReceipt Subsystem Deletion

### Community 72 - "Community 72"
Cohesion: 0.25
Nodes (8): BOM clone from existing product, BOM scrap calculation from weights (grams normalization), InventoryItem weight_value + weight_unit fields, 14 tables with new *_unit_id FK columns, Alembic migration 0003 (create unit table + migrate 14 columns), Settings page Tabs (Company Info + Units), Unit SQLModel (user-managed unit table), inventory_access permission (per-type read)

### Community 73 - "Community 73"
Cohesion: 0.25
Nodes (7): name, pnpm, onlyBuiltDependencies, private, version, sharp, unrs-resolver

### Community 74 - "Community 74"
Cohesion: 0.43
Nodes (6): _col_exists(), Legacy inline database migrations from database.py run_migrations().  Kept for t, Apply all ALTER TABLE migrations for new columns (SQLite-safe, idempotent)., run_inline_migrations(), _safe_alter(), _table_exists()

### Community 75 - "Community 75"
Cohesion: 0.29
Nodes (7): figtree font, lucide-react icon library (legacy), shadcn baseColor 'mist', remixicon icon library, shadcn style 'sera', shadcn registry preset b1tzNKAUa, Geist font (default Next.js font, to be replaced by figtree)

### Community 76 - "Community 76"
Cohesion: 0.12
Nodes (17): ComboboxChip(), ComboboxChips(), ComboboxChipsInput(), ComboboxClear(), ComboboxEmpty(), ComboboxGroup(), ComboboxLabel(), ComboboxSeparator() (+9 more)

### Community 77 - "Community 77"
Cohesion: 0.29
Nodes (5): STATUS_COLOR_VAR, STATUS_DOT_CLASS, STATUS_LABEL, StatusBarProps, StatusBreakdown

### Community 78 - "Community 78"
Cohesion: 0.29
Nodes (6): figtree, geistMono, geistSans, metadata, RootLayout(), viewport

### Community 79 - "Community 79"
Cohesion: 0.29
Nodes (7): scripts, build, dev, lint, prebuild, predev, start

### Community 80 - "Community 80"
Cohesion: 0.60
Nodes (5): _col_exists(), downgrade(), Fix missing schema in production DB.  The production DB is stamped at alembic he, _table_exists(), upgrade()

### Community 81 - "Community 81"
Cohesion: 0.33
Nodes (5): Any, Session, Shared history writer for audit trail entries.  Usage:     from app.core.history, Create and add a history row.      Args:         session: SQLModel session, write_history()

### Community 82 - "Community 82"
Cohesion: 0.40
Nodes (5): Page, paginate(), Session, Shared pagination utility for SQLModel queries.  Usage:     from app.core.pagina, Paginate a SQLModel select statement.      Args:         session: SQLModel sessi

### Community 83 - "Community 83"
Cohesion: 0.33
Nodes (6): Cancel permission: admin only (at any active status), create_notification helper (to be wired), Notification type values: request_approved | request_rejected | request_accepted | request_delivered | request_received | request_cancelled, notify_department_users helper (dept fan-out), notifications router (/api/v1/notifications), top-bar.tsx (NotificationBell + user avatar)

### Community 84 - "Community 84"
Cohesion: 0.67
Nodes (3): SQLModel, Customer-dispatch child entity (1:1 with Request when request_type=customer_disp, RequestCustomerDispatch

### Community 85 - "Community 85"
Cohesion: 0.12
Nodes (15): 1. Page Structure Split, 2. FG Status Bug Fix, 3. Actual Products Produced Field, 4. Files, 5. Build Order, Backend Changes, Comparison Display, Current (+7 more)

### Community 86 - "Community 86"
Cohesion: 0.50
Nodes (5): frontend/public assets directory, Next.js logo (SVG), Next.js (brand/framework), Next.js wordmark glyph, Vercel wordmark / attribution glyph

### Community 87 - "Community 87"
Cohesion: 0.60
Nodes (3): ok(), start-linux.sh script, warn()

### Community 88 - "Community 88"
Cohesion: 0.90
Nodes (4): kill_pid(), ok(), stop-linux.sh script, warn()

### Community 89 - "Community 89"
Cohesion: 0.24
Nodes (9): Dispatch Card Enhancements Design Doc, Inline Status Dropdown (replace static badge), Dispatch Print Button (mirrors gate-pass print), Dispatch Card Enhancements Implementation Plan, Task 1: Add Printer icon import, Task 2: Add statusUpdatingId state and handleStatusChange function, Task 3: Add printDispatch function, Task 4: Replace status badge with inline dropdown and add Print button on card (+1 more)

### Community 91 - "Community 91"
Cohesion: 0.83
Nodes (3): _col_exists(), downgrade(), upgrade()

### Community 92 - "Community 92"
Cohesion: 0.83
Nodes (3): _col_exists(), downgrade(), upgrade()

### Community 95 - "Community 95"
Cohesion: 0.67
Nodes (3): SQLModel, Per-job-card time entry linking a worker (user) to hours and work type.      Eac, WorkLog

### Community 96 - "Community 96"
Cohesion: 0.09
Nodes (23): Apply shadcn preset `b1tzNKAUa` Implementation Plan, Apply shadcn preset b1tzNKAUa Plan, File Structure, Rollback (if anything goes wrong), Task 1: Capture pre-apply baseline, Task 2: Apply the preset, Task 3: Verify the application still builds and lints, Corporate Blue OKLCH Token Palette (+15 more)

### Community 97 - "Community 97"
Cohesion: 0.50
Nodes (4): GRN item click race bug (setTimeout onBlur), SearchCombobox shared component (plain + list variants), useDebouncedSearch hook, Work Time Report search bug (base-ui filter no-op)

### Community 98 - "Community 98"
Cohesion: 0.50
Nodes (3): plugin, $schema, .opencode/plugins/graphify.js

### Community 105 - "Community 105"
Cohesion: 0.12
Nodes (16): Configuration Files, Database, Default Login, First-Time Installation, Frontend Dependencies, Linux, Linux, Linux systemd Services (optional) (+8 more)

### Community 107 - "Community 107"
Cohesion: 0.14
Nodes (14): GRN & Work-Time Bug Fixes Plan, File Map, GRN & Work-Time Bug Fixes Implementation Plan, GRN Linkable PR Items Endpoint, Notes for the executor, SearchCombobox + useDebouncedSearch Primitives, Task 1: Backend — PR items endpoint (TDD), Task 2: Frontend — `useDebouncedSearch` hook (+6 more)

### Community 108 - "Community 108"
Cohesion: 0.67
Nodes (3): GatePass link purchase order (purchase_order_id + po_number fields), GRN link purchase order (auto-fill items), Fix PO auto-fill from PR (use PR detail endpoint with items)

### Community 109 - "Community 109"
Cohesion: 0.13
Nodes (15): CHANGE_LABELS, fmtDate(), fmtDateTime(), fmtQty(), HistoryEntry, InventoryItem, InventoryTypePage(), isLow() (+7 more)

### Community 112 - "Community 112"
Cohesion: 0.25
Nodes (16): create_vendor(), get_vendor_detail(), list_vendor_names(), list_vendors(), _product_summary(), Any, Depends, Session (+8 more)

### Community 115 - "Community 115"
Cohesion: 0.67
Nodes (3): pnpm workspace config (frontend/ root), sharp build allow-list entry, unrs-resolver build allow-list entry

### Community 116 - "Community 116"
Cohesion: 0.67
Nodes (3): Department model (org departments, handles_customer_dispatch flag), UserDepartment model (M2M user-department), User model (users table)

### Community 117 - "Community 117"
Cohesion: 0.67
Nodes (3): HttpOnly refresh token cookie, auth-guard.tsx (frontend auth wrapper), frontend lib/auth.ts (token storage)

### Community 119 - "Community 119"
Cohesion: 0.67
Nodes (3): AGENTS.md — graphify rules, graphify, graphify skill (knowledge graph tooling)

### Community 126 - "Community 126"
Cohesion: 0.13
Nodes (14): AvailableRequest, BLANK_FORM(), blankDispatchItem(), CompanyInfo, Dispatch, DISPATCH_INV_TYPES, DispatchAPIItem, DispatchFormState (+6 more)

### Community 130 - "Community 130"
Cohesion: 0.67
Nodes (3): client(), TestClient, FastAPI TestClient that uses the isolated per-test session.

### Community 132 - "Community 132"
Cohesion: 0.14
Nodes (14): Comprehensive Fixes & Enhancements — Implementation Plan, Task 10: Work Time Report — print option, Task 11: Job Card — auto-propagate estimated time, Task 12: Quick job card creator on main production screen, Task 13: Verify and run tests, Task 1: Add weight fields to InventoryItem model, Task 2: Add weight fields to inventory frontend forms, Task 3: BOM scrap calculation from weights + clone (+6 more)

### Community 134 - "Community 134"
Cohesion: 0.14
Nodes (12): AttachmentLowStockItem, CompanyInfo, ConsumableLowStockItem, InventoryLowItem, PaginatedInventory, SpareLowStockItem, StockAlertsPage(), TabKey (+4 more)

### Community 137 - "Community 137"
Cohesion: 0.15
Nodes (13): Acceptance criteria, OneFlow Unified Request System Implementation Plan, Out of scope (future releases), Phase 0: Pre-flight, Phase 2: Backend — Data Migration Script, Phase 6: Frontend — API Clients + Components, Phase 9: End-to-End Smoke Test, Task 0: Verify baseline backend + tests run (+5 more)

### Community 141 - "Community 141"
Cohesion: 0.15
Nodes (12): 10. Deletion Flow (RESTRICT), 1. Unit Table (Backend), 2. Change All 14 Unit Columns to FK, 3. Alembic Migration 0003, 4. Unit Router (`/api/v1/units`), 5. Settings Page — Tabs, 6. Frontend — Replace Hardcoded Units, 7. FG Create — Validation (+4 more)

### Community 142 - "Community 142"
Cohesion: 0.17
Nodes (10): BomRequirement, BomUsage, fmt(), InventoryDetailPage(), ItemDetail, ScheduleEntry, STATUS_BADGE, STATUS_LABEL (+2 more)

### Community 194 - "get_linkable_pr_items"
Cohesion: 0.34
Nodes (13): create_unit(), delete_unit(), get_unit_usage_count(), list_units(), BaseModel, Depends, Session, User (+5 more)

### Community 195 - "card.tsx"
Cohesion: 0.83
Nodes (3): _column_exists(), downgrade(), upgrade()

### Community 196 - "Dispatch Card Enhancements Design"
Cohesion: 0.18
Nodes (10): 1. Card Layout, 2. Inline Status Dropdown, 3. Print Functionality, Backend, Current State, Design, Dispatch Card Enhancements Design, Files Modified (+2 more)

### Community 197 - "OneFlow Backend Overhaul Implementation Plan"
Cohesion: 0.20
Nodes (10): Decisions (locked), OneFlow Backend Overhaul Implementation Plan, Phase 1 — Alembic Migration System, Phase 2 — Shared Utilities, Phase 3 — Model Relationships, Phase 4 — Enums + Auth Consolidation, Phase 5 — Pydantic Schemas, Phase 6 — Security Fixes (+2 more)

### Community 198 - "API Endpoints"
Cohesion: 0.20
Nodes (9): API Endpoints, Auth, Auth Dependencies, Core Domain, Procurement & Logistics, Production, Related, Supporting (+1 more)

### Community 199 - "Apply shadcn preset `b1tzNKAUa` to OneFlow frontend"
Cohesion: 0.22
Nodes (8): Apply shadcn preset `b1tzNKAUa` to OneFlow frontend, Approach, Expected effects, Goal, Out of scope, Preset contents (decoded), Rollback, Verification

### Community 200 - "Frontend Architecture"
Cohesion: 0.22
Nodes (8): Auth Flow, Frontend Architecture, Navigation, Pages, PWA, Related, Shared Components, Tech Stack

### Community 201 - "Units & Weight Enhancement — Implementation Plan"
Cohesion: 0.25
Nodes (8): Task 1: Unit model + router + usage-count + Alembic migration, Task 2: Update all 14 backend models — change unit fields to FK, Task 3: Update all backend routers — accept unit_id, resolve unit_name, Task 4: Settings page — add tabs + Units CRUD, Task 5: Replace hardcoded units in inventory forms (new + edit + spares), Task 6: Replace hardcoded units in BOM forms, Task 7: Run verification, Units & Weight Enhancement — Implementation Plan

### Community 202 - "Unified Request System"
Cohesion: 0.25
Nodes (7): Legacy Shim Layer, Lifecycle, Models, Related Systems, Request Types, Unified Request System, Workflow Actions

### Community 203 - "File Structure"
Cohesion: 0.29
Nodes (7): DELETE (later release, not in this plan), File Structure, MODIFY (backend), MODIFY (frontend), NEW files (backend), NEW files (frontend), TEST files

### Community 204 - "Phase 1: Backend — New Models"
Cohesion: 0.29
Nodes (7): Phase 1: Backend — New Models, Task 1: Create `Request` model, Task 2: Create `RequestItem` model, Task 3: Create `RequestHistory` model, Task 4: Create `RequestCustomerDispatch` model, Task 5: Create `RequestReceipt` model, Task 6: Create the database tables

### Community 205 - "Comprehensive Fixes & Enhancements Plan"
Cohesion: 0.33
Nodes (7): BOM Weight-Based Scrap Calculation, Comprehensive Fixes & Enhancements Plan, GRN/GatePass/Dispatch Document Linking, InventoryItem Weight Fields (weight_value/weight_unit), Alembic Batch Mode (SQLite ADD/DROP COLUMN), Units & Weight Enhancement Plan, Unit SQLModel Table + FK Migration

### Community 206 - "System Architecture"
Cohesion: 0.29
Nodes (6): Component Layout, Domains, Key Decisions, See Also, System Architecture, Tech Stack

### Community 207 - "Auth System"
Cohesion: 0.29
Nodes (6): Auth System, Models, Permission Model, Related Systems, Roles, Token Flow

### Community 208 - "Phase 3: Backend — New Unified Requests Router"
Cohesion: 0.33
Nodes (6): Phase 3: Backend — New Unified Requests Router, Task 10: Implement helpers (SN generator, history logger), Task 11: Implement new /requests router (CRUD + list + filters), Task 12: New /request-receipts router, Task 13: Register new routers in main.py, Task 9: Create shared schemas (Pydantic)

### Community 209 - "Phase 7: Frontend — Unified /requests page"
Cohesion: 0.33
Nodes (6): Phase 7: Frontend — Unified /requests page, Task 22: TypeTabs component, Task 23: Customer-dispatch block (used inside the unified form), Task 24: Unified request form (create/edit), Task 25: Request detail drawer, Task 26: Rewrite /dashboard/requests page

### Community 210 - "Inventory System"
Cohesion: 0.33
Nodes (5): Audit Trails, Inventory System, Inventory Types, Related Systems, User Permissions

### Community 211 - "Logistics System"
Cohesion: 0.33
Nodes (5): Access Control, Logistics System, Models, Receipt Lifecycle, Related Systems

### Community 212 - "Procurement System"
Cohesion: 0.33
Nodes (5): GRN Flow, Models, Procurement System, Purchase Order Lifecycle, Related Systems

### Community 213 - "OneFlow Fresh Machine Setup Guide"
Cohesion: 0.40
Nodes (5): Backend Python Pinned Requirements, Two-Token JWT Auth Flow (access + HttpOnly refresh), OneFlow Fresh Machine Setup Guide, Self-Signed CA + PWA Architecture, NSSM-based Windows Service Wrapper

### Community 214 - "Production System"
Cohesion: 0.40
Nodes (4): Models, Production System, Related Systems, Workflow

### Community 215 - "Prerequisites — What to Download"
Cohesion: 0.40
Nodes (5): 1. Python 3.11 or newer, 2. Node.js 18 LTS or newer, 3. OpenSSL (recommended — needed for trusted HTTPS / PWA), 4. Git (optional — only needed for pulling updates), Prerequisites — What to Download

### Community 216 - "RequestHistory"
Cohesion: 0.83
Nodes (3): _create_request(), test_list_requests_is_limited_to_user_departments(), test_list_requests_paginates_with_limit_and_offset()

### Community 217 - "Phase 4: Backend — Shim Routers (back-compat)"
Cohesion: 0.50
Nodes (4): Phase 4: Backend — Shim Routers (back-compat), Task 14: Convert `purchase_requests` router to shim, Task 15: Convert `marketing_requests` router to shim, Task 16: Convert `receipts` router to shim

### Community 218 - "Phase 5: Backend — Integration Tests for new router"
Cohesion: 0.50
Nodes (4): Phase 5: Backend — Integration Tests for new router, Task 17: End-to-end test for /api/v1/requests, Task 18: End-to-end test for /api/v1/request-receipts, Task 19: Run full backend test suite

### Community 219 - "Phase 8: Frontend — Redirects + Sidebar + Receipts"
Cohesion: 0.50
Nodes (4): Phase 8: Frontend — Redirects + Sidebar + Receipts, Task 27: Convert old /purchase-requests and /marketing-requests pages to redirects, Task 28: Update /receipts page to use new API, Task 29: Update sidebar + bottom-nav badges

### Community 220 - "README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

### Community 224 - "tabs.tsx"
Cohesion: 0.40
Nodes (5): Tabs(), TabsContent(), TabsList(), tabsListVariants, TabsTrigger()

## Knowledge Gaps
- **845 isolated node(s):** `$schema`, `.opencode/plugins/graphify.js`, `oneflow-backend`, `InventoryItem`, `PaginatedInventory` (+840 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **74 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `get_session()` connect `Database Session and Auth Core` to `Spare Parts Data Model`, `Community 34`, `Departments and Inventory History`, `Consumables Data Model`, `get_linkable_pr_items`, `Community 39`, `Community 42`, `Auth and Inventory Module`, `Community 46`, `Combobox UI Component`, `Community 49`, `Supplier Job Model`, `Legacy Migrations and Scheduling`, `Community 112`, `Community 53`, `Receipts and Requests Model`, `Purchase Request Routes`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **Why does `User` connect `Departments and Inventory History` to `Spare Parts Data Model`, `Community 34`, `get_linkable_pr_items`, `Consumables Data Model`, `Linkable Purchase Requests`, `Database Session and Auth Core`, `BOM Edit Pages`, `Community 42`, `Auth and Inventory Module`, `Community 43`, `Community 46`, `Weeder Category Model`, `Combobox UI Component`, `Community 49`, `Legacy Migrations and Scheduling`, `Community 53`, `Community 60`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Why does `_seed_customers_from_schedules()` connect `Units and Vendors Model` to `Spare Parts Data Model`, `Combobox UI Component`, `Legacy Migrations and Scheduling`, `Community 55`, `Community 56`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Are the 136 inferred relationships involving `User` (e.g. with `get_current_user()` and `_auto_seed_if_empty()`) actually correct?**
  _`User` has 136 INFERRED edges - model-reasoned connections that need verification._
- **Are the 115 inferred relationships involving `Unit` (e.g. with `BomCloneBody` and `BomItemCreate`) actually correct?**
  _`Unit` has 115 INFERRED edges - model-reasoned connections that need verification._
- **Are the 96 inferred relationships involving `InventoryItem` (e.g. with `get_linkable_pr_items()` and `BomCloneBody`) actually correct?**
  _`InventoryItem` has 96 INFERRED edges - model-reasoned connections that need verification._
- **What connects `$schema`, `.opencode/plugins/graphify.js`, `oneflow-backend` to the rest of the system?**
  _845 weakly-connected nodes found - possible documentation gaps or missing edges._