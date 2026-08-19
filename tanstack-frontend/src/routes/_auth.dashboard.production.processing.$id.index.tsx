import { useState } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { apiFetchJson } from "@/lib/api"
import { isAdminOrAbove } from "@/lib/user"
import {
  ArrowLeft, PlusIcon,
  Factory, Clock, Package, CheckCircle,
} from "lucide-react"

export const Route = createFileRoute("/_auth/dashboard/production/processing/$id/")({
  component: ProductionOrderDetailPage,
})

// Widens a literal path to `string` for routes not yet registered in the tree.
const dynTo = (s: string) => s

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProcessItem {
  id: number
  plan_id: number
  name: string
  sequence: number
  notes: string | null
  estimated_time_minutes: number | null
}

// BOM summary line
interface BomLine {
  id: number
  raw_material_name: string | null
  raw_material_unit: string | null
  material_used: number | null
  scrap: number | null
  material_unit: string | null
}

interface JobCard {
  id: number
  card_number: string
  production_order_id: number
  process_name: string
  tool_die_number: string | null
  machine_name: string | null
  worker_name: string | null
  worker_names: string[]
  hours_worked: number
  qty_produced: number
  actual_qty: number
  qty_pending: number
  work_date: string | null
  notes: string | null
  status: string
  is_active: boolean
  job_type: string
  supplier_id: number | null
  supplier_name: string | null
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
  plan_status: string | null
  schedule_number: string | null
  customer_name: string | null
  product_description: string | null
  planned_qty: number | null
  effective_qty: number    // MIN(qty_produced) across all processes
  fg_credited: number      // FG already added to inventory
  processes: ProcessItem[]
  job_cards: JobCard[]
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
const ORDER_STATUSES = ["open", "in_progress", "completed", "cancelled"]

// ── Component ─────────────────────────────────────────────────────────────────

function ProductionOrderDetailPage() {
  const navigate = Route.useNavigate()
  const { id } = Route.useParams()
  const queryClient = useQueryClient()

  const [error, setError] = useState<string | null>(null)
  const [editProcess, setEditProcess] = useState<{ name: string; current: number } | null>(null)
  const [editProcessValue, setEditProcessValue] = useState("")

  const orderQuery = useQuery({
    queryKey: [`/api/v1/production/orders/${id}`],
    staleTime: 0,
  })

  const order = orderQuery.data as ProductionOrder | undefined
  const loading = orderQuery.isLoading || orderQuery.isFetching

  const bomQuery = useQuery({
    queryKey: [`/api/v1/bom?product_name=${order?.product_description ? encodeURIComponent(order.product_description) : ""}`],
    enabled: order != null && !!order.product_description,
    staleTime: 0,
  })

  const bomLines = ((bomQuery.data as BomLine[] | undefined) ?? [])
    .filter((l) => l.material_used != null || l.scrap != null)

  const statusMutation = useMutation({
    mutationFn: (newStatus: string) =>
      apiFetchJson(`/api/v1/production/orders/${order?.id}`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/v1/production/orders/${id}`] })
    },
    onError: (e: unknown) => {
      setError(e instanceof Error ? e.message : "Status update failed")
    },
  })

  const actualQtyMutation = useMutation({
    mutationFn: () =>
      apiFetchJson(`/api/v1/production/orders/${order?.id}/processes/${editProcess ? encodeURIComponent(editProcess.name) : ""}/actual-qty`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ total_actual_qty: parseFloat(editProcessValue) }),
      }),
    onSuccess: () => {
      setEditProcess(null)
      queryClient.invalidateQueries({ queryKey: [`/api/v1/production/orders/${id}`] })
    },
    onError: (e: unknown) => {
      setError(e instanceof Error ? e.message : "Failed to update actual qty")
    },
  })

  function changeStatus(newStatus: string) {
    if (!order) return
    setError(null)
    statusMutation.mutate(newStatus)
  }

  // Summary stats
  const totalHours    = order?.job_cards.reduce((s, jc) => s + jc.hours_worked, 0) ?? 0
  const effectiveQty  = order?.effective_qty ?? 0
  // Total estimated time = sum of estimated_time_minutes per process × planned_qty
  const totalEstimatedMinutes = order
    ? order.processes.reduce((s, p) => s + (p.estimated_time_minutes ?? 0), 0) * (order.planned_qty ?? 1)
    : 0
  const hasEstimatedTime = order ? order.processes.some((p) => p.estimated_time_minutes != null) : false
  // FG pending = how many more finished goods still need to complete all processes
  const fgPending = order?.planned_qty != null ? Math.max(0, order.planned_qty - effectiveQty) : null
  // Per-process produced / pending breakdown
  const byProcess: Array<{ name: string; produced: number; actual: number; pending: number }> = order
    ? order.processes.map((p) => {
        const produced = order.job_cards
          .filter((jc) => jc.process_name === p.name && jc.is_active)
          .reduce((s, jc) => s + jc.qty_produced, 0)
        const actual = order.job_cards
          .filter((jc) => jc.process_name === p.name && jc.is_active)
          .reduce((s, jc) => s + jc.actual_qty, 0)
        const pending = Math.max(0, (order.planned_qty ?? 0) - actual)
        return { name: p.name, produced, actual, pending }
      })
    : []
  // FG completion flags
  const plannedQty = order?.planned_qty ?? 0
  const isFgComplete = plannedQty > 0 && effectiveQty >= plannedQty
  const isFgSurplus  = plannedQty > 0 && effectiveQty > plannedQty

  return (
    <>
      <PageHeader
        title={loading ? "Loading…" : order?.order_number ?? "Not found"}
        breadcrumbs={[
          { label: "Production", href: "/dashboard/production" },
          { label: "Processing", href: "/dashboard/production/processing" },
          { label: loading ? "Loading…" : order?.order_number ?? "Not found" },
        ]}
        actions={
          <Link to="/dashboard/production/processing"
            className="p-1.5 rounded-md hover:bg-muted transition-colors" aria-label="Back">
            <ArrowLeft className="size-4" />
          </Link>
        }
      />

      <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : !order ? (
          <p className="text-muted-foreground py-10 text-center">Production order not found.</p>
        ) : (
          <>
            {/* ── Header Card ─────────────────────────────────────────────── */}
            <div className="rounded-xl border p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl font-semibold">{order.order_number}</h1>
                    <Badge variant={STATUS_BADGE[order.status] ?? "outline"} className={STATUS_COLOR[order.status] ?? ""}>
                      {STATUS_LABELS[order.status] ?? order.status}
                    </Badge>
                    {isFgComplete && (
                      <Badge className="bg-success/10 text-green-800 border-success/20">Production Complete</Badge>
                    )}
                    {isFgSurplus && (
                      <Badge className="bg-warning/15 text-amber-800 border-warning/20">Surplus</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {order.plan_number && <span className="font-mono mr-1">{order.plan_number}</span>}
                    {order.plan_title}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select value={order.status}
                    onChange={(e) => changeStatus(e.target.value)}
                    disabled={statusMutation.isPending}
                    className="rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
                    {ORDER_STATUSES.map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground block">Customer</span>
                  <span className="font-medium">{order.customer_name ?? "—"}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Product</span>
                  <span className="font-medium">{order.product_description ?? "—"}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Planned Qty</span>
                  <span className="font-medium font-mono">{order.planned_qty ?? "—"}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Dates</span>
                  <span className="font-medium">
                    {order.start_date ?? "—"}{order.end_date ? ` → ${order.end_date}` : ""}
                  </span>
                </div>
              </div>

              {order.notes && (
                <p className="text-sm text-muted-foreground italic border-t pt-3 mt-2">{order.notes}</p>
              )}
            </div>

            {/* ── Summary Stats ────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* FG Completed */}
              <div className="rounded-lg border p-3 flex items-center gap-3">
                <div className="p-2 rounded-md text-success bg-success/10"><CheckCircle className="size-4" /></div>
                <div>
                  <p className="text-lg font-semibold leading-none">{effectiveQty}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">FG Completed</p>
                </div>
              </div>
              {/* Job Cards */}
              <div className="rounded-lg border p-3 flex items-center gap-3">
                <div className="p-2 rounded-md text-primary bg-primary/10"><Factory className="size-4" /></div>
                <div>
                  <p className="text-lg font-semibold leading-none">{order.job_cards.length}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Job Cards</p>
                </div>
              </div>
              {/* FG Pending */}
              <div className="rounded-lg border p-3 flex items-center gap-3">
                <div className="p-2 rounded-md text-warning bg-warning/15"><Clock className="size-4" /></div>
                <div>
                  <p className="text-lg font-semibold leading-none">{fgPending ?? "—"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">FG Pending</p>
                  <p className="text-[10px] text-muted-foreground/70">Planned − FG done</p>
                </div>
              </div>
              {/* Total Hours */}
              <div className="rounded-lg border p-3 flex items-center gap-3">
                <div className="p-2 rounded-md text-purple-600 bg-purple-50"><Clock className="size-4" /></div>
                <div>
                  <p className="text-lg font-semibold leading-none">{totalHours.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Actual Hours</p>
                  {hasEstimatedTime && (
                    <p className="text-[10px] text-muted-foreground/70">
                      Est: {totalEstimatedMinutes < 1
                        ? `${Math.round(totalEstimatedMinutes * 60)} sec`
                        : totalEstimatedMinutes >= 60
                          ? `${(totalEstimatedMinutes / 60).toFixed(1)} hr`
                          : `${Math.round(totalEstimatedMinutes)} min`}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* ── BOM Materials Summary ──────────────────────────────────── */}
            {bomLines.length > 0 && (
              <div className="rounded-lg border overflow-hidden">
                <div className="bg-muted/40 px-4 py-2.5 flex items-center gap-2">
                  <Package className="size-4 text-muted-foreground" />
                  <span className="font-medium text-sm">Materials Used &amp; Scrap</span>
                  <span className="text-xs text-muted-foreground">— based on BOM × {effectiveQty} units produced</span>
                </div>
                <div className="divide-y text-xs">
                  <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_80px] gap-3 px-4 py-2 text-muted-foreground font-medium bg-muted/20">
                    <span>Material</span>
                    <span>Consumed</span>
                    <span>Scrap Generated</span>
                    <span>Unit</span>
                  </div>
                  {bomLines.map((l) => (
                    <div key={l.id} className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_80px] gap-2 sm:gap-3 px-4 py-2.5 hover:bg-muted/20">
                      <span className="font-medium">{l.raw_material_name ?? "—"}</span>
                      <span className={l.material_used != null ? "text-primary font-mono font-semibold" : "text-muted-foreground"}>
                        {l.material_used != null ? (l.material_used * effectiveQty).toFixed(3) : "—"}
                      </span>
                      <span className={l.scrap != null ? "text-warning font-mono font-semibold" : "text-muted-foreground"}>
                        {l.scrap != null ? (l.scrap * effectiveQty).toFixed(3) : "—"}
                      </span>
                      <span className="text-muted-foreground">{l.material_unit ?? l.raw_material_unit ?? "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* FG explanation note */}
            <div className="rounded-lg border border-dashed bg-success/10 p-3 text-xs text-muted-foreground">
              <span className="font-medium text-success">FG Completed = MIN(produced) across all processes.</span>{" "}
              A unit is only finished when it has passed through every process step.
              {order.planned_qty != null && effectiveQty < order.planned_qty && (
                <span className="ml-1">
                  Remaining: <span className="font-mono font-medium text-foreground">{order.planned_qty - effectiveQty}</span> of{" "}
                  <span className="font-mono">{order.planned_qty}</span> planned.
                </span>
              )}
            </div>

            {/* ── Per-Process Breakdown Cards ───────────────────────────── */}
            {byProcess.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Process Breakdown</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {byProcess.map((proc) => {
                    const displayActual = proc.actual > 0 ? proc.actual : proc.produced
                    const pct = (order?.planned_qty ?? 0) > 0
                      ? Math.min(100, Math.round((displayActual / (order?.planned_qty ?? 1)) * 100))
                      : 0
                    const surplus = (order?.planned_qty ?? 0) > 0 ? Math.max(0, displayActual - (order?.planned_qty ?? 0)) : 0
                    return (
                      <div key={proc.name} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-semibold truncate">{proc.name}</p>
                          {surplus > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200 shrink-0 ml-1">
                              +{surplus} surplus
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-xs mb-1.5 gap-2">
                          <span className="flex items-center gap-1">
                            <span className="text-success font-semibold">{displayActual}</span>
                            <span className="font-normal text-muted-foreground">done</span>
                          </span>
                          {isAdminOrAbove() && (
                            <button
                              type="button"
                              className="text-[10px] text-primary hover:underline shrink-0"
                              onClick={() => {
                                setEditProcess({ name: proc.name, current: displayActual })
                                setEditProcessValue(String(displayActual))
                              }}
                            >
                              Edit
                            </button>
                          )}
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${surplus > 0 ? "bg-purple-500" : "bg-success"}`}
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-[10px] text-muted-foreground">{pct}% complete</p>
                          {proc.actual > 0 && proc.produced > 0 && (
                            <span className={`text-[10px] font-medium ${proc.actual >= proc.produced ? "text-success" : "text-amber-600"}`}>
                              Actual {proc.actual >= proc.produced ? "≥" : "<"} Est ({proc.actual} vs {proc.produced})
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}



            {/* ── Aggregate Time Summary ──────────────────────────────────────── */}
            {(totalEstimatedMinutes > 0 || totalHours > 0) && (
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/30 rounded-lg p-3">
                  <div className="text-xs text-muted-foreground">Total Estimated Time</div>
                  <div className="text-lg font-bold">{Math.floor(totalEstimatedMinutes / 60)}h {totalEstimatedMinutes % 60}m</div>
                </div>
                <div className="bg-muted/30 rounded-lg p-3">
                  <div className="text-xs text-muted-foreground">Total Actual Time</div>
                  <div className="text-lg font-bold">{totalHours.toFixed(1)}h</div>
                </div>
              </div>
            )}

            {/* ── Job Cards Link ──────────────────────────────────────────────── */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Job Cards</h2>
              <div className="flex gap-2">
                <Button size="sm" variant="outline"
                  onClick={() => navigate({ href: dynTo(`/dashboard/production/processing/${order.id}/jobs`) })}>
                  View All Job Cards
                </Button>
                <Button size="sm"
                  onClick={() => navigate({ href: dynTo(`/dashboard/production/processing/${order.id}/jobs/new`) })}>
                  <PlusIcon className="size-4 mr-1" />
                  Add Job Card
                </Button>
              </div>
            </div>
            {order.job_cards.length > 0 ? (
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">
                  {order.job_cards.length} job card{order.job_cards.length !== 1 ? "s" : ""} across {order.processes.length} process{order.processes.length !== 1 ? "es" : ""}.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  <Link to={dynTo(`/dashboard/production/processing/${order.id}/jobs`)} className="text-primary hover:underline">
                    View details &rarr;
                  </Link>
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                <p>No job cards yet.</p>
                <p className="text-xs mt-1">Create a job card to start tracking production.</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Edit Process Actual Qty Dialog ─────────────────────────────────── */}
      <Dialog open={editProcess !== null} onOpenChange={(o) => !o && setEditProcess(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Set Actual Quantity</DialogTitle>
          </DialogHeader>
          {editProcess && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Process: <span className="font-medium text-foreground">{editProcess.name}</span>
              </p>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Total Actual Quantity Produced</label>
                <Input
                  type="number" step="any" min="0"
                  value={editProcessValue}
                  onChange={(e) => setEditProcessValue(e.target.value)}
                  disabled={actualQtyMutation.isPending}
                  autoFocus
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProcess(null)} disabled={actualQtyMutation.isPending}>
              Cancel
            </Button>
            <Button disabled={actualQtyMutation.isPending} onClick={() => {
              if (!editProcess || !order) return
              const val = parseFloat(editProcessValue)
              if (isNaN(val) || val < 0) return
              setError(null)
              actualQtyMutation.mutate()
            }}>
              {actualQtyMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
