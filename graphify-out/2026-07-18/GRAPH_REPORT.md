# Graph Report - .  (2026-07-16)

## Corpus Check
- 303 files · ~232,754 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2483 nodes · 6906 edges · 194 communities (122 shown, 72 thin omitted)
- Extraction: 79% EXTRACTED · 21% INFERRED · 0% AMBIGUOUS · INFERRED: 1484 edges (avg confidence: 0.61)
- Token cost: 0 input · 0 output

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

## God Nodes (most connected - your core abstractions)
1. `cn()` - 151 edges
2. `User` - 136 edges
3. `get_session()` - 127 edges
4. `Unit` - 117 edges
5. `apiFetchJson()` - 97 edges
6. `InventoryItem` - 94 edges
7. `get_current_user()` - 77 edges
8. `Schedule` - 76 edges
9. `isAdminOrAbove()` - 68 edges
10. `InventoryHistory` - 65 edges

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

## Communities (194 total, 72 thin omitted)

### Community 0 - "Admin Dashboard Pages"
Cohesion: 0.04
Nodes (76): BomItem, Department, DeptRef, ROLE_BADGE_VARIANT, ROLE_LABELS, User, AttachmentItem, AttachmentsPage() (+68 more)

### Community 1 - "Spare Parts Data Model"
Cohesion: 0.10
Nodes (76): SQLModel, SpareCategory, SQLModel, Audit trail for every stock change on a SpareItem., SpareItemHistory, SQLModel, SpareItem, SQLModel (+68 more)

### Community 2 - "Departments and Inventory History"
Cohesion: 0.12
Nodes (56): Department, SQLModel, InventoryHistory, SQLModel, Audit trail for every stock change on an InventoryItem.      Written on: create,, JobCardHistory, SQLModel, Audit trail for every change on a JobCard.      One row per changed field per ed (+48 more)

### Community 3 - "New BOM Creation UI"
Cohesion: 0.05
Nodes (53): InventoryItem, PaginatedInventory, RMRow, BLANK_FORM(), blankDispatchItem(), CompanyInfo, Dispatch, DISPATCH_INV_TYPES (+45 more)

### Community 4 - "Consumables Data Model"
Cohesion: 0.09
Nodes (58): Consumable, ConsumableHistory, SQLModel, Audit trail for every stock change on a Consumable item., SQLModel, GatePassHistory, SQLModel, MarketingRequestHistory (+50 more)

### Community 5 - "Inventory Edit Pages"
Cohesion: 0.06
Nodes (50): EditInventoryPage(), ItemDetail, SFG_STORAGE_TYPES, STORAGE_TYPES, BLANK, ItemType, NewInventoryInner(), SFG_STORAGE_TYPES (+42 more)

### Community 6 - "Linkable Purchase Requests"
Cohesion: 0.09
Nodes (55): get_linkable_pr_items(), get_linkable_pr_or_404(), Session, Helpers for 'linkable' Purchase Requests — used by GRN creation., Load a PR, raising 404 if it doesn't exist, is soft-deleted, or isn't linkable., Return line items for a linkable PR, shaped like `LinkablePROut`.      The PR it, GRNRecord, GRNItem (+47 more)

### Community 7 - "Database Session and Auth Core"
Cohesion: 0.12
Nodes (57): get_session(), Session, Require admin or super_admin role., require_admin(), add_process(), bom_preview(), _calculated_hours_from_produced_qty(), _check_backward_status() (+49 more)

### Community 8 - "Inventory Detail Pages"
Cohesion: 0.05
Nodes (45): DeptForm, BomRequirement, BomUsage, fmt(), InventoryDetailPage(), ItemDetail, ScheduleEntry, STATUS_BADGE (+37 more)

### Community 9 - "Requests Page UI"
Cohesion: 0.07
Nodes (43): DeptRef, errorMessage(), REQUEST_TYPE_LABELS, requestDirectionForUser(), RequestsPage(), STATUS_BADGES, ApiRecord, DEFAULT_ITEM (+35 more)

### Community 10 - "BOM Edit Pages"
Cohesion: 0.08
Nodes (39): BomDetail, EditBomPage(), InventoryItem, PaginatedInventory, NewBomForm(), BomPage(), EditDepartmentPage(), NewDepartmentPage() (+31 more)

### Community 11 - "Layout and Empty State Components"
Cohesion: 0.07
Nodes (37): EmptyState(), EmptyStateProps, PageShell(), PageShellProps, AlertDialogMedia(), AlertDialogOverlay(), Breadcrumb(), BreadcrumbEllipsis() (+29 more)

### Community 12 - "Auth and Inventory Module"
Cohesion: 0.14
Nodes (39): get_current_user(), Session, InventoryItem, SQLModel, adjust_stock(), AdjustStockBody, _compute_extra(), create_item() (+31 more)

### Community 13 - "Purchase Request Item Model"
Cohesion: 0.08
Nodes (40): PurchaseRequestItem, SQLModel, Line item for a purchase request., SQLModel, Change log entry for a Request., RequestHistory, _build_pr_id_to_new_req_id(), _generate_sn() (+32 more)

### Community 14 - "Weeder Category Model"
Cohesion: 0.16
Nodes (40): SQLModel, Top-level category for weeder inventory (e.g. 'Weeder Power Machine')., WeederCategory, SQLModel, Audit trail for every stock change on a Weeder item., WeederHistory, SQLModel, Weeder inventory sub-item (belongs to a WeederCategory). (+32 more)

### Community 15 - "Superpowers Design Specs"
Cohesion: 0.05
Nodes (44): migrate_unified_request.py data migration script, RequestCustomerDispatch SQLModel (1:1 child of Request), RequestHistory SQLModel (audit log), RequestItem SQLModel (replaces PurchaseRequestItem), Request SQLModel (replaces PurchaseRequest), RequestReceipt SQLModel (renamed from Receipt), request_type enum: internal_transfer | vendor_purchase | customer_dispatch, requests router (/api/v1/requests) (+36 more)

### Community 16 - "Combobox UI Component"
Cohesion: 0.07
Nodes (34): ComboboxChip(), ComboboxChips(), ComboboxChipsInput(), ComboboxClear(), ComboboxContent(), ComboboxEmpty(), ComboboxGroup(), ComboboxInput() (+26 more)

### Community 17 - "Units and Vendors Model"
Cohesion: 0.15
Nodes (36): SQLModel, Unit, SQLModel, Registered vendors / OEM clients.     Schedules reference vendors by name; this, Vendor, AttachmentLowStockItem, ConsumableLowStockItem, DashboardResponse (+28 more)

### Community 18 - "Supplier Job Model"
Cohesion: 0.14
Nodes (34): SQLModel, Job / process a supplier performs for us (e.g. laser cutting, powder coating)., SupplierJob, SQLModel, Material / raw material a supplier provides to us., SupplierMaterial, SQLModel, Suppliers: companies that provide parts/materials AND may perform job work. (+26 more)

### Community 19 - "Legacy Migrations and Scheduling"
Cohesion: 0.16
Nodes (29): One-time idempotent migration: copy unique customer_name values from existing, _seed_customers_from_schedules(), SQLModel, Audit trail for schedule status changes., ScheduleHistory, SQLModel, Schedule, check_availability() (+21 more)

### Community 20 - "Request Items and Router"
Cohesion: 0.16
Nodes (34): SQLModel, Line item for a Request.      Used for internal_transfer and vendor_purchase typ, RequestItem, accept_fulfilment(), accept_item(), _apply_department_visibility_filter(), _apply_visibility_filter(), _build_read() (+26 more)

### Community 21 - "Dashboard Layout and Auth Guard"
Cohesion: 0.09
Nodes (27): AuthGuard(), ADMIN_MORE_NAV, BottomNav(), GENERAL_MORE_NAV, NavItem, PRIMARY_NAV, ADMIN_CORE_NAV, ADMIN_NAV (+19 more)

### Community 22 - "Receipts and Requests Model"
Cohesion: 0.16
Nodes (31): SQLModel, Goods Receipt — records delivery of items for an internal transfer request., Receipt, SQLModel, Unified request: internal transfer | vendor purchase | customer dispatch.      R, Request, _build_receipt_read(), create_department_receipts_for_request() (+23 more)

### Community 23 - "Receipts Test Suite"
Cohesion: 0.09
Nodes (33): Tests for Receipt creation, signoff, and dispute workflow., Accepting the auto-created receipt closes the linked request., Short delivered quantities are recorded and still close the request once signed, Receipt can be created with item-level quantity_delivered., Only the original requester or an admin can sign off a receipt., The original requester can sign off a receipt., When all active receipts for a request are signed off, status → received., Receipt list respects visibility: requester sees their own, fulfiller sees dept (+25 more)

### Community 24 - "Inventory Spares PDF Data"
Cohesion: 0.08
Nodes (32): Inventory Spares Demo Hand-Drawn Schematic, Spare Category: Auger (hand push, single wheel, trolley type), Spare Category: Engines (Petrol + Diesel variants), Spare Category: Fast Weeder (model series 91-XX), Spare Category: Gearbox (Centre Rotary + Back Rotary), Inventory UI Form Spec (Main Screen + Add Inventory Item fields), Spare Category: Reaper (model 400), Spare Category: Stubble Mover (AS-170 / 60-C177 engines) (+24 more)

### Community 25 - "Production and Jobs UI"
Cohesion: 0.08
Nodes (27): CHANGE_ICON, ConsumableLowStockItem, DashboardData, DashboardPage(), fmtCurrencyFull(), fmtCurrencyShort(), formatType(), InventoryByType (+19 more)

### Community 26 - "GRN and Dispatch Logic"
Cohesion: 0.19
Nodes (26): AttachmentItem, AttachmentHistory, SQLModel, Audit trail for every stock change on an Attachment item., AttachmentItem, SQLModel, Attachment inventory item., adjust_attachment_stock() (+18 more)

### Community 27 - "Request Approval Workflow"
Cohesion: 0.07
Nodes (28): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+20 more)

### Community 28 - "Stock Adjustment Module"
Cohesion: 0.12
Nodes (23): BLANK, CompanyInfo, UnitItem, JobCard, JobCardsListInner(), ProcessItem, ProductionOrder, STATUS_BADGE (+15 more)

### Community 29 - "Purchase Request Routes"
Cohesion: 0.21
Nodes (23): Dispatch, DispatchHistory, SQLModel, DispatchItem, SQLModel, SQLModel, create_dispatch(), delete_dispatch() (+15 more)

### Community 30 - "Community 30"
Cohesion: 0.10
Nodes (25): BLANK_ITEM, BLANK_SUB, CatsPage, fmtQty(), fmtRate(), highlight(), isLow(), ItemsPage (+17 more)

### Community 31 - "Community 31"
Cohesion: 0.11
Nodes (25): ApiRecord, BLANK_FORM(), BLANK_ITEM(), CompanyInfo, fetchInventoryItems(), INVENTORY_LABELS, INVENTORY_TYPES, InventoryItem (+17 more)

### Community 32 - "Community 32"
Cohesion: 0.11
Nodes (23): CompanyInfo, receiptDirectionForUser(), receiptSignoffSummary(), ReceiptsPage(), STATUS_BADGES, STATUS_ICONS, errorMessage(), formatDateTime() (+15 more)

### Community 33 - "Community 33"
Cohesion: 0.12
Nodes (20): alembic_version_exists(), init_db(), Create all tables from SQLModel metadata. Called on startup.      For fresh data, Run Alembic migrations to bring the database to the latest revision., Stamp the database at the current Alembic head (for legacy catch-up)., Check if the alembic_version table exists (i.e., DB is already Alembic-managed)., run_alembic_upgrade(), stamp_alembic_head() (+12 more)

### Community 34 - "Community 34"
Cohesion: 0.21
Nodes (20): BomItem, SQLModel, Bill of Materials — maps a product name to required raw materials.      product_, BomCloneBody, BomItemCreate, BomItemResponse, BomItemUpdate, clone_bom() (+12 more)

### Community 35 - "Community 35"
Cohesion: 0.14
Nodes (22): create_user_with_dept(), login(), A user in the requester's department can identify receipt source/target context., Delivery splits receipts by line-item department and closes only after all are s, test_multi_department_request_creates_department_receipts(), test_receipt_list_includes_request_direction_context_for_source_department_user(), Tests for internal_transfer request with from_department auto-stamping., customer_dispatch does NOT auto-stamp from_department (not applicable). (+14 more)

### Community 36 - "Community 36"
Cohesion: 0.09
Nodes (23): JobCard.actual_qty Field, Job Card Detail Page and Actual Qty Design, FG Auto-completion Cascade Bug, Backend Python Pinned Requirements, OneFlow ERP Application Flow Map, Idempotent _migrate_*() Function Pattern, Two-Token JWT Auth Flow (access + HttpOnly refresh), RBAC Roles & Permissions Matrix (+15 more)

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
Nodes (18): GatePass, GatePassItem, SQLModel, SQLModel, create_gate_pass(), delete_gate_pass(), get_gate_pass(), list_gate_passes() (+10 more)

### Community 41 - "Community 41"
Cohesion: 0.35
Nodes (19): PurchaseOrder, PurchaseOrderItem, SQLModel, cancel_po(), create_po(), get_po(), list_linkable_pos(), list_pos() (+11 more)

### Community 42 - "Community 42"
Cohesion: 0.24
Nodes (18): hash_token(), SHA-256 hash of a token for safe DB storage., SQLModel, RefreshToken, _clear_refresh_cookie(), login(), LoginRequest, logout() (+10 more)

### Community 43 - "Community 43"
Cohesion: 0.27
Nodes (19): _build_response(), create_user(), delete_user(), DeptRef, get_user(), _get_user_departments(), list_users(), _parse_csv() (+11 more)

### Community 44 - "Community 44"
Cohesion: 0.14
Nodes (15): avatarColor(), BLANK_CREATE, daysUntil(), fmtDate(), Initials(), STATUS_DOT, VendorsPage(), VendorSummary (+7 more)

### Community 45 - "Community 45"
Cohesion: 0.18
Nodes (18): _arm_timer(), _backup_dir_for(), cleanup_old_backups(), _db_path(), perform_backup(), datetime, Database backup scheduler.  Schedule:   - 17:30 (5:30 PM) every day: take a safe, Return the number of seconds until the next 17:30:00 (today or tomorrow). (+10 more)

### Community 46 - "Community 46"
Cohesion: 0.25
Nodes (18): create_department(), delete_department(), DepartmentCreate, DepartmentResponse, DepartmentUpdate, DeptSimple, get_department(), list_departments() (+10 more)

### Community 47 - "Community 47"
Cohesion: 0.19
Nodes (17): BaseModel, Pydantic schemas for the unified Request API., RequestAcknowledgeDeliveryAction, RequestCreate, RequestCustomerDispatchCreate, RequestCustomerDispatchRead, RequestDeliverAction, RequestDeliverItemAction (+9 more)

### Community 48 - "Community 48"
Cohesion: 0.11
Nodes (19): @base-ui/react, class-variance-authority, clsx, dependencies, @base-ui/react, class-variance-authority, clsx, next (+11 more)

### Community 49 - "Community 49"
Cohesion: 0.26
Nodes (16): Notification, SQLModel, list_notifications(), mark_all_read(), mark_read(), NotificationOut, _out(), BaseModel (+8 more)

### Community 50 - "Community 50"
Cohesion: 0.24
Nodes (16): SQLModel, Configurable work-type categories for time tracking.      Managed by admins; ref, WorkType, create_work_type(), delete_work_type(), list_work_types(), BaseModel, Depends (+8 more)

### Community 51 - "Community 51"
Cohesion: 0.14
Nodes (13): fmtDate(), HEADERS, HistoryCard(), HistoryItem, HistoryPage, INITIAL_TAB_STATE, InventoryColumns(), QtyColumns() (+5 more)

### Community 52 - "Community 52"
Cohesion: 0.16
Nodes (15): CustomerDispatchBlock(), CustomerDispatchBlockProps, SnItem, Select(), SelectContent(), SelectGroup(), SelectItem(), SelectLabel() (+7 more)

### Community 53 - "Community 53"
Cohesion: 0.25
Nodes (16): create_vendor(), get_vendor_detail(), list_vendor_names(), list_vendors(), _product_summary(), Any, Depends, Session (+8 more)

### Community 54 - "Community 54"
Cohesion: 0.12
Nodes (17): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/node (+9 more)

### Community 55 - "Community 55"
Cohesion: 0.12
Nodes (15): _migrate_company_settings(), _migrate_departments_purchase_request_access(), _migrate_grn_v2(), _migrate_job_card_worker_names(), _migrate_po_vendor_fields(), _migrate_purchase_request_items(), _migrate_spare_item_v2(), Legacy database migrations — one-time catch-up for pre-Alembic databases.  This (+7 more)

### Community 56 - "Community 56"
Cohesion: 0.12
Nodes (16): _migrate_attachment_tables(), _migrate_job_card_worker_id(), _migrate_production_plan_v2(), _migrate_purchase_request_tables(), _migrate_spare_item_history(), _migrate_spare_item_v3(), _migrate_user_access_flags(), Add worker_id FK column to job_card table if it doesn't exist.     Also back-fil (+8 more)

### Community 57 - "Community 57"
Cohesion: 0.16
Nodes (11): currentMonthStart(), DateBreakdown, fmtDate(), MachineBreakdown, OrderBreakdown, ProcessBreakdown, TimeReportPage(), todayStr() (+3 more)

### Community 58 - "Community 58"
Cohesion: 0.30
Nodes (14): DispatchStatus, GatePassStatus, is_admin_or_above(), JobCardStatus, OrderStatus, PlanStatus, PurchaseOrderStatus, Enums for roles, request statuses, and other string constants.  Replaces scatter (+6 more)

### Community 59 - "Community 59"
Cohesion: 0.32
Nodes (14): get_current_active_user(), is_admin_or_above(), Depends, User, Require purchase_access flag on the user (or admin/super_admin)., Require super_admin role only., Require grn_access flag on the user (or admin/super_admin)., Require dispatch_access flag on the user (or admin/super_admin). (+6 more)

### Community 60 - "Community 60"
Cohesion: 0.21
Nodes (14): create_notification(), Create a notification for a user. Called from other routers., acknowledge_delivery(), delete_request(), generate_sn(), log_history(), notify_department_users(), _prefix_for() (+6 more)

### Community 61 - "Community 61"
Cohesion: 0.20
Nodes (13): CHANGE_LABELS, fmtDate(), fmtDateTime(), fmtQty(), HistoryEntry, InventoryItem, InventoryTypePage(), isLow() (+5 more)

### Community 62 - "Community 62"
Cohesion: 0.35
Nodes (11): create_purchase_request(), delete_purchase_request(), get_purchase_request(), list_purchase_requests(), Session, User, Shim router for /api/v1/purchase-requests.  Delegates to the unified /api/v1/req, List internal_transfer + vendor_purchase requests.      Fetches each type separa (+3 more)

### Community 63 - "Community 63"
Cohesion: 0.17
Nodes (8): CERTS_DIR, fs, http, https, net, path, server, tlsOptions

### Community 64 - "Community 64"
Cohesion: 0.25
Nodes (9): _build_payload(), create_access_token(), create_refresh_token(), decode_token(), Raises jwt.PyJWTError on invalid/expired tokens., verify_password(), future_date(), OneFlow comprehensive seed script. Wipes the database and re-creates it with rea (+1 more)

### Community 65 - "Community 65"
Cohesion: 0.36
Nodes (10): create_marketing_request(), delete_marketing_request(), get_marketing_request(), list_marketing_requests(), Session, User, Shim router for /api/v1/marketing-requests.  Delegates to the unified /api/v1/re, List customer_dispatch requests.      Fetches the single allowed type. (Same pat (+2 more)

### Community 66 - "Community 66"
Cohesion: 0.27
Nodes (10): admin_token(), create_admin(), create_dept(), prod_dept(), Department, User, qa_dept(), Pytest fixtures for OneFlow backend — in-memory SQLite, transaction-isolated per (+2 more)

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
Cohesion: 0.29
Nodes (6): figtree, geistMono, geistSans, metadata, RootLayout(), viewport

### Community 77 - "Community 77"
Cohesion: 0.29
Nodes (5): STATUS_COLOR_VAR, STATUS_DOT_CLASS, STATUS_LABEL, StatusBarProps, StatusBreakdown

### Community 78 - "Community 78"
Cohesion: 0.43
Nodes (5): ToggleGroup(), ToggleGroupContext, ToggleGroupItem(), Toggle(), toggleVariants

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
Cohesion: 0.33
Nodes (3): Popover(), PopoverContent(), PopoverTrigger()

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
Cohesion: 0.83
Nodes (4): Dispatch Card Enhancements Design Doc, Inline Status Dropdown (replace static badge), Dispatch Print Button (mirrors gate-pass print), Dispatch Card Enhancements Implementation Plan

### Community 91 - "Community 91"
Cohesion: 0.83
Nodes (3): _col_exists(), downgrade(), upgrade()

### Community 92 - "Community 92"
Cohesion: 0.83
Nodes (3): _col_exists(), downgrade(), upgrade()

### Community 93 - "Community 93"
Cohesion: 0.67
Nodes (3): SQLModel, Line item for a Receipt — links to a RequestItem and records delivered/signed-of, ReceiptItem

### Community 94 - "Community 94"
Cohesion: 0.67
Nodes (3): SQLModel, Customer-dispatch child entity (1:1 with Request when request_type=customer_disp, RequestCustomerDispatch

### Community 95 - "Community 95"
Cohesion: 0.67
Nodes (3): SQLModel, Per-job-card time entry linking a worker (user) to hours and work type.      Eac, WorkLog

### Community 96 - "Community 96"
Cohesion: 0.50
Nodes (4): Apply shadcn preset b1tzNKAUa Plan, Corporate Blue OKLCH Token Palette, UI Redesign Implementation Plan (Blue Modern Soft), Token-First Redesign Strategy

### Community 97 - "Community 97"
Cohesion: 0.50
Nodes (4): GRN item click race bug (setTimeout onBlur), SearchCombobox shared component (plain + list variants), useDebouncedSearch hook, Work Time Report search bug (base-ui filter no-op)

### Community 98 - "Community 98"
Cohesion: 0.50
Nodes (3): plugin, $schema, .opencode/plugins/graphify.js

### Community 105 - "Community 105"
Cohesion: 0.67
Nodes (3): client(), TestClient, FastAPI TestClient that uses the isolated per-test session.

### Community 107 - "Community 107"
Cohesion: 0.67
Nodes (3): GRN & Work-Time Bug Fixes Plan, GRN Linkable PR Items Endpoint, SearchCombobox + useDebouncedSearch Primitives

### Community 108 - "Community 108"
Cohesion: 0.67
Nodes (3): GatePass link purchase order (purchase_order_id + po_number fields), GRN link purchase order (auto-fill items), Fix PO auto-fill from PR (use PR detail endpoint with items)

### Community 115 - "Community 115"
Cohesion: 0.67
Nodes (3): pnpm workspace config (frontend/ root), sharp build allow-list entry, unrs-resolver build allow-list entry

### Community 116 - "Community 116"
Cohesion: 0.67
Nodes (3): Department model (org departments, handles_customer_dispatch flag), UserDepartment model (M2M user-department), User model (users table)

### Community 117 - "Community 117"
Cohesion: 0.67
Nodes (3): HttpOnly refresh token cookie, auth-guard.tsx (frontend auth wrapper), frontend lib/auth.ts (token storage)

## Knowledge Gaps
- **529 isolated node(s):** `$schema`, `.opencode/plugins/graphify.js`, `oneflow-backend`, `InventoryItem`, `PaginatedInventory` (+524 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **72 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `get_session()` connect `Database Session and Auth Core` to `Departments and Inventory History`, `Consumables Data Model`, `Auth and Inventory Module`, `Units and Vendors Model`, `Supplier Job Model`, `Legacy Migrations and Scheduling`, `Receipts and Requests Model`, `Purchase Request Routes`, `Community 33`, `Community 34`, `Community 39`, `Community 40`, `Community 41`, `Community 42`, `Community 43`, `Community 46`, `Community 49`, `Community 50`, `Community 53`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Why does `User` connect `Departments and Inventory History` to `Community 33`, `Community 34`, `Spare Parts Data Model`, `Consumables Data Model`, `Linkable Purchase Requests`, `Database Session and Auth Core`, `Community 42`, `Community 43`, `Auth and Inventory Module`, `Community 46`, `Weeder Category Model`, `Units and Vendors Model`, `Community 49`, `Legacy Migrations and Scheduling`, `Community 50`, `GRN and Dispatch Logic`, `Community 60`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Why does `_seed_customers_from_schedules()` connect `Legacy Migrations and Scheduling` to `Community 56`, `Units and Vendors Model`, `Community 33`, `Community 55`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Are the 134 inferred relationships involving `User` (e.g. with `get_current_user()` and `_auto_seed_if_empty()`) actually correct?**
  _`User` has 134 INFERRED edges - model-reasoned connections that need verification._
- **Are the 115 inferred relationships involving `Unit` (e.g. with `BomCloneBody` and `BomItemCreate`) actually correct?**
  _`Unit` has 115 INFERRED edges - model-reasoned connections that need verification._
- **What connects `$schema`, `.opencode/plugins/graphify.js`, `oneflow-backend` to the rest of the system?**
  _529 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Admin Dashboard Pages` be split into smaller, more focused modules?**
  _Cohesion score 0.043599656357388314 - nodes in this community are weakly interconnected._