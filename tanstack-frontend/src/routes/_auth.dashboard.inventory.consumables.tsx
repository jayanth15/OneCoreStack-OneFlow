import { useEffect, useMemo, useRef, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { apiFetchJson } from "@/lib/api"
import { isAdminOrAbove, canAccessInventory } from "@/lib/user"
import {
  PlusIcon, Pencil, Trash2, Search, FlaskConical, ImageIcon, ChevronLeft, ChevronRight,
  PackagePlus, PackageMinus, History, Eye, AlertTriangle, Printer, RotateCcw,
} from "lucide-react"
import { fetchAllPages, openPrintWindow } from "@/lib/print-report"

export const Route = createFileRoute("/_auth/dashboard/inventory/consumables")({
  validateSearch: z.object({
    page: z.coerce.number().optional(),
    search: z.string().optional(),
    inactive: z.string().optional(),
  }),
  component: ConsumablesPage,
})

// ── Types ─────────────────────────────────────────────────────────────────────

interface Consumable {
  id: number
  name: string
  code: string | null
  storage_type: string | null
  storage_location: string | null
  supplier_name: string | null
  rate_per_unit: number | null
  qty: number
  reorder_level: number
  timeline_days: number | null
  total_price: number | null
  image_base64: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

interface Paginated {
  items: Consumable[]
  total: number
  page: number
  page_size: number
  pages: number
}

interface ConsumableHistoryEntry {
  id: number
  consumable_id: number
  changed_by_username: string | null
  changed_at: string
  change_type: string  // add | subtract | set
  qty_before: number
  qty_after: number
  qty_delta: number
  note: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PAGE_SIZE = 30
const STORAGE_TYPES = ["Shelf","Rack","Bin","Drawer","Tray","Cabinet","Box","Pallet","Floor"]

function fmtRate(n: number | null) {
  if (n == null) return "—"
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

const BLANK = {
  name: "", code: "", storage_type: "", storage_location: "", supplier_name: "", rate_per_unit: "", qty: "0", reorder_level: "0", timeline_days: "",
}

// ── Page ──────────────────────────────────────────────────────────────────────

function ConsumablesPage() {
  const navigate = Route.useNavigate()
  const { page, search, inactive } = Route.useSearch()
  const queryClient = useQueryClient()

  const pageNum = Math.max(1, page ?? 1)
  const searchTerm = search ?? ""
  const showInactive = inactive === "1"

  const [admin] = useState(() => isAdminOrAbove())

  const [searchDraft, setSearchDraft] = useState(searchTerm)

  // create / edit dialog
  const [dialog, setDialog] = useState<"create" | "edit" | null>(null)
  const [editing, setEditing] = useState<Consumable | null>(null)
  const [form, setForm] = useState({ ...BLANK })
  const [imgPreview, setImgPreview] = useState<string | null>(null)
  const [imgB64, setImgB64] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formStorageCustom, setFormStorageCustom] = useState(false)
  const imgRef = useRef<HTMLInputElement>(null)

  // delete
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)

  // adjust stock
  const [adjustItem, setAdjustItem] = useState<Consumable | null>(null)
  const [adjustType, setAdjustType] = useState<"add" | "subtract">("add")
  const [adjustQty, setAdjustQty] = useState("")
  const [adjustNote, setAdjustNote] = useState("")
  const [adjustError, setAdjustError] = useState<string | null>(null)

  // view detail
  const [viewItem, setViewItem] = useState<Consumable | null>(null)

  // history
  const [historyItem, setHistoryItem] = useState<Consumable | null>(null)
  const [historyPage, setHistoryPage] = useState(1)

  useEffect(() => {
    if (!canAccessInventory("consumable")) {
      navigate({ href: "/dashboard/inventory", replace: true })
    }
     
  }, [])

  // ── Fetch ───────────────────────────────────────────────────────────────────

  const listUrl = useMemo(() => {
    const params = new URLSearchParams({
      page: String(pageNum), page_size: String(PAGE_SIZE), include_inactive: String(showInactive),
    })
    if (searchTerm) params.set("search", searchTerm)
    return `/api/v1/consumables?${params}`
  }, [pageNum, searchTerm, showInactive])

  const listQuery = useQuery({
    queryKey: [listUrl],
    staleTime: 0,
  })

  const historyQuery = useQuery({
    queryKey: [
      `/api/v1/consumables/${historyItem?.id}/history?limit=10&offset=${(historyPage - 1) * 10}`,
    ],
    enabled: historyItem !== null,
    staleTime: 0,
  })

  const saveMutation = useMutation({
    mutationFn: (body: {
      name: string
      code: string | null
      storage_type: string | null
      storage_location: string | null
      supplier_name: string | null
      rate_per_unit: number | null
      qty: number
      reorder_level: number
      timeline_days: number | null
      image_base64: string | null
    }) =>
      apiFetchJson(dialog === "create" ? "/api/v1/consumables" : `/api/v1/consumables/${editing!.id}`, {
        method: dialog === "create" ? "POST" : "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setDialog(null)
      if (dialog === "create") {
        navigate({ search: { page: 1, search: searchTerm || undefined } })
      }
      queryClient.invalidateQueries({ queryKey: ["/api/v1/consumables"] })
    },
    onError: (e: unknown) => {
      setFormError(e instanceof Error ? e.message : "Save failed")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetchJson(`/api/v1/consumables/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setDeleteId(null)
      queryClient.invalidateQueries({ queryKey: ["/api/v1/consumables"] })
    },
    onError: (e: unknown) => {
      setMutationError(e instanceof Error ? e.message : "Delete failed")
    },
  })

  const restoreMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetchJson(`/api/v1/consumables/${id}`, {
        method: "PUT",
        body: JSON.stringify({ is_active: true }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/consumables"] })
    },
    onError: (e: unknown) => {
      setMutationError(e instanceof Error ? e.message : "Restore failed")
    },
  })

  const adjustMutation = useMutation({
    mutationFn: (body: {
      adjustment_type: "add" | "subtract"
      quantity: number
      note: string | null
    }) =>
      apiFetchJson(`/api/v1/consumables/${adjustItem!.id}/adjust`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setAdjustItem(null)
      queryClient.invalidateQueries({ queryKey: ["/api/v1/consumables"] })
    },
    onError: (e: unknown) => {
      setAdjustError(e instanceof Error ? e.message : "Failed")
    },
  })

  // ── Navigation helpers (search params) ─────────────────────────────────────
  function setPage(n: number) {
    navigate({ search: { page: n, search: searchTerm || undefined, inactive: showInactive ? "1" : undefined } })
  }
  function submitSearch() {
    navigate({ search: { page: 1, search: searchDraft.trim() || undefined, inactive: showInactive ? "1" : undefined } })
  }
  function clearSearch() {
    navigate({ search: { page: 1, search: undefined, inactive: showInactive ? "1" : undefined } })
  }
  function toggleInactive(v: boolean) {
    navigate({ search: { page: 1, search: searchTerm || undefined, inactive: v ? "1" : undefined } })
  }

  // ── Open dialog helpers ──────────────────────────────────────────────────────

  function openCreate() {
    setEditing(null)
    setForm({ ...BLANK })
    setFormStorageCustom(false)
    setImgPreview(null); setImgB64(null)
    setFormError(null); setDialog("create")
  }
  function openEdit(item: Consumable) {
    setEditing(item)
    const isCustom = !!item.storage_type && !STORAGE_TYPES.includes(item.storage_type)
    setFormStorageCustom(isCustom)
    setForm({
      name: item.name, code: item.code ?? "",
      storage_type: item.storage_type ?? "",
      storage_location: item.storage_location ?? "",
      supplier_name: item.supplier_name ?? "",
      rate_per_unit: item.rate_per_unit != null ? String(item.rate_per_unit) : "",
      qty: String(item.qty),
      reorder_level: String(item.reorder_level ?? 0),
      timeline_days: item.timeline_days != null ? String(item.timeline_days) : "",
    })
    setImgPreview(item.image_base64 ? `data:image/jpeg;base64,${item.image_base64}` : null)
    setImgB64(item.image_base64 ?? null)
    setFormError(null); setDialog("edit")
  }

  function handleImg(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const r = new FileReader()
    r.onload = () => { const d = r.result as string; setImgPreview(d); setImgB64(d.split(",")[1] ?? null) }
    r.readAsDataURL(file)
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  async function save() {
    if (!form.name.trim()) { setFormError("Name is required"); return }
    setSaving(true); setFormError(null)
    const body = {
      name: form.name.trim(),
      code: form.code || null,
      storage_type: form.storage_type || null,
      storage_location: form.storage_location || null,
      supplier_name: form.supplier_name || null,
      rate_per_unit: form.rate_per_unit ? parseFloat(form.rate_per_unit) : null,
      qty: parseFloat(form.qty) || 0,
      reorder_level: parseFloat(form.reorder_level) || 0,
      timeline_days: form.timeline_days ? parseInt(form.timeline_days) : null,
      image_base64: imgB64,
    }
    saveMutation.mutate(body, {
      onSettled: () => setSaving(false),
    })
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  function doDelete() {
    if (deleteId === null) return
    deleteMutation.mutate(deleteId)
  }

  // ── Adjust stock ─────────────────────────────────────────────────────────────

  function openAdjust(item: Consumable, type: "add" | "subtract") {
    setAdjustItem(item); setAdjustType(type)
    setAdjustQty(""); setAdjustNote(""); setAdjustError(null)
  }

  async function doAdjust() {
    if (!adjustItem) return
    const qty = parseFloat(adjustQty)
    if (isNaN(qty) || qty <= 0) { setAdjustError("Enter a positive quantity"); return }
    setAdjustError(null)
    adjustMutation.mutate({
      adjustment_type: adjustType,
      quantity: qty,
      note: adjustNote || null,
    })
  }

  // ── History ───────────────────────────────────────────────────────────────────

  function openHistory(item: Consumable) {
    setHistoryItem(item); setHistoryPage(1)
  }

  function changeHistoryPage(newPage: number) {
    if (!historyItem) return
    setHistoryPage(newPage)
  }

  async function printInventory() {
    const all = await fetchAllPages(async (printPage, pageSize) => {
      const params = new URLSearchParams({ page: String(printPage), page_size: String(pageSize), include_inactive: "false" })
      if (searchTerm) params.set("search", searchTerm)
      return apiFetchJson<Paginated>("/api/v1/consumables?" + params)
    })
    openPrintWindow({
      title: "Consumables Cycle Count", mode: "cycle-count",
      columns: ["Code", "Name", "System Qty", "Physical Count", "Variance", "Storage", "Counter Initials", "Notes"],
      rows: all.map(item => ({ "Code": item.code ?? "", "Name": item.name, "System Qty": String(item.qty), "Physical Count": "", "Variance": "", "Storage": [item.storage_type, item.storage_location].filter(Boolean).join(" · "), "Counter Initials": "", "Notes": "" })),
    })
  }

  async function printHistory() {
    if (!historyItem) return
    const all = await fetchAllPages(async (printPage, pageSize) => {
      const rows = await apiFetchJson<ConsumableHistoryEntry[]>("/api/v1/consumables/" + historyItem.id + "/history?limit=" + pageSize + "&offset=" + ((printPage - 1) * pageSize))
      return { items: rows, total: 0, page: printPage, page_size: pageSize, pages: 0 }
    })
    openPrintWindow({
      title: "Consumable History — " + historyItem.name, mode: "audit-history",
      columns: ["Date", "Action", "Before", "Change", "After", "User", "Note"],
      rows: all.map(row => ({ "Date": new Date(row.changed_at).toLocaleString(), "Action": row.change_type, "Before": String(row.qty_before), "Change": String(row.qty_delta), "After": String(row.qty_after), "User": row.changed_by_username ?? "System", "Note": row.note ?? "" })),
    })
  }

  const data = listQuery.data as Paginated | undefined
  const loading = listQuery.isLoading || listQuery.isFetching
  const error = mutationError ?? (listQuery.error instanceof Error ? listQuery.error.message : null)

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const pages = data?.pages ?? 1

  const historyRows = (historyQuery.data as ConsumableHistoryEntry[] | undefined) ?? []
  const historyLoading = historyQuery.isLoading
  const historyError = historyQuery.isError ? "Failed to load history" : null
  const historyHasMore = (historyQuery.data as ConsumableHistoryEntry[] | undefined)?.length === 10

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Header */}
      <PageHeader
        title="Consumables"
        description={total > 0 ? `${total} item${total !== 1 ? "s" : ""}` : "Consumable stock items"}
        breadcrumbs={[
          { label: "Inventory", href: "/dashboard/inventory" },
          { label: "Consumables" },
        ]}
        actions={<>
          <Button size="sm" variant="outline" onClick={printInventory}><Printer className="size-4 mr-1" />Print</Button>
          {admin && <Button size="sm" onClick={openCreate}><PlusIcon className="size-4 mr-1" /> New Consumable</Button>}
        </>}
      />

      <div className="p-4 md:p-6 space-y-4">
        {/* Title + search */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">Consumables</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {total > 0 ? `${total} item${total !== 1 ? "s" : ""}` : "Consumable stock items"}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {admin && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input type="checkbox" checked={showInactive}
                  onChange={(e) => toggleInactive(e.target.checked)} className="size-3 rounded" />
                Show inactive
              </label>
            )}
            <form onSubmit={e => { e.preventDefault(); submitSearch() }} className="flex gap-1.5">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text" value={searchDraft} onChange={e => setSearchDraft(e.target.value)}
                  placeholder="Search name / code / supplier…"
                  className="pl-8 pr-3 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring w-56"
                />
              </div>
              <Button type="submit" size="sm" variant="secondary">Search</Button>
              {searchTerm && <Button type="button" size="sm" variant="ghost" onClick={clearSearch}>Clear</Button>}
            </form>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Table */}
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}</div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border p-14 text-center space-y-3">
            <FlaskConical className="size-10 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {searchTerm ? `No consumables matching "${searchTerm}".` : "No consumables yet."}
            </p>
            {admin && !searchTerm && (
              <Button size="sm" onClick={openCreate}>
                <PlusIcon className="size-4 mr-1" /> Add First Consumable
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block rounded-lg border overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1020px]">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-8">#</th>
                    <th className="px-4 py-2.5 text-left font-medium w-[190px]">Name</th>
                    <th className="px-4 py-2.5 text-left font-medium w-[110px]">Code</th>
                    <th className="px-4 py-2.5 text-left font-medium w-[120px]">Storage Type</th>
                    <th className="px-4 py-2.5 text-left font-medium w-[140px]">Storage Location</th>
                    <th className="px-4 py-2.5 text-left font-medium w-[140px]">Supplier</th>
                    {admin && <th className="px-4 py-2.5 text-right font-medium">Rate / Unit</th>}
                    <th className="px-4 py-2.5 text-right font-medium">Qty</th>
                    {admin && <th className="px-4 py-2.5 text-right font-medium">Total Value</th>}
                    <th className="px-4 py-2.5 text-center font-medium">Image</th>
                    <th className="px-4 py-2.5 text-left font-medium">Updated</th>
                    <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((item, i) => (
                    <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground text-xs">{(pageNum - 1) * PAGE_SIZE + i + 1}</td>
                      <td className="px-4 py-3 font-medium max-w-[190px]"><span className="block truncate" title={item.name}>{item.name}</span></td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs max-w-[110px]">
                        {item.code ? <Badge variant="secondary" className="font-mono max-w-full truncate block">{item.code}</Badge> : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[120px]"><span className="block truncate" title={item.storage_type ?? ""}>{item.storage_type ?? "—"}</span></td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[140px]"><span className="block truncate" title={item.storage_location ?? ""}>{item.storage_location ?? "—"}</span></td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[140px]"><span className="block truncate" title={item.supplier_name ?? ""}>{item.supplier_name ?? "—"}</span></td>
                      {admin && <td className="px-4 py-3 text-right tabular-nums font-medium">{fmtRate(item.rate_per_unit)}</td>}
                      <td className={`px-4 py-3 text-right tabular-nums ${item.reorder_level > 0 && item.qty <= item.reorder_level ? "text-warning font-medium" : ""}`}>
                        <span className="inline-flex items-center gap-1 justify-end">
                          {item.reorder_level > 0 && item.qty <= item.reorder_level && <AlertTriangle className="size-3" />}
                          {item.qty % 1 === 0 ? item.qty.toFixed(0) : item.qty.toFixed(2)}
                          {item.reorder_level > 0 && <span className="text-muted-foreground text-[10px] font-normal"> /{item.reorder_level % 1 === 0 ? item.reorder_level.toFixed(0) : item.reorder_level.toFixed(2)}</span>}
                        </span>
                      </td>
                      {admin && <td className="px-4 py-3 text-right tabular-nums font-medium">{item.total_price != null ? fmtRate(item.total_price) : "—"}</td>}
                      <td className="px-4 py-3 text-center">
                        {item.image_base64
                          ? <img src={`data:image/jpeg;base64,${item.image_base64}`} alt={item.name} className="size-9 rounded object-cover mx-auto" />
                          : <ImageIcon className="size-4 text-muted-foreground/30 mx-auto" />}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(item.updated_at)}</td>
                      <td className="px-4 py-3 text-right">
                          <div className="inline-flex gap-1">
                            <Button variant="ghost" size="icon" className="size-7" title="View details" onClick={() => setViewItem(item)}>
                              <Eye className="size-3.5 text-primary" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-7" title="Add Stock" onClick={() => openAdjust(item, "add")}>
                              <PackagePlus className="size-3.5 text-success" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-7" title="Remove Stock" onClick={() => openAdjust(item, "subtract")}>
                              <PackageMinus className="size-3.5 text-warning" />
                            </Button>
                            {admin && (
                              <Button variant="ghost" size="icon" className="size-7" title="History" onClick={() => openHistory(item)}>
                                <History className="size-3.5 text-muted-foreground" />
                              </Button>
                            )}
                            {admin && (
                              <Button variant="ghost" size="icon" className="size-7" onClick={() => openEdit(item)}>
                                <Pencil className="size-3.5" />
                              </Button>
                            )}
                            {admin && (
                              item.is_active ? (
                                <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(item.id)}>
                                  <Trash2 className="size-3.5" />
                                </Button>
                              ) : (
                                <Button variant="ghost" size="icon" className="size-7 text-success hover:text-success" title="Restore (reactivate)" onClick={() => restoreMutation.mutate(item.id)}>
                                  <RotateCcw className="size-3.5" />
                                </Button>
                              )
                            )}
                          </div>
                        </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {items.map(item => (
                <div key={item.id} className="rounded-lg border p-3 bg-card">
                  <div className="flex items-start gap-3">
                    {item.image_base64
                      ? <img src={`data:image/jpeg;base64,${item.image_base64}`} alt={item.name} className="size-12 rounded-lg object-cover shrink-0" />
                      : <div className="size-12 rounded-lg bg-muted flex items-center justify-center shrink-0"><FlaskConical className="size-5 text-muted-foreground/40" /></div>}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{item.name}</p>
                      {item.code && <p className="text-xs font-mono text-muted-foreground">{item.code}</p>}
                      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {item.storage_location && <span>📍 {item.storage_location}</span>}
                        {item.storage_type && <span>📦 {item.storage_type}</span>}
                        {item.supplier_name && <span>🏢 {item.supplier_name}</span>}
                        {admin && item.rate_per_unit != null && <span>{fmtRate(item.rate_per_unit)} / unit</span>}
                        <span className={`font-semibold ${item.reorder_level > 0 && item.qty <= item.reorder_level ? "text-warning" : "text-foreground"}`}>
                          {item.reorder_level > 0 && item.qty <= item.reorder_level && <AlertTriangle className="size-3 inline mr-0.5" />}Qty: {item.qty % 1 === 0 ? item.qty.toFixed(0) : item.qty.toFixed(2)}
                          {item.reorder_level > 0 && <span className="text-muted-foreground font-normal text-[10px]"> /{item.reorder_level % 1 === 0 ? item.reorder_level.toFixed(0) : item.reorder_level.toFixed(2)}</span>}
                        </span>
                        {admin && item.total_price != null && <span className="font-medium text-foreground">Total: {fmtRate(item.total_price)}</span>}
                        <span>{fmtDate(item.updated_at)}</span>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="size-8" title="Add Stock" onClick={() => openAdjust(item, "add")}>
                        <PackagePlus className="size-3.5 text-success" />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-8" title="Remove Stock" onClick={() => openAdjust(item, "subtract")}>
                        <PackageMinus className="size-3.5 text-warning" />
                      </Button>
                      {admin && (
                        <Button variant="ghost" size="icon" className="size-8" title="History" onClick={() => openHistory(item)}>
                          <History className="size-3.5 text-muted-foreground" />
                        </Button>
                      )}
                      {admin && (
                        <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(item)}>
                          <Pencil className="size-3.5" />
                        </Button>
                      )}
                      {admin && (
                        item.is_active ? (
                          <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(item.id)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="icon" className="size-8 text-success hover:text-success" title="Restore (reactivate)" onClick={() => restoreMutation.mutate(item.id)}>
                            <RotateCcw className="size-3.5" />
                          </Button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-muted-foreground">Page {pageNum} of {pages} · {total} total</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" disabled={pageNum <= 1} onClick={() => setPage(pageNum - 1)}>
                    <ChevronLeft className="size-4 mr-1" />Prev
                  </Button>
                  <Button size="sm" variant="outline" disabled={pageNum >= pages} onClick={() => setPage(pageNum + 1)}>
                    Next<ChevronRight className="size-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Create / Edit Dialog ────────────────────────────────────── */}
      <Dialog open={dialog !== null} onOpenChange={o => !o && setDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader className="mb-2">
            <DialogTitle>{dialog === "create" ? "New Consumable" : `Edit — ${editing?.name}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="c-name">Name *</Label>
              <Input id="c-name" placeholder="e.g. Cutting Oil" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} disabled={saving} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-code">Code <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
              <Input id="c-code" placeholder="e.g. CON-001" value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))} disabled={saving} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Storage Type</Label>
                <select
                  value={formStorageCustom ? "__custom__" : (form.storage_type || "")}
                  onChange={e => {
                    if (e.target.value === "__custom__") {
                      setFormStorageCustom(true)
                      setForm(f => ({ ...f, storage_type: "" }))
                    } else {
                      setFormStorageCustom(false)
                      setForm(f => ({ ...f, storage_type: e.target.value }))
                    }
                  }}
                  disabled={saving}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">— Select —</option>
                  {STORAGE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                  <option value="__custom__">Other…</option>
                </select>
                {formStorageCustom && (
                  <Input placeholder="Enter storage type" value={form.storage_type}
                    onChange={e => setForm(f => ({ ...f, storage_type: e.target.value }))}
                    disabled={saving} className="mt-1.5" />
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-storage">Storage Location</Label>
                <Input id="c-storage" placeholder="e.g. Shelf A3" value={form.storage_location}
                  onChange={e => setForm(f => ({ ...f, storage_location: e.target.value }))} disabled={saving} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="c-supplier">Supplier Name</Label>
                <Input id="c-supplier" placeholder="e.g. Ravi Traders" value={form.supplier_name}
                  onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))} disabled={saving} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-rate">Rate / Unit (₹)</Label>
                <Input id="c-rate" type="number" min="0" step="any" placeholder="0.00" value={form.rate_per_unit}
                  onChange={e => setForm(f => ({ ...f, rate_per_unit: e.target.value }))} disabled={saving} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="c-qty">Quantity on Hand</Label>
                <Input id="c-qty" type="number" min="0" step="any" placeholder="0" value={form.qty}
                  onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} disabled={saving} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-reorder">Reorder Level</Label>
                <Input id="c-reorder" type="number" min="0" step="any" placeholder="0" value={form.reorder_level}
                  onChange={e => setForm(f => ({ ...f, reorder_level: e.target.value }))} disabled={saving} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-timeline">Timeline (days)</Label>
              <Input id="c-timeline" type="number" inputMode="numeric" min="1" step="1" placeholder="e.g. 7" value={form.timeline_days}
                onChange={e => setForm(f => ({ ...f, timeline_days: e.target.value }))} disabled={saving} />
            </div>
            <div className="space-y-1.5">
              <Label>Picture <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
              <div className="flex items-center gap-3">
                {imgPreview
                  ? <img src={imgPreview} alt="preview" className="size-14 rounded-lg object-cover border" />
                  : <div className="size-14 rounded-lg border-2 border-dashed flex items-center justify-center">
                      <ImageIcon className="size-5 text-muted-foreground/40" />
                    </div>}
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => imgRef.current?.click()} disabled={saving}>
                    {imgPreview ? "Change" : "Upload"}
                  </Button>
                  {imgPreview && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => { setImgPreview(null); setImgB64(null) }} disabled={saving}>
                      Remove
                    </Button>
                  )}
                </div>
                <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={handleImg} />
              </div>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <div className="flex gap-3 pt-1">
              <Button onClick={save} disabled={saving} className="flex-1">
                {saving ? "Saving…" : dialog === "create" ? "Create" : "Save Changes"}
              </Button>
              <Button variant="outline" onClick={() => setDialog(null)} disabled={saving}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Adjust Stock Dialog ─────────────────────────────────────── */}
      <Dialog open={adjustItem !== null} onOpenChange={o => !o && setAdjustItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader className="mb-2">
            <DialogTitle className="flex items-center gap-2">
              {adjustType === "add"
                ? <PackagePlus className="size-4 text-success" />
                : <PackageMinus className="size-4 text-warning" />}
              {adjustType === "add" ? "Add Stock" : "Remove Stock"} — {adjustItem?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
              Current qty: <span className="font-semibold tabular-nums">
                {adjustItem ? (adjustItem.qty % 1 === 0 ? adjustItem.qty.toFixed(0) : adjustItem.qty.toFixed(2)) : ""}
              </span>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adj-qty">Quantity *</Label>
              <Input id="adj-qty" type="number" min="0.001" step="any" placeholder="0"
                value={adjustQty} onChange={e => setAdjustQty(e.target.value)} disabled={adjustMutation.isPending}
                autoFocus />
            </div>
            {adjustType === "subtract" && adjustItem && (() => {
              const entered = parseFloat(adjustQty)
              if (!isNaN(entered) && entered > adjustItem.qty) {
                return (
                  <div className="flex items-start gap-1.5 rounded-md bg-warning/15 border border-warning/20 px-3 py-2 text-sm text-warning">
                    <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                    <span>Only <strong>{adjustItem.qty % 1 === 0 ? adjustItem.qty.toFixed(0) : adjustItem.qty.toFixed(2)}</strong> qty available — stock will be reduced to 0.</span>
                  </div>
                )
              }
              return null
            })()}
            <div className="space-y-1.5">
              <Label htmlFor="adj-note">Note <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
              <Input id="adj-note" placeholder="e.g. Monthly restock" value={adjustNote}
                onChange={e => setAdjustNote(e.target.value)} disabled={adjustMutation.isPending} />
            </div>
            {adjustError && <p className="text-sm text-destructive">{adjustError}</p>}
            <div className="flex gap-3 pt-1">
              <Button onClick={doAdjust} disabled={adjustMutation.isPending} className="flex-1"
                variant={adjustType === "subtract" ? "destructive" : "default"}>
                {adjustMutation.isPending ? "Saving…" : adjustType === "add" ? "Add Stock" : "Remove Stock"}
              </Button>
              <Button variant="outline" onClick={() => setAdjustItem(null)} disabled={adjustMutation.isPending}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── View Detail Dialog ───────────────────────────────────────── */}
      <Dialog open={viewItem !== null} onOpenChange={o => !o && setViewItem(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="break-words pr-6">{viewItem?.name}</DialogTitle>
          </DialogHeader>
          {viewItem && (
            <div className="space-y-4 mt-1">
              {/* Image */}
              {viewItem.image_base64 ? (
                <img src={`data:image/jpeg;base64,${viewItem.image_base64}`} alt={viewItem.name}
                  className="w-full max-h-56 object-contain rounded-lg border bg-muted/20" />
              ) : (
                <div className="w-full h-24 rounded-lg border-2 border-dashed flex items-center justify-center text-muted-foreground/30">
                  <FlaskConical className="size-10" />
                </div>
              )}

              {/* Status badges */}
              <div className="flex flex-wrap gap-1.5">
                {!viewItem.is_active && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded border bg-destructive/10 text-destructive border-destructive/20">Inactive</span>
                )}
                {viewItem.reorder_level > 0 && viewItem.qty <= viewItem.reorder_level && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border bg-warning/15 text-amber-800 border-warning/20">
                    <AlertTriangle className="size-3" /> Low Stock
                  </span>
                )}
              </div>

              {/* Details grid */}
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Details</p>
                <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
                  {viewItem.code && <><span className="text-muted-foreground whitespace-nowrap">Code</span><span className="font-mono font-medium break-all">{viewItem.code}</span></>}
                  {viewItem.supplier_name && <><span className="text-muted-foreground whitespace-nowrap">Supplier</span><span className="break-words">{viewItem.supplier_name}</span></>}
                  {(viewItem.storage_type || viewItem.storage_location) && (
                    <><span className="text-muted-foreground whitespace-nowrap">Storage</span>
                    <span className="break-words">
                      {[viewItem.storage_type, viewItem.storage_location].filter(Boolean).join(" · ")}
                    </span></>
                  )}
                  {viewItem.timeline_days != null && (
                    <><span className="text-muted-foreground whitespace-nowrap">Lead Time</span><span>{viewItem.timeline_days} day{viewItem.timeline_days !== 1 ? "s" : ""}</span></>
                  )}
                  <span className="text-muted-foreground whitespace-nowrap">Updated</span>
                  <span className="text-muted-foreground text-xs">{fmtDate(viewItem.updated_at)}</span>
                </div>
              </div>

              {/* Stock overview */}
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Stock Overview</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">On Hand</p>
                    <p className={`text-lg font-semibold tabular-nums ${viewItem.reorder_level > 0 && viewItem.qty <= viewItem.reorder_level ? "text-warning" : ""}`}>
                      {viewItem.qty % 1 === 0 ? viewItem.qty.toFixed(0) : viewItem.qty.toFixed(2)}
                    </p>
                  </div>
                  {viewItem.reorder_level > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground">Reorder Level</p>
                      <p className="text-lg font-semibold tabular-nums">
                        {viewItem.reorder_level % 1 === 0 ? viewItem.reorder_level.toFixed(0) : viewItem.reorder_level.toFixed(2)}
                      </p>
                    </div>
                  )}
                  {admin && viewItem.rate_per_unit != null && (
                    <div>
                      <p className="text-xs text-muted-foreground">Rate / Unit</p>
                      <p className="text-lg font-semibold">{fmtRate(viewItem.rate_per_unit)}</p>
                    </div>
                  )}
                  {admin && viewItem.total_price != null && (
                    <div>
                      <p className="text-xs text-muted-foreground">Total Value</p>
                      <p className="text-lg font-semibold">{fmtRate(viewItem.total_price)}</p>
                    </div>
                  )}
                </div>
                {/* Stock bar */}
                {viewItem.reorder_level > 0 && (
                  <div className="mt-3 space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>0</span>
                      <span>Reorder: {viewItem.reorder_level % 1 === 0 ? viewItem.reorder_level.toFixed(0) : viewItem.reorder_level.toFixed(2)}</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${viewItem.qty <= viewItem.reorder_level ? "bg-warning" : "bg-success"}`}
                        style={{ width: `${Math.min(100, (viewItem.qty / (viewItem.reorder_level * 2)) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── History Dialog ──────────────────────────────────────────── */}
      <Dialog open={historyItem !== null} onOpenChange={o => !o && setHistoryItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader className="mb-2">
            <DialogTitle className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2"><History className="size-4" /> Stock History — {historyItem?.name}</span>
              <Button size="sm" variant="outline" onClick={printHistory} disabled={!historyItem}><Printer className="size-3.5 mr-1" />Print</Button>
            </DialogTitle>
          </DialogHeader>
          {historyLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : historyError ? (
            <p className="text-sm text-destructive text-center py-8">{historyError}</p>
          ) : historyRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No history yet.</p>
          ) : (
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Date</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Type</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Before</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Change</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">After</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">By</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {historyRows.map(r => (
                    <tr key={r.id} className="hover:bg-muted/20">
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(r.changed_at)}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                          r.change_type === "add" ? "text-success" :
                          r.change_type === "subtract" ? "text-warning" : "text-primary"
                        }`}>
                          {r.change_type === "add" && <PackagePlus className="size-3" />}
                          {r.change_type === "subtract" && <PackageMinus className="size-3" />}
                          {r.change_type}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.qty_before % 1 === 0 ? r.qty_before.toFixed(0) : r.qty_before.toFixed(2)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-medium ${
                        r.qty_delta > 0 ? "text-success" : r.qty_delta < 0 ? "text-warning" : ""
                      }`}>
                        {r.qty_delta > 0 ? "+" : ""}{r.qty_delta % 1 === 0 ? r.qty_delta.toFixed(0) : r.qty_delta.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.qty_after % 1 === 0 ? r.qty_after.toFixed(0) : r.qty_after.toFixed(2)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.changed_by_username ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(historyPage > 1 || historyHasMore) && (
                <div className="flex items-center justify-between pt-3 pb-1">
                  <Button size="sm" variant="outline" disabled={historyPage <= 1 || historyLoading} onClick={() => changeHistoryPage(historyPage - 1)}>← Prev</Button>
                  <span className="text-sm text-muted-foreground">Page {historyPage}</span>
                  <Button size="sm" variant="outline" disabled={!historyHasMore || historyLoading} onClick={() => changeHistoryPage(historyPage + 1)}>Next →</Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ─────────────────────────────────────── */}
      <AlertDialog open={deleteId !== null} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete consumable?</AlertDialogTitle>
            <AlertDialogDescription>This will deactivate the item. It can be restored later.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} disabled={deleteMutation.isPending}>{deleteMutation.isPending ? "Deleting…" : "Delete"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
