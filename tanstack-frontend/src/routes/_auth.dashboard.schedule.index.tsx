import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { apiFetchJson } from "@/lib/api"
import { isAdminOrAbove } from "@/lib/user"
import { PlusIcon, Pencil, Trash2, AlertTriangle, ChevronLeft, ChevronRight, Search, History, Truck, Printer } from "lucide-react"
import { openPrintWindow } from "@/lib/print-report"

export const Route = createFileRoute("/_auth/dashboard/schedule/")({
  validateSearch: z.object({
    tab: z.string().optional(),
    page: z.coerce.number().optional(),
    inactive: z.enum(["1"]).optional(),
    search: z.string().optional(),
  }),
  component: SchedulePage,
})

// Widens a literal path to `string` for routes not yet registered in the tree.
const dynTo = (s: string) => s

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScheduleItem {
  id: number
  schedule_number: string
  customer_name: string
  description: string
  scheduled_date: string
  scheduled_qty: number
  backlog_qty: number
  total_qty: number
  notes: string | null
  status: string
  is_active: boolean
  created_at: string | null
}

interface ScheduleHistoryEntry {
  id: number
  schedule_id: number
  changed_by_username: string | null
  changed_at: string
  old_status: string | null
  new_status: string
  note: string | null
}

interface PaginatedSchedules {
  items: ScheduleItem[]
  total: number
  page: number
  page_size: number
  pages: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-warning/15 text-amber-800",
  confirmed: "bg-primary/10 text-blue-800",
  in_production: "bg-success/10 text-emerald-800",
  completed: "bg-tone-violet/10 text-violet-800",
  delivered: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  in_production: "In Production",
  completed: "Completed",
  delivered: "Delivered",
  cancelled: "Cancelled",
}

const TABS = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "confirmed", label: "Confirmed" },
  { id: "in_production", label: "In Production" },
  { id: "completed", label: "Completed" },
  { id: "delivered", label: "Delivered" },
  { id: "cancelled", label: "Cancelled" },
]

function fmt(n: number) {
  return n % 1 === 0 ? String(n) : n.toFixed(2).replace(/\.?0+$/, "")
}

function fmtDate(d: string | null) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

function fmtDateTime(d: string | null) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

// ── Page ──────────────────────────────────────────────────────────────────────

function SchedulePage() {
  const navigate = Route.useNavigate()
  const { tab, page, inactive, search } = Route.useSearch()
  const queryClient = useQueryClient()

  const tabId = tab ?? "all"
  const pageNum = Math.max(1, page ?? 1)
  const showInactive = inactive === "1"
  const searchTerm = search ?? ""

  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [searchDraft, setSearchDraft] = useState(searchTerm)
  const [admin] = useState(() => isAdminOrAbove())

  // History modal state
  const [historySchedule, setHistorySchedule] = useState<ScheduleItem | null>(null)

  // Mark as delivered state
  const [markDeliverId, setMarkDeliverId] = useState<number | null>(null)

  const listUrl = (() => {
    const params = new URLSearchParams({
      page: String(pageNum),
      page_size: "20",
      include_inactive: String(showInactive),
    })
    if (tabId !== "all") params.set("status_filter", tabId)
    if (searchTerm) params.set("search", searchTerm)
    return `/api/v1/schedules?${params}`
  })()

  const listQuery = useQuery({
    queryKey: [listUrl],
    staleTime: 0,
  })

  const historyQuery = useQuery({
    queryKey: [`/api/v1/schedules/${historySchedule?.id}/history`],
    enabled: historySchedule !== null,
    staleTime: 0,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetchJson(`/api/v1/schedules/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setDeleteId(null)
      queryClient.invalidateQueries({ queryKey: ["/api/v1/schedules"] })
    },
    onError: (e: unknown) => {
      alert(e instanceof Error ? e.message : "Delete failed")
    },
  })

  const deliverMutation = useMutation({
    mutationFn: (id: number) => apiFetchJson(`/api/v1/schedules/${id}/mark-delivered`, { method: "POST" }),
    onSuccess: () => {
      setMarkDeliverId(null)
      queryClient.invalidateQueries({ queryKey: ["/api/v1/schedules"] })
    },
    onError: (e: unknown) => {
      alert(e instanceof Error ? e.message : "Mark delivered failed")
    },
  })

  // ── Navigation helpers ─────────────────────────────────────────────────────
  function setTab(t: string) { navigate({ search: { tab: t, page: 1, inactive, search: searchTerm } }) }
  function setPage(n: number) { navigate({ search: { tab: tabId, page: n, inactive, search: searchTerm } }) }
  function toggleInactive(v: boolean) { navigate({ search: { tab: tabId, page: 1, inactive: v ? "1" : undefined, search: searchTerm } }) }
  function submitSearch() { navigate({ search: { tab: tabId, page: 1, inactive, search: searchDraft.trim() || undefined } }) }
  function clearSearch() { navigate({ search: { tab: tabId, page: 1, inactive, search: undefined } }) }

  function printHistory() {
    const historyRows = historyQuery.data as ScheduleHistoryEntry[] | undefined
    if (!historySchedule || !historyRows) return
    openPrintWindow({
      title: "Schedule History - " + historySchedule.schedule_number, mode: "audit-history",
      columns: ["Timestamp", "User", "Previous Status", "New Status", "Note"],
      rows: historyRows.map((row) => ({ "Timestamp": fmtDateTime(row.changed_at), "User": row.changed_by_username ?? "System", "Previous Status": row.old_status ? (STATUS_LABELS[row.old_status] ?? row.old_status) : "", "New Status": STATUS_LABELS[row.new_status] ?? row.new_status, "Note": row.note ?? "" })),
    })
  }

  const data = listQuery.data as PaginatedSchedules | undefined
  const loading = listQuery.isLoading || listQuery.isFetching
  const error = listQuery.error instanceof Error ? listQuery.error.message : null

  const schedules = data?.items ?? []
  const totalPages = data?.pages ?? 1
  const total = data?.total ?? 0
  const pageStart = ((pageNum - 1) * 20) + 1
  const pageEnd = Math.min(pageNum * 20, total)

  const historyRows = (historyQuery.data as ScheduleHistoryEntry[] | undefined) ?? []
  const historyLoading = historyQuery.isLoading

  return (
    <>
      <PageHeader
        title="Schedule"
        description="Vendor / OEM delivery schedules — the starting point for production planning."
        breadcrumbs={[{ label: "Schedule" }]}
        actions={admin ? (
          <Button size="sm" onClick={() => navigate({ href: "/dashboard/schedule/new" })}>
            <PlusIcon className="size-4 mr-1" />
            New Schedule
          </Button>
        ) : undefined}
      />

      <div className="p-4 md:p-6 space-y-4">
        {/* Status tabs + Search */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex items-center gap-1 border-b overflow-x-auto flex-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={[
                  "px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px",
                  tabId === t.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {t.label}
              </button>
            ))}
            <div className="ml-auto pb-1 shrink-0 pl-2">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => toggleInactive(e.target.checked)}
                  className="size-3 rounded"
                />
                Show inactive
              </label>
            </div>
          </div>
          {/* Search */}
          <form onSubmit={(e) => { e.preventDefault(); submitSearch() }} className="flex gap-1.5 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder="Search vendor / product…"
                className="pl-8 pr-3 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring w-48"
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
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border p-4"><Skeleton className="h-24 w-full" /></div>
            ))
          ) : schedules.length === 0 ? (
            <div className="rounded-lg border px-4 py-12 text-center text-muted-foreground text-sm">
              No schedules found. Click &quot;New Schedule&quot; to add one.
            </div>
          ) : (
            schedules.map((s) => (
              <div key={s.id} className={`rounded-lg border p-4 space-y-2.5 ${!s.is_active ? "opacity-60" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-medium">{s.schedule_number}</p>
                    <p className="font-medium truncate">{s.customer_name}</p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLOR[s.status] ?? "bg-muted"}`}>
                    {STATUS_LABELS[s.status] ?? s.status}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground truncate">{s.description}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div><span className="text-muted-foreground">Delivery:</span> {fmtDate(s.scheduled_date)}</div>
                  <div><span className="text-muted-foreground">Sch. Qty:</span> <span className="font-medium">{fmt(s.scheduled_qty)}</span></div>
                  {s.backlog_qty > 0 && (
                    <div className="text-warning"><AlertTriangle className="size-3 inline mr-0.5" />Backlog: {fmt(s.backlog_qty)}</div>
                  )}
                  <div><span className="text-muted-foreground">Total:</span> <span className="font-semibold">{fmt(s.total_qty)}</span></div>
                </div>
                {admin && (
                  <div className="flex justify-end gap-1 pt-1 border-t">
                    {s.status === "completed" && (
                      <Button variant="ghost" size="sm" className="h-8 text-xs text-tone-violet hover:text-violet-900"
                        onClick={() => setMarkDeliverId(s.id)} title="Mark as Delivered">
                        <Truck className="size-3.5 mr-1" />Deliver
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="size-8"
                      onClick={() => setHistorySchedule(s)} title="History">
                      <History className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-8"
                      onClick={() => navigate({ href: dynTo(`/dashboard/schedule/${s.id}/edit`) })} title="Edit">
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(s.id)} title="Deactivate">
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Table (desktop) */}
        <div className="hidden md:block rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-3 text-left font-medium">Sch #</th>
                  <th className="px-4 py-3 text-left font-medium">Vendor</th>
                  <th className="px-4 py-3 text-left font-medium">Product</th>
                  <th className="px-4 py-3 text-left font-medium">Created</th>
                  <th className="px-4 py-3 text-left font-medium">Delivery</th>
                  <th className="px-4 py-3 text-right font-medium">Sch. Qty</th>
                  <th className="px-4 py-3 text-right font-medium">Backlog</th>
                  <th className="px-4 py-3 text-right font-medium">Total Qty</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 10 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : schedules.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                      No schedules found. Click &quot;New Schedule&quot; to add one.
                    </td>
                  </tr>
                ) : (
                  schedules.map((s) => (
                    <tr key={s.id} className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${!s.is_active ? "opacity-60" : ""}`}>
                      <td className="px-4 py-3 font-mono text-xs font-medium">{s.schedule_number}</td>
                      <td className="px-4 py-3 font-medium max-w-[140px] truncate" title={s.customer_name}>
                        {s.customer_name}
                        {!s.is_active && <span className="ml-1 text-xs text-muted-foreground">(inactive)</span>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[180px] truncate" title={s.description}>
                        {s.description}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {fmtDateTime(s.created_at)}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {fmtDate(s.scheduled_date)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmt(s.scheduled_qty)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {s.backlog_qty > 0 ? (
                          <span className="flex items-center justify-end gap-1 text-warning">
                            <AlertTriangle className="size-3" />
                            {fmt(s.backlog_qty)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">
                        {fmt(s.total_qty)}
                        {s.backlog_qty > 0 && (
                          <div className="text-xs font-normal text-warning">incl. backlog</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[s.status] ?? "bg-muted"}`}>
                          {STATUS_LABELS[s.status] ?? s.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-1">
                          {admin && s.status === "completed" && (
                            <Button variant="ghost" size="sm" className="h-8 text-xs text-tone-violet hover:text-violet-900"
                              onClick={() => setMarkDeliverId(s.id)} title="Mark as Delivered">
                              <Truck className="size-3.5 mr-1" />Deliver
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="size-8"
                            onClick={() => setHistorySchedule(s)} title="History">
                            <History className="size-3.5" />
                          </Button>
                          {admin && (
                            <>
                              <Button
                                variant="ghost" size="icon" className="size-8"
                                onClick={() => navigate({ href: dynTo(`/dashboard/schedule/${s.id}/edit`) })}
                                title="Edit"
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                variant="ghost" size="icon"
                                className="size-8 text-destructive hover:text-destructive"
                                onClick={() => setDeleteId(s.id)}
                                title="Deactivate"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {/* Summary footer */}
              {!loading && schedules.length > 0 && (
                <tfoot>
                  <tr className="border-t bg-muted/20">
                    <td colSpan={5} className="px-4 py-2 text-xs text-muted-foreground">
                      Showing {pageStart}–{pageEnd} of {total}
                    </td>
                    <td className="px-4 py-2 text-right text-xs font-semibold tabular-nums">
                      {fmt(schedules.reduce((a, s) => a + s.scheduled_qty, 0))}
                    </td>
                    <td className="px-4 py-2 text-right text-xs font-semibold tabular-nums">
                      {(() => { const b = schedules.reduce((a, s) => a + s.backlog_qty, 0); return b > 0 ? <span className="text-warning">{fmt(b)}</span> : "—" })()}
                    </td>
                    <td className="px-4 py-2 text-right text-xs font-semibold tabular-nums">
                      {fmt(schedules.reduce((a, s) => a + s.total_qty, 0))}
                    </td>
                    <td colSpan={2} />
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
              Page {pageNum} of {totalPages} &mdash; {total} record{total !== 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                disabled={pageNum <= 1}
                onClick={() => setPage(pageNum - 1)}
                title="Previous page"
              >
                <ChevronLeft className="size-4" />
              </Button>

              {/* Page number buttons (show up to 5 around current) */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - pageNum) <= 2)
                .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1]) > 1) acc.push("…")
                  acc.push(p)
                  return acc
                }, [])
                .map((p, i) =>
                  p === "…" ? (
                    <span key={`ellipsis-${i}`} className="px-1 text-muted-foreground text-sm">…</span>
                  ) : (
                    <Button
                      key={p}
                      variant={p === pageNum ? "default" : "outline"}
                      size="icon"
                      className="size-8"
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </Button>
                  )
                )}

              <Button
                variant="outline"
                size="icon"
                className="size-8"
                disabled={pageNum >= totalPages}
                onClick={() => setPage(pageNum + 1)}
                title="Next page"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Delete / Deactivate dialog */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the schedule as inactive. It can be re-activated via Edit.
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

      {/* Mark as Delivered confirmation */}
      <AlertDialog open={markDeliverId !== null} onOpenChange={(o) => !o && setMarkDeliverId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as Delivered?</AlertDialogTitle>
            <AlertDialogDescription>
              This will move the schedule from <strong>Completed</strong> to <strong>Delivered</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deliverMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deliverMutation.mutate(markDeliverId!)} disabled={deliverMutation.isPending}>
              {deliverMutation.isPending ? "Marking…" : "Mark as Delivered"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* History dialog */}
      <Dialog open={historySchedule !== null} onOpenChange={(o) => !o && setHistorySchedule(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2"><span>History — {historySchedule?.schedule_number}</span><Button size="sm" variant="outline" onClick={printHistory} disabled={historyRows.length === 0}><Printer className="size-3.5 mr-1" />Print</Button></DialogTitle>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto space-y-2 text-sm">
            {historyLoading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : historyRows.length === 0 ? (
              <p className="text-muted-foreground text-center py-6">No status changes recorded yet.</p>
            ) : (
              historyRows.map((h) => (
                <div key={h.id} className="rounded-md border p-2.5 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {h.old_status && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_COLOR[h.old_status] ?? "bg-muted"}`}>
                        {STATUS_LABELS[h.old_status] ?? h.old_status}
                      </span>
                    )}
                    {h.old_status && <span className="text-muted-foreground text-xs">→</span>}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_COLOR[h.new_status] ?? "bg-muted"}`}>
                      {STATUS_LABELS[h.new_status] ?? h.new_status}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <span>{h.changed_by_username ?? "system"}</span>
                    <span>·</span>
                    <span>{fmtDateTime(h.changed_at)}</span>
                  </div>
                  {h.note && <p className="text-xs italic">{h.note}</p>}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
