import { useMemo, useState } from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet"
import { apiFetchJson } from "@/lib/api"
import { isAdminOrAbove, canAccessInventory, ALL_INVENTORY_TYPES } from "@/lib/user"
import {
  PlusIcon, Pencil, Trash2, AlertTriangle, PackagePlus,
  PackageMinus, History, TrendingDown, Eye, Search, ChevronLeft, ChevronRight,
  Package, Box, Layers, Wrench, FlaskConical, Paperclip, Scissors, Recycle, Printer,
  ClipboardCheck, RotateCcw,
} from "lucide-react"
import { fetchAllPages, openPrintWindow } from "@/lib/print-report"

export const Route = createFileRoute("/_auth/dashboard/inventory/")({
  validateSearch: z.object({
    tab: z.string().optional(),
    page: z.coerce.number().optional(),
    inactive: z.enum(["1"]).optional(),
    search: z.string().optional(),
  }),
  component: InventoryPage,
})

// ── Types ─────────────────────────────────────────────────────────────────────

interface InventoryItem {
  id: number
  code: string
  name: string
  item_type: string
  unit: string
  quantity_on_hand: number
  reorder_level: number
  storage_type: string | null
  storage_location: string | null
  is_active: boolean
  updated_at: string
  linked_schedule_count: number
  customer_names: string | null
  required_qty: number | null
  rate: number | null
}

interface PaginatedInventory {
  items: InventoryItem[]
  total: number
  page: number
  page_size: number
  pages: number
}

interface HistoryEntry {
  id: number
  changed_at: string
  change_type: string
  changed_by_username: string | null
  quantity_before: number | null
  quantity_after: number | null
  quantity_delta: number | null
  schedule_number: string | null
  notes: string | null
}

interface ScheduleItem {
  id: number
  schedule_number: string
  description: string
  customer_name: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TABS = [
  { id: "finished_good", label: "Finished Goods" },
  { id: "raw_material", label: "Raw Materials" },
  { id: "semi_finished", label: "Semi Finished" },
  { id: "all", label: "All Items" },
]

const TYPE_LABELS: Record<string, string> = {
  finished_good: "Finished Good",
  raw_material: "Raw Material",
  semi_finished: "Semi Finished",
}

const CHANGE_LABELS: Record<string, string> = {
  create: "Created",
  add: "Stock Added",
  subtract: "Stock Removed",
  set: "Stock Set",
  edit: "Edited",
}

function fmtQty(n: number | null | undefined) {
  if (n == null) return "—"
  return n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })
}

function fmtDateTime(s: string) {
  return new Date(s).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: true,
  })
}

const isLow = (item: InventoryItem) =>
  item.reorder_level > 0 && item.quantity_on_hand <= item.reorder_level

const isShortfall = (item: InventoryItem) =>
  item.item_type === "raw_material" &&
  item.required_qty != null &&
  item.required_qty > 0 &&
  item.quantity_on_hand < item.required_qty

// Widens a literal path to `string` for routes not yet registered in the tree
// (e.g. /dashboard/inventory/[id]) — swapped for typed `to` as routes land.
const dynTo = (s: string) => s

// ── Landing cards ─────────────────────────────────────────────────────────────

const LANDING_CARDS = [
  {
    id: "finished_good", label: "Finished Goods", desc: "Final products ready for dispatch",
    href: "/dashboard/inventory/finished-goods",
    icon: <Package className="size-8" />,
    accent: "bg-tone-emerald/10 text-tone-emerald",
    border: "hover:border-teal-400",
  },
  {
    id: "raw_material", label: "Raw Materials", desc: "Input materials and components",
    href: "/dashboard/inventory/raw-materials",
    icon: <Box className="size-8" />,
    accent: "bg-tone-amber/15 text-tone-amber",
    border: "hover:border-orange-400",
  },
  {
    id: "semi_finished", label: "Semi Finished", desc: "Work-in-progress goods",
    href: "/dashboard/inventory/semi-finished",
    icon: <Layers className="size-8" />,
    accent: "bg-tone-violet/10 text-tone-violet",
    border: "hover:border-indigo-400",
  },
  {
    id: "spares", label: "Spares", desc: "Spare parts organised by category",
    href: "/dashboard/inventory/spares",
    icon: <Wrench className="size-8" />,
    accent: "bg-warning/15 text-warning",
    border: "hover:border-amber-400",
  },
  {
    id: "consumables", label: "Consumables", desc: "Oils, chemicals & consumable stock",
    href: "/dashboard/inventory/consumables",
    icon: <FlaskConical className="size-8" />,
    accent: "bg-tone-violet/10 text-tone-violet",
    border: "hover:border-violet-400",
  },
  {
    id: "attachments", label: "Attachments", desc: "Attachment inventory items",
    href: "/dashboard/inventory/attachments",
    icon: <Paperclip className="size-8" />,
    accent: "bg-primary/10 text-primary",
    border: "hover:border-sky-400",
  },
  {
    id: "weeders", label: "Weeders", desc: "Weeder inventory items",
    href: "/dashboard/inventory/weeders",
    icon: <Scissors className="size-8" />,
    accent: "bg-success/10 text-success",
    border: "hover:border-green-400",
  },
  {
    id: "scrap", label: "Scraps", desc: "Scrap materials from production",
    href: "/dashboard/inventory/scraps",
    icon: <Recycle className="size-8" />,
    accent: "bg-rose-100 text-rose-700",
    border: "hover:border-rose-400",
  },
  {
    id: "cycle_count", label: "Cycle Count", desc: "Count one inventory type at a time",
    href: "/dashboard/inventory/cycle-count",
    icon: <ClipboardCheck className="size-8" />,
    accent: "bg-primary/10 text-primary",
    border: "hover:border-sky-400",
  },
  {
    id: "stock_alerts", label: "Stock Alerts", desc: "Items below reorder level",
    href: "/dashboard/inventory/stock-alerts",
    icon: <AlertTriangle className="size-8" />,
    accent: "bg-destructive/10 text-destructive",
    border: "hover:border-red-400",
  },
]

// ── Landing ───────────────────────────────────────────────────────────────────

function InventoryLanding() {
  const navigate = Route.useNavigate()

  // One active-only aggregate replaces the previous request-per-card fan-out.
  const typeMap: Record<string, string> = {
    finished_good: "finished_good",
    raw_material: "raw_material",
    semi_finished: "semi_finished",
    scrap: "scrap",
    spares: "spare",
    consumables: "consumable",
    attachments: "attachment",
    weeders: "weeder",
  }

  // Only real inventory-type cards have a countable endpoint; cycle-count and
  // stock-alerts cards are navigation links (no bogus API calls for them).
  const countCardIds = new Set([
    "finished_good",
    "raw_material",
    "semi_finished",
    "scrap",
    "spares",
    "consumables",
    "attachments",
    "weeders",
  ])

  const summaryQuery = useQuery({
    queryKey: ["/api/v1/dashboard/inventory-summary"],
    staleTime: 60_000,
  })

  const counts = useMemo(() => {
    const out: Record<string, number | null> = {}
    const data = summaryQuery.data as
      | { types: Record<string, { count: number }> }
      | undefined
    countCardIds.forEach((id) => {
      const count = data?.types[typeMap[id]]?.count
      out[id] = typeof count === "number" ? count : null
    })
    return out
  }, [summaryQuery.data])

  const visibleCards = LANDING_CARDS.filter((c) => {
    if (c.id === "cycle_count") {
      return ALL_INVENTORY_TYPES.some((t) => canAccessInventory(t))
    }
    if (c.id === "stock_alerts") return true
    return canAccessInventory(typeMap[c.id] ?? c.id)
  })

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Select an inventory type to view and manage items."
        breadcrumbs={[{ label: "Inventory" }]}
      />
      <div className="p-4 md:p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Inventory</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Select an inventory type to view and manage items.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {visibleCards.map((c) => {
            const count = counts[c.id]
            return (
              <button
                key={c.id}
                onClick={() => navigate({ href: c.href })}
                className={`text-left rounded-xl border-2 border-transparent p-5 space-y-3 bg-card shadow-sm hover:shadow-md transition-all cursor-pointer ${c.border}`}
              >
                <div className={`flex size-14 items-center justify-center rounded-xl ${c.accent}`}>
                  {c.icon}
                </div>
                <div>
                  <p className="text-base font-semibold">{c.label}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{c.desc}</p>
                </div>
                <p className="text-2xl font-bold tabular-nums">
                  {c.id === "stock_alerts"
                    ? <span className="text-sm font-normal text-muted-foreground">View alerts →</span>
                    : c.id === "cycle_count"
                      ? <span className="text-sm font-normal text-muted-foreground">All types →</span>
                      : count === null
                        ? <span className="text-muted-foreground text-base animate-pulse">—</span>
                        : <>{count}<span className="text-sm font-normal text-muted-foreground ml-1">items</span></>}
                </p>
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}

// ── Table page (?tab=…) ───────────────────────────────────────────────────────

function InventoryTable() {
  const navigate = Route.useNavigate()
  const { tab, page, inactive, search } = Route.useSearch()
  const queryClient = useQueryClient()

  const tabId = tab ?? "finished_good"
  const pageNum = Math.max(1, page ?? 1)
  const showInactive = inactive === "1"
  const searchTerm = search ?? ""

  const [searchDraft, setSearchDraft] = useState(searchTerm)
  const [admin] = useState(() => isAdminOrAbove())

  // Delete
  const [deleteId, setDeleteId] = useState<number | null>(null)

  // Adjust sheet
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null)
  const [adjustType, setAdjustType] = useState<"add" | "subtract" | "set">("add")
  const [adjustQty, setAdjustQty] = useState("")
  const [adjustScheduleId, setAdjustScheduleId] = useState<string>("")
  const [adjustNote, setAdjustNote] = useState("")
  const [adjustError, setAdjustError] = useState<string | null>(null)

  // History sheet
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null)
  const [historyPage, setHistoryPage] = useState(1)

  const listUrl = useMemo(() => {
    const params = new URLSearchParams({
      page: String(pageNum),
      page_size: "20",
      include_inactive: String(showInactive),
    })
    if (tabId !== "all") params.set("item_type", tabId)
    if (searchTerm) params.set("search", searchTerm)
    return `/api/v1/inventory?${params}`
  }, [tabId, pageNum, showInactive, searchTerm])

  const listQuery = useQuery({
    queryKey: [listUrl],
    staleTime: 0,
  })

  const schedulesQuery = useQuery({
    queryKey: ["/api/v1/schedules?include_inactive=false&page_size=500"],
    enabled: adjustItem !== null,
    staleTime: 60_000,
  })

  const historyQuery = useQuery({
    queryKey: [
      `/api/v1/inventory/${historyItem?.id}/history?limit=10&offset=${(historyPage - 1) * 10}`,
    ],
    enabled: historyItem !== null,
    staleTime: 0,
  })

  const adjustMutation = useMutation({
    mutationFn: (body: {
      adjustment_type: "add" | "subtract" | "set"
      quantity: number
      schedule_id: number | null
      note: string | null
    }) =>
      apiFetchJson(`/api/v1/inventory/${adjustItem!.id}/adjust`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setAdjustItem(null)
      queryClient.invalidateQueries({ queryKey: ["/api/v1/inventory"] })
    },
    onError: (e: unknown) => {
      setAdjustError(e instanceof Error ? e.message : "Adjust failed")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetchJson(`/api/v1/inventory/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setDeleteId(null)
      window.dispatchEvent(new Event("inventory-updated"))
      queryClient.invalidateQueries({ queryKey: ["/api/v1/inventory"] })
    },
    onError: (e: unknown) => {
      alert(e instanceof Error ? e.message : "Delete failed")
    },
  })

  const restoreMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetchJson(`/api/v1/inventory/${id}`, {
        method: "PUT",
        body: JSON.stringify({ is_active: true }),
      }),
    onSuccess: () => {
      window.dispatchEvent(new Event("inventory-updated"))
      queryClient.invalidateQueries({ queryKey: ["/api/v1/inventory"] })
    },
    onError: (e: unknown) => {
      alert(e instanceof Error ? e.message : "Restore failed")
    },
  })

  // ── Navigation helpers (search params) ─────────────────────────────────────
  function setPage(n: number) {
    navigate({ search: { tab, page: n, inactive, search: searchTerm } })
  }
  function toggleInactive(v: boolean) {
    navigate({ search: { tab, page: 1, inactive: v ? "1" : undefined, search: searchTerm } })
  }
  function submitSearch() {
    navigate({ search: { tab, page: 1, inactive, search: searchDraft.trim() || undefined } })
  }
  function clearSearch() {
    navigate({ search: { tab, page: 1, inactive, search: undefined } })
  }

  // ── Adjust stock ───────────────────────────────────────────────────────────
  function openAdjust(item: InventoryItem) {
    setAdjustItem(item)
    setAdjustType("add")
    setAdjustQty("")
    setAdjustScheduleId("")
    setAdjustNote("")
    setAdjustError(null)
  }

  async function submitAdjust() {
    if (!adjustItem) return
    const qty = parseFloat(adjustQty)
    if (isNaN(qty) || qty < 0) { setAdjustError("Enter a valid quantity ≥ 0"); return }
    adjustMutation.mutate({
      adjustment_type: adjustType,
      quantity: qty,
      schedule_id: adjustScheduleId ? parseInt(adjustScheduleId) : null,
      note: adjustNote || null,
    })
  }

  // ── History ────────────────────────────────────────────────────────────────
  function openHistory(item: InventoryItem) {
    setHistoryItem(item)
    setHistoryPage(1)
  }

  // ── Print ──────────────────────────────────────────────────────────────────
  async function printInventory() {
    const all = await fetchAllPages(async (printPage, pageSize) => {
      const params = new URLSearchParams({ page: String(printPage), page_size: String(pageSize), include_inactive: String(showInactive) })
      if (tabId !== "all") params.set("item_type", tabId)
      if (searchTerm) params.set("search", searchTerm)
      return apiFetchJson<PaginatedInventory>("/api/v1/inventory?" + params)
    })
    openPrintWindow({
      title: (TABS.find((t) => t.id === tabId)?.label ?? "Inventory") + " Cycle Count", mode: "cycle-count",
      columns: ["Code", "Name", "Type", "Unit", "System Qty", "Physical Count", "Variance", "Location", "Counter Initials", "Notes"],
      rows: all.map((item) => ({ "Code": item.code, "Name": item.name, "Type": TYPE_LABELS[item.item_type] ?? item.item_type, "Unit": item.unit, "System Qty": String(item.quantity_on_hand), "Physical Count": "", "Variance": "", "Location": [item.storage_type, item.storage_location].filter(Boolean).join(" · "), "Counter Initials": "", "Notes": "" })),
    })
  }

  async function printHistory() {
    if (!historyItem) return
    const all = await fetchAllPages(async (printPage, pageSize) => {
      const rows = await apiFetchJson<HistoryEntry[]>("/api/v1/inventory/" + historyItem.id + "/history?limit=" + pageSize + "&offset=" + ((printPage - 1) * pageSize))
      return { items: rows, total: 0, page: printPage, page_size: pageSize, pages: 0 }
    })
    openPrintWindow({
      title: "Inventory History - " + historyItem.name, mode: "audit-history",
      columns: ["Date", "Action", "Before", "Change", "After", "User", "Schedule", "Notes"],
      rows: all.map((row) => ({ "Date": new Date(row.changed_at).toLocaleString(), "Action": CHANGE_LABELS[row.change_type] ?? row.change_type, "Before": row.quantity_before ?? "", "Change": row.quantity_delta ?? "", "After": row.quantity_after ?? "", "User": row.changed_by_username ?? "System", "Schedule": row.schedule_number ?? "", "Notes": row.notes ?? "" })),
    })
  }

  const data = listQuery.data as PaginatedInventory | undefined
  const loading = listQuery.isLoading || listQuery.isFetching
  const error = listQuery.error instanceof Error ? listQuery.error.message : null

  const items = data?.items ?? []
  const totalPages = data?.pages ?? 1
  const total = data?.total ?? 0
  const pageStart = ((pageNum - 1) * 20) + 1
  const pageEnd = Math.min(pageNum * 20, total)
  const lowCount = items.filter(isLow).length
  const shortfall = items.filter(isShortfall).length

  const showRMCols = tabId === "raw_material"
  const showFGCols = tabId === "finished_good" || tabId === "semi_finished"
  const showTypCol = tabId === "all"

  const historyEntries = (historyQuery.data as HistoryEntry[] | undefined) ?? []
  const historyLoading = historyQuery.isLoading
  const historyHasMore = (historyQuery.data as HistoryEntry[] | undefined)?.length === 10
  const adjustSchedules = (schedulesQuery.data as { items: ScheduleItem[] } | undefined)?.items ?? []

  return (
    <>
      {/* Header */}
      <PageHeader
        title={TABS.find((t) => t.id === tabId)?.label ?? "Inventory"}
        description={
          tabId === "raw_material" ? "Input materials and components." :
            tabId === "semi_finished" ? "Work-in-progress goods." :
              tabId === "all" ? "All inventory items." :
                "Final products ready for dispatch."
        }
        breadcrumbs={[
          { label: "Inventory", href: "/dashboard/inventory" },
          { label: TABS.find((t) => t.id === tabId)?.label ?? "Inventory" },
        ]}
        actions={<Button size="sm" variant="outline" onClick={printInventory}><Printer className="size-4 mr-1" />Print</Button>}
      />

      <div className="p-4 md:p-6 space-y-4">
        {/* Heading */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">{TABS.find((t) => t.id === tabId)?.label ?? "Inventory"}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {tabId === "raw_material" ? "Input materials and components." : tabId === "semi_finished" ? "Work-in-progress goods." : tabId === "all" ? "All inventory items." : "Final products ready for dispatch."}
            </p>
          </div>
          <Button size="sm" onClick={() => navigate({ href: "/dashboard/inventory/new" })}>
            <PlusIcon className="size-4 mr-1" />
            Add Item
          </Button>
        </div>

        {/* Alerts */}
        {(lowCount > 0 || shortfall > 0) && (
          <div className="flex flex-wrap gap-2">
            {lowCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-warning bg-warning/15 border border-warning/20 rounded-md px-3 py-1.5">
                <AlertTriangle className="size-3.5 shrink-0" />
                {lowCount} item{lowCount !== 1 ? "s" : ""} below reorder level
              </div>
            )}
            {shortfall > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-1.5">
                <TrendingDown className="size-3.5 shrink-0" />
                {shortfall} raw material{shortfall !== 1 ? "s" : ""} have shortfall vs schedule
              </div>
            )}
          </div>
        )}

        {/* Search + Inactive toggle */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex items-center gap-3 ml-auto flex-wrap">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <input type="checkbox" checked={showInactive}
                onChange={(e) => toggleInactive(e.target.checked)} className="size-3 rounded" />
              Show inactive
            </label>
          </div>
          {/* Search form */}
          <form onSubmit={(e) => { e.preventDefault(); submitSearch() }} className="flex gap-1.5 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder="Search name / code…"
                className="pl-8 pr-3 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring w-44"
              />
            </div>
            <Button type="submit" size="sm" variant="secondary">Search</Button>
            {searchTerm && (
              <Button type="button" size="sm" variant="ghost" onClick={clearSearch}>
                Clear
              </Button>
            )}
          </form>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Mobile cards */}
        <div className="md:hidden space-y-3">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border p-4"><Skeleton className="h-28 w-full" /></div>
            ))
          ) : items.length === 0 ? (
            <div className="rounded-lg border px-4 py-12 text-center text-muted-foreground text-sm">
              {searchTerm ? `No items matching "${searchTerm}".` : "No items found."}
            </div>
          ) : (
            items.map((item) => {
              const low = isLow(item)
              const short = isShortfall(item)
              return (
                <div key={item.id}
                  className={`rounded-lg border p-4 space-y-2.5 ${!item.is_active ? "opacity-60" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link to={dynTo(`/dashboard/inventory/${item.id}`)}
                        className="font-medium text-sm hover:underline">{item.name}</Link>
                      <div className="text-xs text-muted-foreground font-mono">{item.code}</div>
                      {!item.is_active && <span className="text-xs text-muted-foreground">(inactive)</span>}
                    </div>
                    {showTypCol && (
                      <Badge variant="outline" className="text-xs shrink-0">
                        {TYPE_LABELS[item.item_type] ?? item.item_type}
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">Available:</span>
                      <span className={`font-medium ${low ? "text-warning" : short ? "text-destructive" : ""}`}>
                        {(low || short) && <AlertTriangle className="size-3 inline mr-0.5" />}
                        {fmtQty(item.quantity_on_hand)} {item.unit}
                      </span>
                    </div>
                    {showRMCols && item.required_qty != null && item.required_qty > 0 && (
                      <div>
                        <span className="text-muted-foreground">Required:</span>{" "}
                        <span className={item.required_qty > item.quantity_on_hand ? "text-destructive font-medium" : ""}>
                          {fmtQty(item.required_qty)} {item.unit}
                        </span>
                      </div>
                    )}
                    {item.linked_schedule_count > 0 && (
                      <div><span className="text-muted-foreground">Schedules:</span> <Badge variant="secondary" className="text-xs">{item.linked_schedule_count}</Badge></div>
                    )}
                    {admin && item.rate != null && (
                      <div><span className="text-muted-foreground">Rate:</span> ₹{item.rate.toFixed(2)}</div>
                    )}
                    <div className="text-muted-foreground">{fmtDate(item.updated_at)}</div>
                  </div>
                  {showFGCols && item.customer_names && (
                    <p className="text-xs text-muted-foreground truncate">{item.customer_names}</p>
                  )}
                  <div className="flex justify-end gap-0.5 pt-1 border-t">
                    <Button variant="ghost" size="icon" className="size-7" title="View Details"
                      onClick={() => navigate({ href: `/dashboard/inventory/${item.id}` })}>
                      <Eye className="size-3.5 text-primary" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-7" title="Add Stock"
                      onClick={() => { setAdjustType("add"); openAdjust(item) }}>
                      <PackagePlus className="size-3.5 text-success" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-7" title="Remove Stock"
                      onClick={() => { setAdjustType("subtract"); openAdjust(item) }}>
                      <PackageMinus className="size-3.5 text-warning" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-7" title="Edit"
                      onClick={() => navigate({ href: `/dashboard/inventory/${item.id}/edit` })}>
                      <Pencil className="size-3.5" />
                    </Button>
                    {admin && (
                      <Button variant="ghost" size="icon" className="size-7" title="History"
                        onClick={() => openHistory(item)}>
                        <History className="size-3.5 text-primary" />
                      </Button>
                    )}
                    {item.is_active ? (
                      <Button variant="ghost" size="icon"
                        className="size-7 text-destructive hover:text-destructive"
                        title="Deactivate" onClick={() => setDeleteId(item.id)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="icon"
                        className="size-7 text-success hover:text-success"
                        title="Restore (reactivate)" onClick={() => restoreMutation.mutate(item.id)}>
                        <RotateCcw className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Table (desktop) */}
        <div className="hidden md:block rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-3 text-left font-medium w-24">Updated</th>
                  <th className="px-4 py-3 text-left font-medium">Name / Code</th>
                  {showTypCol && <th className="px-4 py-3 text-left font-medium">Type</th>}
                  <th className="px-4 py-3 text-right font-medium">Available</th>
                  {showRMCols && <th className="px-4 py-3 text-right font-medium">Required</th>}
                  {showFGCols && <th className="px-4 py-3 text-left font-medium">Customers</th>}
                  <th className="px-4 py-3 text-left font-medium">Storage/Location</th>
                  <th className="px-4 py-3 text-center font-medium w-16">Sched.</th>
                  {admin && <th className="px-4 py-3 text-right font-medium w-24">Rate</th>}
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                      {searchTerm
                        ? `No items matching "${searchTerm}". Try a different search.`
                        : "No items found."}
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const low = isLow(item)
                    const short = isShortfall(item)
                    return (
                      <tr key={item.id}
                        className={["border-b last:border-0 hover:bg-muted/30 transition-colors",
                          !item.is_active ? "opacity-60" : ""].join(" ")}>
                        {/* Updated */}
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {fmtDate(item.updated_at)}
                        </td>
                        {/* Name / Code */}
                        <td className="px-4 py-3 max-w-[220px]">
                          <Link to={dynTo(`/dashboard/inventory/${item.id}`)}
                            className="font-medium text-sm hover:underline truncate block" title={item.name}>{item.name}</Link>
                          <div className="text-xs text-muted-foreground font-mono truncate">{item.code}</div>
                          {!item.is_active && <span className="text-xs text-muted-foreground">(inactive)</span>}
                        </td>
                        {/* Type (all tab) */}
                        {showTypCol && (
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="text-xs">
                              {TYPE_LABELS[item.item_type] ?? item.item_type}
                            </Badge>
                          </td>
                        )}
                        {/* Available */}
                        <td className={["px-4 py-3 text-right tabular-nums font-medium",
                          low ? "text-warning" : short ? "text-destructive" : ""].join(" ")}>
                          <div className="flex items-center justify-end gap-1">
                            {(low || short) && <AlertTriangle className="size-3 shrink-0" />}
                            {fmtQty(item.quantity_on_hand)} {item.unit}
                          </div>
                        </td>
                        {/* Required (RM) */}
                        {showRMCols && (
                          <td className="px-4 py-3 text-right tabular-nums text-xs">
                            {item.required_qty != null && item.required_qty > 0 ? (
                              <span className={item.required_qty > item.quantity_on_hand
                                ? "text-destructive font-medium" : "text-muted-foreground"}>
                                {fmtQty(item.required_qty)} {item.unit}
                              </span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                        )}
                        {/* Customers (FG/SFG) */}
                        {showFGCols && (
                          <td className="px-4 py-3 text-xs text-muted-foreground max-w-[180px] truncate"
                            title={item.customer_names ?? ""}>
                            {item.customer_names ?? "—"}
                          </td>
                        )}
                        {/* Storage */}
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[160px]">
                          {item.storage_type && <div className="truncate" title={item.storage_type}>{item.storage_type}</div>}
                          {item.storage_location && <div className="truncate" title={item.storage_location}>{item.storage_location}</div>}
                          {!item.storage_type && !item.storage_location && "—"}
                        </td>
                        {/* Schedules */}
                        <td className="px-4 py-3 text-center">
                          {item.linked_schedule_count > 0 ? (
                            <Badge variant="secondary" className="text-xs">{item.linked_schedule_count}</Badge>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        {/* Rate */}
                        {admin && (
                          <td className="px-4 py-3 text-right text-xs tabular-nums">
                            {item.rate != null
                              ? `₹${item.rate.toFixed(2)}`
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                        )}
                        {/* Actions */}
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex gap-0.5">
                            <Button variant="ghost" size="icon" className="size-7" title="View Details"
                              onClick={() => navigate({ href: `/dashboard/inventory/${item.id}` })}>
                              <Eye className="size-3.5 text-primary" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-7" title="Add Stock"
                              onClick={() => { setAdjustType("add"); openAdjust(item) }}>
                              <PackagePlus className="size-3.5 text-success" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-7" title="Remove Stock"
                              onClick={() => { setAdjustType("subtract"); openAdjust(item) }}>
                              <PackageMinus className="size-3.5 text-warning" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-7" title="Edit"
                              onClick={() => navigate({ href: `/dashboard/inventory/${item.id}/edit` })}>
                              <Pencil className="size-3.5" />
                            </Button>
                            {admin && (
                              <Button variant="ghost" size="icon" className="size-7" title="History"
                                onClick={() => openHistory(item)}>
                                <History className="size-3.5 text-primary" />
                              </Button>
                            )}
                            {item.is_active ? (
                              <Button variant="ghost" size="icon"
                                className="size-7 text-destructive hover:text-destructive"
                                title="Deactivate" onClick={() => setDeleteId(item.id)}>
                                <Trash2 className="size-3.5" />
                              </Button>
                            ) : (
                              <Button variant="ghost" size="icon"
                                className="size-7 text-success hover:text-success"
                                title="Restore (reactivate)" onClick={() => restoreMutation.mutate(item.id)}>
                                <RotateCcw className="size-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
              {!loading && items.length > 0 && (
                <tfoot>
                  <tr className="border-t bg-muted/20">
                    <td colSpan={showTypCol ? 3 : 2} className="px-4 py-2 text-xs text-muted-foreground">
                      Showing {pageStart}–{pageEnd} of {total}
                    </td>
                    <td colSpan={admin ? 5 : 4} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-sm text-muted-foreground">
              Page {pageNum} of {totalPages} &mdash; {total} item{total !== 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="size-8"
                disabled={pageNum <= 1} onClick={() => setPage(pageNum - 1)}>
                <ChevronLeft className="size-4" />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - pageNum) <= 2)
                .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1]) > 1) acc.push("…")
                  acc.push(p)
                  return acc
                }, [])
                .map((p, i) =>
                  p === "…" ? (
                    <span key={`e${i}`} className="px-1 text-muted-foreground text-sm">…</span>
                  ) : (
                    <Button key={p} variant={p === pageNum ? "default" : "outline"} size="icon" className="size-8"
                      onClick={() => setPage(p)}>{p}</Button>
                  )
                )}
              <Button variant="outline" size="icon" className="size-8"
                disabled={pageNum >= totalPages} onClick={() => setPage(pageNum + 1)}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Adjust Stock Sheet ─────────────────────────────────────────────── */}
      <Sheet open={adjustItem !== null} onOpenChange={(o) => !o && setAdjustItem(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>Adjust Stock — {adjustItem?.name}</SheetTitle>
            <p className="text-sm text-muted-foreground">
              {adjustItem?.code} · Current: <strong>{fmtQty(adjustItem?.quantity_on_hand)} {adjustItem?.unit}</strong>
            </p>
          </SheetHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Adjustment Type</label>
              <div className="flex gap-2">
                {(["add", "subtract", "set"] as const).map((t) => (
                  <button key={t} onClick={() => setAdjustType(t)}
                    className={["flex-1 py-2 rounded-md text-sm font-medium border transition-colors capitalize",
                      adjustType === t
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-input hover:bg-muted",
                    ].join(" ")}
                  >
                    {t === "add" ? "Add +" : t === "subtract" ? "Remove −" : "Set ="}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Quantity</label>
              <input type="number" min="0" step="any" value={adjustQty}
                onChange={(e) => setAdjustQty(e.target.value)} placeholder="Enter quantity"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Linked Schedule{" "}
                <span className="text-xs text-muted-foreground font-normal">(optional)</span>
              </label>
              <select value={adjustScheduleId} onChange={(e) => setAdjustScheduleId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— None —</option>
                {adjustSchedules.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.schedule_number} · {s.description} ({s.customer_name})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Note{" "}
                <span className="text-xs text-muted-foreground font-normal">(optional)</span>
              </label>
              <textarea rows={2} value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)}
                placeholder="Reason for adjustment…"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>
            {adjustError && <p className="text-sm text-destructive">{adjustError}</p>}
            <div className="flex gap-3 pt-2">
              <Button onClick={submitAdjust} disabled={adjustMutation.isPending} className="flex-1">
                {adjustMutation.isPending ? "Saving…" : "Apply Adjustment"}
              </Button>
              <Button variant="outline" onClick={() => setAdjustItem(null)} disabled={adjustMutation.isPending}>
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── History Sheet ──────────────────────────────────────────────────── */}
      <Sheet open={historyItem !== null} onOpenChange={(o) => !o && setHistoryItem(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle className="flex items-center justify-between gap-2"><span>History — {historyItem?.name}</span><Button size="sm" variant="outline" onClick={printHistory}><Printer className="size-3.5 mr-1" />Print</Button></SheetTitle>
            <p className="text-sm text-muted-foreground">{historyItem?.code}</p>
          </SheetHeader>
          {historyLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : historyEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No history found.</p>
          ) : (
            <div className="space-y-2">
              {historyEntries.map((e) => (
                <div key={e.id} className="rounded-md border p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <Badge
                      variant={e.change_type === "add" ? "default"
                        : e.change_type === "subtract" ? "destructive" : "secondary"}
                      className="text-xs">
                      {CHANGE_LABELS[e.change_type] ?? e.change_type}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{fmtDateTime(e.changed_at)}</span>
                  </div>
                  {(e.quantity_before != null || e.quantity_after != null) && (
                    <p className="text-xs text-muted-foreground">
                      {e.quantity_before != null ? `Before: ${fmtQty(e.quantity_before)}` : ""}
                      {e.quantity_after != null ? ` → After: ${fmtQty(e.quantity_after)}` : ""}
                      {e.quantity_delta != null
                        ? ` (${e.quantity_delta >= 0 ? "+" : ""}${fmtQty(e.quantity_delta)})`
                        : ""}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                    {e.changed_by_username && <span>By: {e.changed_by_username}</span>}
                    {e.schedule_number && <span>Schedule: {e.schedule_number}</span>}
                    {e.notes && <span className="italic">{e.notes}</span>}
                  </div>
                </div>
              ))}
              {(historyPage > 1 || historyHasMore) && (
                <div className="flex items-center justify-between pt-3">
                  <Button size="sm" variant="outline" disabled={historyPage <= 1 || historyLoading} onClick={() => setHistoryPage(historyPage - 1)}>← Prev</Button>
                  <span className="text-sm text-muted-foreground">Page {historyPage}</span>
                  <Button size="sm" variant="outline" disabled={!historyHasMore || historyLoading} onClick={() => setHistoryPage(historyPage + 1)}>Next →</Button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Deactivate AlertDialog ─────────────────────────────────────────── */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate item?</AlertDialogTitle>
            <AlertDialogDescription>
              This marks the item as inactive. It can be restored via Edit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate(deleteId!)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deactivating…" : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

function InventoryPage() {
  const { tab } = Route.useSearch()
  if (!tab) return <InventoryLanding />
  return <InventoryTable />
}
