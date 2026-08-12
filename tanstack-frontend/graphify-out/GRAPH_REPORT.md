# Graph Report - tanstack-frontend  (2026-08-12)

## Corpus Check
- 114 files · ~141,746 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1138 nodes · 2756 edges · 58 communities (50 shown, 8 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 71 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `47864c6f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- routeTree.gen.ts
- user.ts
- dependencies
- devDependencies
- _auth.dashboard.inventory.index.tsx
- cn
- combobox.tsx
- compilerOptions
- _auth.dashboard.inventory.spares.tsx
- _auth.dashboard.grn.tsx
- request-form.tsx
- components.json
- _auth.dashboard.admin.users.tsx
- apiFetchJson
- _auth.dashboard.vendors.tsx
- _auth.dashboard.dispatch.tsx
- _auth.dashboard.purchase-orders.tsx
- _auth.dashboard.gate-passes.tsx
- inventory-type-page.tsx
- request-detail-dialog.tsx
- button.tsx
- _auth.dashboard.requests.tsx
- FileRoutesByPath
- customer-dispatch-block.tsx
- _auth.dashboard.inventory.$id.tsx
- _auth.dashboard.inventory.new.tsx
- _auth.dashboard.schedule.tsx
- _auth.dashboard.receipts.tsx
- _auth.dashboard.inventory.weeders.tsx
- stat-card.tsx
- _auth.dashboard.production.processing.$id.tsx
- _auth.dashboard.inventory.attachments.tsx
- _auth.dashboard.production.planning.tsx
- _auth.dashboard.production.processing.tsx
- page-header.tsx
- _auth.dashboard.inventory.consumables.tsx
- input-group.tsx
- _auth.dashboard.index.tsx
- requests.ts
- dialog.tsx
- isAdminOrAbove
- _auth.dashboard.production.planning.new.tsx
- _auth.dashboard.schedule.$id.edit.tsx
- _auth.dashboard.schedule.new.tsx
- manifest.json
- router.tsx
- utils.ts
- skeleton.tsx
- TanStack Start + shadcn/ui
- Route
- _auth.dashboard.tsx
- _auth.dashboard.inventory.finished-goods.tsx
- _auth.dashboard.inventory.scraps.tsx
- _auth.dashboard.inventory.semi-finished.tsx
- _auth.dashboard.inventory.spares.$id.tsx
- pwa-debug.tsx
- vite.config.ts

## God Nodes (most connected - your core abstractions)
1. `cn()` - 129 edges
2. `apiFetchJson()` - 90 edges
3. `FileRoutesByPath` - 62 edges
4. `isAdminOrAbove()` - 60 edges
5. `Button()` - 55 edges
6. `getCurrentUser()` - 53 edges
7. `PageHeader()` - 49 edges
8. `Skeleton()` - 39 edges
9. `Input()` - 37 edges
10. `Label()` - 31 edges

## Surprising Connections (you probably didn't know these)
- `useComboboxAnchor()` --references--> `react`  [EXTRACTED]
  src/components/ui/combobox.tsx → package.json
- `SearchCombobox()` --references--> `react`  [EXTRACTED]
  src/components/ui/search-combobox.tsx → package.json
- `useOutsidePointerDown()` --references--> `react`  [EXTRACTED]
  src/components/ui/search-combobox.tsx → package.json
- `BreadcrumbEllipsis()` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/breadcrumb.tsx → src/lib/utils.ts
- `CardDescription()` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/card.tsx → src/lib/utils.ts

## Import Cycles
- None detected.

## Communities (58 total, 8 thin omitted)

### Community 0 - "routeTree.gen.ts"
Cohesion: 0.02
Nodes (98): AuthDashboardAdminBomIdEditRoute, AuthDashboardAdminBomNewRoute, AuthDashboardAdminBomRoute, AuthDashboardAdminBomRouteChildren, AuthDashboardAdminBomRouteWithChildren, AuthDashboardAdminDepartmentsIdEditRoute, AuthDashboardAdminDepartmentsNewRoute, AuthDashboardAdminDepartmentsRoute (+90 more)

### Community 1 - "user.ts"
Cohesion: 0.05
Nodes (60): AuthGuard(), ADMIN_MORE_NAV, BottomNav(), GENERAL_MORE_NAV, NavItem, PRIMARY_NAV, ADMIN_CORE_NAV, ADMIN_NAV (+52 more)

### Community 2 - "dependencies"
Cohesion: 0.04
Nodes (49): @base-ui/react, class-variance-authority, clsx, @fontsource-variable/inter, @hugeicons/core-free-icons, @hugeicons/react, lucide-react, dependencies (+41 more)

### Community 3 - "devDependencies"
Cohesion: 0.04
Nodes (45): eslint, eslint-plugin-react-hooks, jsdom, devDependencies, eslint, eslint-plugin-react-hooks, jsdom, prettier (+37 more)

### Community 4 - "_auth.dashboard.inventory.index.tsx"
Cohesion: 0.06
Nodes (45): EXTRA_TONES, resolveTone(), StatCard(), StatCardProps, StatTone, CHART_COLORS, STATUS_BADGE_VARIANT, STATUS_BAR_COLOR (+37 more)

### Community 5 - "cn"
Cohesion: 0.10
Nodes (22): AlertDialogMedia(), AlertDialogOverlay(), DialogOverlay(), DropdownMenu(), DropdownMenuCheckboxItem(), DropdownMenuContent(), DropdownMenuItem(), DropdownMenuLabel() (+14 more)

### Community 6 - "combobox.tsx"
Cohesion: 0.09
Nodes (25): react, react, ComboboxChip(), ComboboxChips(), ComboboxChipsInput(), ComboboxClear(), ComboboxContent(), ComboboxEmpty() (+17 more)

### Community 7 - "compilerOptions"
Cohesion: 0.07
Nodes (27): DOM, DOM.Iterable, ES2022, eslint.config.js, prettier.config.js, **/*.ts, **/*.tsx, vite/client (+19 more)

### Community 8 - "_auth.dashboard.inventory.spares.tsx"
Cohesion: 0.17
Nodes (15): canEditInventory(), BLANK_SUB, CatsPage, fmtQty(), fmtRate(), highlight(), isLow(), ItemsPage (+7 more)

### Community 9 - "_auth.dashboard.grn.tsx"
Cohesion: 0.09
Nodes (19): fmtDate(), fmtDateTime(), FormItemRow, GRNItem, GRNPage(), GRNRecord, GrnSavePayload, INV_TYPE_OPTIONS (+11 more)

### Community 10 - "request-form.tsx"
Cohesion: 0.11
Nodes (25): ApiRecord, DEFAULT_ITEM, DeptRef, fetchInventoryItems(), getPermittedTypes(), InventoryItem, ITEM_TYPE_LABELS, itemRows() (+17 more)

### Community 11 - "components.json"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 12 - "_auth.dashboard.admin.users.tsx"
Cohesion: 0.12
Nodes (29): AlertDialog(), AlertDialogAction(), AlertDialogCancel(), AlertDialogContent(), AlertDialogDescription(), AlertDialogFooter(), AlertDialogHeader(), AlertDialogTitle() (+21 more)

### Community 13 - "apiFetchJson"
Cohesion: 0.12
Nodes (14): AttachmentLowStockItem, CompanyInfo, ConsumableLowStockItem, InventoryLowItem, LowStockPayload, PaginatedInventory, Route, SpareLowStockItem (+6 more)

### Community 14 - "_auth.dashboard.vendors.tsx"
Cohesion: 0.07
Nodes (33): Sheet(), SheetContent(), SheetDescription(), SheetFooter(), SheetHeader(), SheetOverlay(), SheetTitle(), CHANGE_LABELS (+25 more)

### Community 15 - "_auth.dashboard.dispatch.tsx"
Cohesion: 0.11
Nodes (19): BLANK_FORM(), blankDispatchItem(), CompanyInfo, Dispatch, DISPATCH_INV_TYPES, DispatchAPIItem, DispatchForm(), DispatchFormState (+11 more)

### Community 16 - "_auth.dashboard.purchase-orders.tsx"
Cohesion: 0.14
Nodes (20): ApiRecord, BLANK_FORM(), BLANK_ITEM(), fetchInventoryItems(), INVENTORY_LABELS, INVENTORY_TYPES, InventoryItem, itemRows() (+12 more)

### Community 17 - "_auth.dashboard.gate-passes.tsx"
Cohesion: 0.12
Nodes (17): BLANK_FORM(), blankGPItem(), CompanyInfo, GatePass, GatePassAPIItem, GatePassesPage(), GatePassHistoryEntry, GP_INV_TYPES (+9 more)

### Community 18 - "inventory-type-page.tsx"
Cohesion: 0.11
Nodes (11): dynTo(), fmtDate(), fmtDateTime(), fmtQty(), InventoryTypePage(), isLow(), isShortfall(), Route (+3 more)

### Community 19 - "request-detail-dialog.tsx"
Cohesion: 0.15
Nodes (18): errorMessage(), formatDateTime(), HISTORY_LABELS, HISTORY_TONE, LIFECYCLE_STEPS, lifecycleIndex(), receiptSummary(), REQUEST_TYPE_META (+10 more)

### Community 20 - "button.tsx"
Cohesion: 0.16
Nodes (14): Input(), Label(), BomDetail, BomFormState, dynTo(), EditBomPage(), InventoryItem, PaginatedInventory (+6 more)

### Community 21 - "_auth.dashboard.requests.tsx"
Cohesion: 0.16
Nodes (15): TABS, TypeTabs(), TypeTabsProps, TypeTabsValue, DialogTrigger(), DeptRef, errorMessage(), normalizeTab() (+7 more)

### Community 22 - "FileRoutesByPath"
Cohesion: 0.10
Nodes (17): Route, Route, Route, Route, Route, Route, Route, Route (+9 more)

### Community 23 - "customer-dispatch-block.tsx"
Cohesion: 0.20
Nodes (12): CustomerDispatchBlockProps, SnItem, SelectContent(), SelectGroup(), SelectItem(), SelectLabel(), SelectScrollDownButton(), SelectScrollUpButton() (+4 more)

### Community 24 - "_auth.dashboard.inventory.$id.tsx"
Cohesion: 0.15
Nodes (12): BomRequirement, BomUsage, dynTo(), fmt(), InventoryDetailPage(), ItemDetail, Route, ScheduleEntry (+4 more)

### Community 25 - "_auth.dashboard.inventory.new.tsx"
Cohesion: 0.15
Nodes (15): BLANK_ITEM_FORM, ItemForm(), ItemFormProps, ItemFormState, SFG_STORAGE_TYPES, STORAGE_TYPES, TYPE_LABELS, EditInventoryPage() (+7 more)

### Community 26 - "_auth.dashboard.schedule.tsx"
Cohesion: 0.23
Nodes (11): dynTo(), fmt(), fmtDate(), fmtDateTime(), PaginatedSchedules, ScheduleHistoryEntry, ScheduleItem, SchedulePage() (+3 more)

### Community 27 - "_auth.dashboard.receipts.tsx"
Cohesion: 0.20
Nodes (12): CreateReceiptPayload, Receipt, ReceiptItem, receiptsApi, ReceiptStatus, errorMessage(), receiptDirectionForUser(), receiptSignoffSummary() (+4 more)

### Community 28 - "_auth.dashboard.inventory.weeders.tsx"
Cohesion: 0.19
Nodes (12): CAT_BLANK, CategoryRowProps, displayName(), fmtDate(), fmtQty(), fmtRate(), HistoryEntry, ITEM_BLANK (+4 more)

### Community 29 - "stat-card.tsx"
Cohesion: 0.12
Nodes (24): Table(), TableBody(), TableCaption(), TableCell(), TableFooter(), TableHead(), TableHeader(), TableRow() (+16 more)

### Community 30 - "_auth.dashboard.production.processing.$id.tsx"
Cohesion: 0.10
Nodes (27): PageHeader(), Button(), buttonVariants, Dialog(), DialogContent(), DialogDescription(), DialogFooter(), DialogHeader() (+19 more)

### Community 31 - "_auth.dashboard.inventory.attachments.tsx"
Cohesion: 0.27
Nodes (9): AttachmentDocument, AttachmentItem, AttachmentsPage(), BLANK, displayName(), fmtDate(), fmtRate(), HistoryEntry (+1 more)

### Community 32 - "_auth.dashboard.production.planning.tsx"
Cohesion: 0.11
Nodes (21): CustomerDispatchBlock(), apiFetchJson(), isAdminOrAbove(), BomPage(), dynTo(), dynTo(), NewBomPage(), DepartmentsPage() (+13 more)

### Community 33 - "_auth.dashboard.production.processing.tsx"
Cohesion: 0.14
Nodes (15): dynTo(), fmtDate(), HEADERS, HistoryCard(), HistoryItem, HistoryPage, INITIAL_TAB_STATE, InventoryColumns() (+7 more)

### Community 34 - "page-header.tsx"
Cohesion: 0.27
Nodes (9): Crumb, PageHeaderProps, Breadcrumb(), BreadcrumbEllipsis(), BreadcrumbItem(), BreadcrumbLink(), BreadcrumbList(), BreadcrumbPage() (+1 more)

### Community 35 - "_auth.dashboard.inventory.consumables.tsx"
Cohesion: 0.15
Nodes (14): CHANGE_LABELS, HistoryEntry, InventoryItem, PaginatedInventory, Props, ScheduleItem, Badge(), badgeVariants (+6 more)

### Community 36 - "input-group.tsx"
Cohesion: 0.24
Nodes (9): InputGroup(), InputGroupAddon(), inputGroupAddonVariants, InputGroupButton(), inputGroupButtonVariants, InputGroupInput(), InputGroupText(), InputGroupTextarea() (+1 more)

### Community 37 - "_auth.dashboard.index.tsx"
Cohesion: 0.15
Nodes (12): currentMonthStart(), DateBreakdown, fmtDate(), MachineBreakdown, OrderBreakdown, ProcessBreakdown, Route, TimeReportPage() (+4 more)

### Community 38 - "requests.ts"
Cohesion: 0.15
Nodes (15): avatarColor(), daysUntil(), dynTo(), FGItem, fmt(), fmtDate(), POEntry, ProductSummary (+7 more)

### Community 39 - "dialog.tsx"
Cohesion: 0.36
Nodes (9): companyPrintHeaderHtml(), CompanyPrintInfo, escapeHtml(), getCompanyPrintHeaderHtml(), loadCompanyPrintInfo(), openPrintWindow(), PrintMode, PrintOptions (+1 more)

### Community 40 - "isAdminOrAbove"
Cohesion: 0.33
Nodes (6): dynTo(), NewProductionOrderPage(), PaginatedPlans, ProcessItem, ProductionPlan, Route

### Community 41 - "_auth.dashboard.production.planning.new.tsx"
Cohesion: 0.22
Nodes (9): BLANK, dynTo(), LocalProcess, MaterialRequirement, NewPlanPage(), PaginatedSchedules, PlanCreatedResponse, Route (+1 more)

### Community 42 - "_auth.dashboard.schedule.$id.edit.tsx"
Cohesion: 0.24
Nodes (9): Availability, CustomerOption, dynTo(), EditSchedulePage(), FGItem, RmRequirement, Route, ScheduleDetail (+1 more)

### Community 43 - "_auth.dashboard.schedule.new.tsx"
Cohesion: 0.25
Nodes (8): Availability, BLANK, CustomerOption, dynTo(), FGItem, NewSchedulePage(), RmRequirement, Route

### Community 44 - "manifest.json"
Cohesion: 0.25
Nodes (7): background_color, display, icons, name, short_name, start_url, theme_color

### Community 45 - "router.tsx"
Cohesion: 0.24
Nodes (9): createQueryClient(), defaultQueryFn(), QueryKeyWithOptions, getRouter(), Register, RouterContext, @tanstack/react-router, Register (+1 more)

### Community 46 - "utils.ts"
Cohesion: 0.22
Nodes (9): dynTo(), EditPlanPage(), MaterialRequirement, PaginatedSchedules, PlanData, PlanForm, ProcessItem, Route (+1 more)

### Community 47 - "skeleton.tsx"
Cohesion: 0.27
Nodes (8): avatarColor(), BLANK_JOB, dynTo(), fmt(), Route, SupplierDetail, SupplierDetailPage(), SupplierJob

### Community 48 - "TanStack Start + shadcn/ui"
Cohesion: 0.50
Nodes (3): Adding components, TanStack Start + shadcn/ui, Using components

## Knowledge Gaps
- **497 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `config` (+492 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `devDependencies`, `combobox.tsx`?**
  _High betweenness centrality (0.147) - this node is a cross-community bridge._
- **Why does `react` connect `combobox.tsx` to `dependencies`?**
  _High betweenness centrality (0.144) - this node is a cross-community bridge._
- **Why does `SearchCombobox()` connect `combobox.tsx` to `_auth.dashboard.index.tsx`, `cn`, `_auth.dashboard.grn.tsx`, `request-form.tsx`, `_auth.dashboard.dispatch.tsx`, `_auth.dashboard.purchase-orders.tsx`?**
  _High betweenness centrality (0.142) - this node is a cross-community bridge._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _497 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `routeTree.gen.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.020202020202020204 - nodes in this community are weakly interconnected._
- **Should `user.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05126452494873548 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.04081632653061224 - nodes in this community are weakly interconnected._