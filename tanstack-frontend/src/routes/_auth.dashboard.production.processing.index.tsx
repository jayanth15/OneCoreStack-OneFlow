import { useState } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { apiFetchJson } from "@/lib/api"
import { isAdminOrAbove } from "@/lib/user"
import {
  ArrowLeft, PlusIcon, Eye, Trash2,
  Search, ChevronLeft, ChevronRight,
  Factory, Clock, CheckCircle2, XCircle,
} from "lucide-react"

export const Route = createFileRoute("/_auth/dashboard/production/processing/")({
  validateSearch: z.object({
    tab: z.string().optional(),
    page: z.coerce.number().optional(),
    inactive: z.enum(["1"]).optional(),
    search: z.string().optional(),
  }),
  component: ProductionOrdersPage,
})

// Widens a literal path to `string` for routes not yet registered in the tree.
const dynTo = (s: string) => s

// ── Types ─────────────────────────────────────────────────────────────────────

interface JobCardSummary {
  id: number
  card_number: string
  process_name: string
  worker_name: string | null
  status: string
  qty_produced: number
  qty_pending: number
}

interface ProductionOrder {
  id: number
  order_number: string
  production_plan_id: number
  start_date: string | null
  end_date: string | null
  notes: string | null
  status: string
  is_active: boolean
  plan_number: string | null
  plan_title: string | null
  customer_name: string | null
  product_description: string | null
  planned_qty: number | null
  effective_qty: number
  job_cards: JobCardSummary[]
}

interface PaginatedOrders {
  items: ProductionOrder[]
  total: number
  page: number
  page_size: number
  pages: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  open: "secondary", in_progress: "secondary", completed: "outline", cancelled: "destructive",
}
const STATUS_COLOR: Record<string, string> = {
  open: "", in_progress: "!bg-warning/15 !text-amber-800", completed: "", cancelled: "",
}
const STATUS_LABELS: Record<string, string> = {
  open: "Open", in_progress: "In Progress", completed: "Completed", cancelled: "Cancelled",
}
const FILTER_TABS = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "in_progress", label: "In Progress" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
]

function SummaryCards({ items }: { items: ProductionOrder[] }) {
  const open = items.filter((o) => o.status === "open").length
  const prog = items.filter((o) => o.status === "in_progress").length
  const done = items.filter((o) => o.status === "completed").length
  const canc = items.filter((o) => o.status === "cancelled").length
  const cards = [
    { label: "Open", value: open, icon: Factory, color: "text-primary bg-primary/10" },
    { label: "In Progress", value: prog, icon: Clock, color: "text-warning bg-warning/15" },
    { label: "Completed", value: done, icon: CheckCircle2, color: "text-success bg-success/10" },
    { label: "Cancelled", value: canc, icon: XCircle, color: "text-destructive bg-destructive/10" },
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border p-3 flex items-center gap-3">
          <div className={`p-2 rounded-md ${c.color}`}><c.icon className="size-4" /></div>
          <div>
            <p className="text-lg font-semibold leading-none">{c.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{c.label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

function ProductionOrdersPage() {
  const navigate = Route.useNavigate()
  const { tab, page, inactive, search } = Route.useSearch()
  const queryClient = useQueryClient()

  const tabId = tab ?? "all"
  const pageNum = Math.max(1, page ?? 1)
  const showInactive = inactive === "1"
  const searchTerm = search ?? ""

  const [searchDraft, setSearchDraft] = useState(searchTerm)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [admin] = useState(() => isAdminOrAbove())

  const listUrl = (() => {
    const params = new URLSearchParams({
      page: String(pageNum), page_size: "20", include_inactive: String(showInactive),
    })
    if (tabId !== "all") params.set("status_filter", tabId)
    if (searchTerm) params.set("search", searchTerm)
    return `/api/v1/production/orders?${params}`
  })()

  const listQuery = useQuery({
    queryKey: [listUrl],
    staleTime: 0,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetchJson(`/api/v1/production/orders/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setDeleteId(null)
      queryClient.invalidateQueries({ queryKey: ["/api/v1/production"] })
    },
    onError: (e: unknown) => {
      alert(e instanceof Error ? e.message : "Delete failed")
    },
  })

  // ── Navigation helpers ─────────────────────────────────────────────────────
  function setTab(t: string) { navigate({ search: { tab: t, page: 1, inactive, search: searchTerm } }) }
  function setPage(n: number) { navigate({ search: { tab: tabId, page: n, inactive, search: searchTerm } }) }
  function toggleInactive(v: boolean) { navigate({ search: { tab: tabId, page: 1, inactive: v ? "1" : undefined, search: searchTerm } }) }
  function submitSearch() { navigate({ search: { tab: tabId, page: 1, inactive, search: searchDraft.trim() || undefined } }) }
  function clearSearch() { navigate({ search: { tab: tabId, page: 1, inactive, search: undefined } }) }

  const data = listQuery.data as PaginatedOrders | undefined
  const loading = listQuery.isLoading || listQuery.isFetching
  const error = listQuery.error instanceof Error ? listQuery.error.message : null

  const orders = data?.items ?? []
  const totalPages = data?.pages ?? 1
  const total = data?.total ?? 0
  const pageStart = ((pageNum - 1) * 20) + 1
  const pageEnd = Math.min(pageNum * 20, total)

  return (
    <>
      <PageHeader
        title="Production Processing"
        description="Start production orders and manage job cards for each process step."
        breadcrumbs={[
          { label: "Production", href: "/dashboard/production" },
          { label: "Processing" },
        ]}
        actions={
          <>
            <Link to="/dashboard/production"
              className="p-1.5 rounded-md hover:bg-muted transition-colors" aria-label="Back">
              <ArrowLeft className="size-4" />
            </Link>
            {admin && (
              <Button size="sm" onClick={() => navigate({ href: "/dashboard/production/processing/new" })}>
                <PlusIcon className="size-4 mr-1" />
                Start Production
              </Button>
            )}
          </>
        }
      />

      <div className="p-4 md:p-6 space-y-4">
        {!loading && orders.length > 0 && <SummaryCards items={orders} />}

        {/* Filter tabs + Search */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex items-center gap-1 border-b overflow-x-auto flex-1">
            {FILTER_TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={[
                  "px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap",
                  tabId === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                ].join(" ")}>
                {t.label}
              </button>
            ))}
            <div className="ml-auto pb-1 shrink-0 pl-2">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input type="checkbox" checked={showInactive}
                  onChange={(e) => toggleInactive(e.target.checked)} className="size-3 rounded" />
                Show inactive
              </label>
            </div>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); submitSearch(); }} className="flex gap-1.5 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <input type="text" value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)} placeholder="Search order #…"
                className="pl-8 pr-3 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring w-44" />
            </div>
            <Button type="submit" size="sm" variant="secondary">Search</Button>
            {searchTerm && (
              <Button type="button" size="sm" variant="ghost"
                onClick={clearSearch}>Clear</Button>
            )}
          </form>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Mobile cards */}
        <div className="md:hidden space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border p-4"><Skeleton className="h-28 w-full" /></div>
            ))
          ) : orders.length === 0 ? (
            <div className="rounded-lg border px-4 py-10 text-center text-muted-foreground text-sm">
              {searchTerm ? `No production orders matching "${searchTerm}".` : 'No production orders yet. Click "Start Production" to begin.'}
            </div>
          ) : orders.map((o) => (
            <div key={o.id}
              onClick={() => navigate({ href: dynTo(`/dashboard/production/processing/${o.id}`) })}
              className="rounded-lg border p-4 space-y-2.5 cursor-pointer active:bg-muted/30">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-xs font-medium">{o.order_number}</p>
                  <p className="text-sm font-medium truncate">
                    {o.plan_number && <span className="font-mono mr-1">{o.plan_number}</span>}
                    {o.plan_title}
                  </p>
                  {!o.is_active && <span className="text-xs text-muted-foreground">(inactive)</span>}
                </div>
                <div className="flex flex-wrap gap-1 shrink-0">
                  <Badge variant={STATUS_BADGE[o.status] ?? "outline"} className={`text-xs ${STATUS_COLOR[o.status] ?? ""}`}>
                    {STATUS_LABELS[o.status] ?? o.status}
                  </Badge>
                  {o.planned_qty != null && o.planned_qty > 0 && o.effective_qty >= o.planned_qty && (
                    <Badge className="text-xs bg-success/10 text-green-800 border-success/20">Complete</Badge>
                  )}
                  {o.planned_qty != null && o.planned_qty > 0 && o.effective_qty > o.planned_qty && (
                    <Badge className="text-xs bg-warning/15 text-amber-800 border-warning/20">Surplus</Badge>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {o.customer_name && <div className="truncate"><span className="text-muted-foreground">Customer:</span> {o.customer_name}</div>}
                {o.product_description && <div className="truncate"><span className="text-muted-foreground">Product:</span> {o.product_description}</div>}
                {o.planned_qty != null && <div><span className="text-muted-foreground">Planned:</span> <span className="font-mono">{o.planned_qty}</span></div>}
                <div><span className="text-muted-foreground">FG Done:</span> <span className="font-mono text-success font-medium">{o.effective_qty}</span></div>
                <div><span className="text-muted-foreground">Jobs:</span> <span className="font-medium">{o.job_cards.length}</span></div>
                {o.start_date && <div><span className="text-muted-foreground">Dates:</span> {o.start_date}{o.end_date ? ` → ${o.end_date}` : ""}</div>}
              </div>
              <div className="flex justify-end gap-1 pt-1 border-t" onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="size-8"
                  onClick={() => navigate({ href: dynTo(`/dashboard/production/processing/${o.id}`) })} title="View">
                  <Eye className="size-3.5" />
                </Button>
                {admin && (
                  <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive"
                    onClick={() => setDeleteId(o.id)} title="Deactivate">
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Table (desktop) */}
        <div className="hidden md:block rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-3 text-left font-medium">Order #</th>
                  <th className="px-4 py-3 text-left font-medium">Plan</th>
                  <th className="px-4 py-3 text-left font-medium">Customer</th>
                  <th className="px-4 py-3 text-left font-medium">Product</th>
                  <th className="px-4 py-3 text-right font-medium">Planned Qty</th>
                  <th className="px-4 py-3 text-right font-medium">FG Done</th>
                  <th className="px-4 py-3 text-left font-medium hidden lg:table-cell">Dates</th>
                  <th className="px-4 py-3 text-center font-medium">Jobs</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 10 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">
                      {searchTerm
                        ? `No production orders matching "${searchTerm}".`
                        : 'No production orders yet. Click "Start Production" to begin.'}
                    </td>
                  </tr>
                ) : orders.map((o) => (
                  <tr key={o.id}
                    onClick={() => navigate({ href: dynTo(`/dashboard/production/processing/${o.id}`) })}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer">
                    <td className="px-4 py-3 font-mono text-xs font-medium">{o.order_number}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-xs">
                        {o.plan_number && <span className="font-mono mr-1">{o.plan_number}</span>}
                        {o.plan_title}
                      </div>
                      {!o.is_active && <span className="text-xs text-muted-foreground">(inactive)</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{o.customer_name ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{o.product_description ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-right font-mono">{o.planned_qty ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-right font-mono text-success font-medium">{o.effective_qty}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                      {o.start_date ?? "—"}{o.end_date ? ` → ${o.end_date}` : ""}
                    </td>
                    <td className="px-4 py-3 text-center text-xs font-medium">{o.job_cards.length}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={STATUS_BADGE[o.status] ?? "outline"} className={`text-xs ${STATUS_COLOR[o.status] ?? ""}`}>
                          {STATUS_LABELS[o.status] ?? o.status}
                        </Badge>
                        {o.planned_qty != null && o.planned_qty > 0 && o.effective_qty >= o.planned_qty && (
                          <Badge className="text-xs bg-success/10 text-green-800 border-success/20">Complete</Badge>
                        )}
                        {o.planned_qty != null && o.planned_qty > 0 && o.effective_qty > o.planned_qty && (
                          <Badge className="text-xs bg-warning/15 text-amber-800 border-warning/20">Surplus</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="size-8"
                          onClick={() => navigate({ href: dynTo(`/dashboard/production/processing/${o.id}`) })} title="View">
                          <Eye className="size-3.5" />
                        </Button>
                        {admin && (
                          <Button variant="ghost" size="icon"
                            className="size-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteId(o.id)} title="Deactivate">
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              {!loading && orders.length > 0 && (
                <tfoot>
                  <tr className="border-t bg-muted/20">
                    <td colSpan={10} className="px-4 py-2 text-xs text-muted-foreground">
                      Showing {pageStart}–{pageEnd} of {total}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-sm text-muted-foreground">
              Page {pageNum} of {totalPages} &mdash; {total} order{total !== 1 ? "s" : ""}
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
                    <Button key={p} variant={p === pageNum ? "default" : "outline"} size="icon"
                      className="size-8" onClick={() => setPage(p)}>{p}</Button>
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

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate production order?</AlertDialogTitle>
            <AlertDialogDescription>This will mark the production order as inactive.</AlertDialogDescription>
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
