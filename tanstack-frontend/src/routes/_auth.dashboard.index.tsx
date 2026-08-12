import { useEffect, useMemo, useState } from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import {
  Package, Calendar, ClipboardList, Factory, Wrench,
  TrendingUp, ArrowUpRight, ArrowDownRight, Minus, FlaskConical,
  Paperclip, Scissors, Box, Layers, Truck, PackageCheck, PackagePlus,
  CheckCircle2, Clock,
} from "lucide-react"
import { canAccessInventory, isAdminOrAbove, getCurrentUser } from "@/lib/user"
import type { RequestListItem } from "@/lib/requests"
import { StatCard } from "@/components/dashboard/stat-card"
import { PageHeader } from "@/components/layout/page-header"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_auth/dashboard/")({
  component: DashboardPage,
})

// Widens a literal path to `string` for routes not yet registered in the tree.
const dynTo = (s: string) => s

// ── Types ─────────────────────────────────────────────────────────────────────

interface OverviewCounts {
  total_inventory_items: number
  low_stock_alerts: number
  total_schedules: number
  total_plans: number
  total_orders: number
  total_job_cards: number
}

interface RecentInventory {
  id: number
  entity_name: string | null
  changed_by_username: string | null
  change_type: string
  qty_delta: number | null
  qty_after: number | null
  changed_at: string
  note: string | null
}

interface DashboardData {
  overview: OverviewCounts
}

interface ScheduleRow {
  id: number
  schedule_number: string
  customer_name: string
  description: string
  scheduled_date: string
  scheduled_qty: number
  backlog_qty: number
  status: string
}

interface InvCard {
  id: string
  label: string
  href: string
  icon: React.ReactNode
  accent: string
  count: number | null
  lowStock: number | null
  value: number | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CHANGE_ICON: Record<string, React.ReactNode> = {
  add: <ArrowUpRight className="size-3.5 text-success" />,
  subtract: <ArrowDownRight className="size-3.5 text-destructive" />,
  create: <TrendingUp className="size-3.5 text-primary" />,
  set: <Minus className="size-3.5 text-warning" />,
  edit: <Minus className="size-3.5 text-muted-foreground" />,
}

const CHANGE_LABEL: Record<string, string> = {
  create: "Created",
  add: "Stock added",
  subtract: "Stock removed",
  set: "Stock set",
  edit: "Edited",
}

const REQ_TYPE_LABEL: Record<string, string> = {
  internal_transfer: "Internal",
  vendor_purchase: "Vendor purchase",
  customer_dispatch: "Customer dispatch",
}

const REQ_STATUS_CHIP: Record<string, string> = {
  pending: "bg-warning/15 text-amber-800 border-warning/20",
  approved: "bg-success/10 text-emerald-800 border-success/20",
  in_progress: "bg-primary/10 text-blue-800 border-primary/20",
  awaiting_signoff: "bg-tone-violet/10 text-violet-800 border-tone-violet/20",
  received: "bg-success/10 text-emerald-800 border-success/20",
  not_approved: "bg-destructive/10 text-destructive border-destructive/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
}

const SCHED_STATUS_CHIP: Record<string, string> = {
  pending: "bg-warning/15 text-amber-800",
  confirmed: "bg-primary/10 text-blue-800",
  in_production: "bg-success/10 text-emerald-800",
  completed: "bg-tone-violet/10 text-violet-800",
  delivered: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
}

function fmtQty(n: number | null | undefined) {
  if (n == null) return "—"
  return n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)
}

function fmtCurrencyShort(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1).replace(/\.0$/, "")}Cr`
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1).replace(/\.0$/, "")}L`
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`
  return `₹${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function timeAgo(iso: string) {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString()
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function DashSkeleton() {
  return (
    <div className="animate-pulse space-y-6 p-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-muted" />
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-muted" />
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="h-64 rounded-xl bg-muted" />
        <div className="h-64 rounded-xl bg-muted" />
      </div>
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</h2>
      {right}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

function DashboardPage() {
  // Re-read the session snapshot when the tab regains focus or another tab
  // updates storage, so permission refreshes are picked up.
  const [refreshKey, setRefreshKey] = useState(0)
  useEffect(() => {
    const bump = () => setRefreshKey((k) => k + 1)
    window.addEventListener("focus", bump)
    window.addEventListener("storage", bump)
    return () => {
      window.removeEventListener("focus", bump)
      window.removeEventListener("storage", bump)
    }
  }, [])
  const user = useMemo(() => getCurrentUser(), [refreshKey])

  const admin = user ? user.role === "admin" || user.role === "super_admin" : isAdminOrAbove()
  const canGrn = !!user?.grn_access || admin
  const canDispatch = !!user?.dispatch_access || admin
  const canGatePass = !!user?.gate_pass_access || admin

  const dashboardQuery = useQuery({
    queryKey: ["/api/v1/dashboard"],
    staleTime: 0,
    refetchOnWindowFocus: true,
  })

  // Inventory overview — single endpoint, always fresh (active items only)
  const invSummaryQuery = useQuery({
    queryKey: ["/api/v1/dashboard/inventory-summary"],
    staleTime: 0,
    refetchOnWindowFocus: true,
  })

  // ── Needs-action counts (permission-aware) ─────────────────────────────────
  const pendingRequestsQuery = useQuery({
    queryKey: ["/api/v1/requests?status=pending&limit=500"],
    staleTime: 30_000,
  })
  const dispatchQuery = useQuery({
    queryKey: ["/api/v1/dispatch?status_filter=pending&page_size=1"],
    enabled: canDispatch,
    staleTime: 30_000,
  })
  const grnDraftQuery = useQuery({
    queryKey: ["/api/v1/grn?status_filter=draft&page_size=1"],
    enabled: canGrn,
    staleTime: 30_000,
  })
  const grnPartialQuery = useQuery({
    queryKey: ["/api/v1/grn?status_filter=partially_filled&page_size=1"],
    enabled: canGrn,
    staleTime: 30_000,
  })
  const gatePassesQuery = useQuery({
    queryKey: ["/api/v1/gate-passes?page_size=100"],
    enabled: canGatePass,
    staleTime: 30_000,
  })

  // ── Upcoming deliveries (users) ────────────────────────────────────────────
  const schedulesQuery = useQuery({
    queryKey: ["/api/v1/schedules?page_size=500&include_inactive=false"],
    enabled: !admin,
    staleTime: 60_000,
  })

  const pendingRequests = (pendingRequestsQuery.data as RequestListItem[] | undefined) ?? []
  const pendingCount = pendingRequests.length
  const awaitingApproval = pendingRequests.slice(0, 5)

  const dispatchPending = (dispatchQuery.data as { total: number } | undefined)?.total ?? 0
  const grnPending =
    ((grnDraftQuery.data as { total: number } | undefined)?.total ?? 0) +
    ((grnPartialQuery.data as { total: number } | undefined)?.total ?? 0)
  const gatePassRows = (gatePassesQuery.data as { items: { status: string }[] } | undefined)?.items ?? []
  const gatePassPending = gatePassRows.filter((g) => g.status === "open").length

  // ── Inventory cards (uniform) — from the single summary endpoint ───────────
  const invCards = useMemo<InvCard[]>(() => {
    const summary = invSummaryQuery.data as
      | { types: Record<string, { count: number; low_stock: number; value: number | null }> }
      | undefined

    const typeKey: Record<string, string> = {
      finished_good: "finished_good",
      raw_material: "raw_material",
      semi_finished: "semi_finished",
      spares: "spare",
      consumables: "consumable",
      attachments: "attachment",
      weeders: "weeder",
    }
    const accessKey: Record<string, string> = {
      finished_good: "finished_good",
      raw_material: "raw_material",
      semi_finished: "semi_finished",
      spares: "spare",
      consumables: "consumable",
      attachments: "attachment",
      weeders: "weeder",
    }

    const cards: InvCard[] = [
      { id: "finished_good", label: "Finished Goods", href: "/dashboard/inventory/finished-goods", icon: <Package className="size-5" />, accent: "bg-tone-emerald/10 text-tone-emerald", count: null, lowStock: null, value: null },
      { id: "raw_material", label: "Raw Materials", href: "/dashboard/inventory/raw-materials", icon: <Box className="size-5" />, accent: "bg-tone-amber/15 text-tone-amber", count: null, lowStock: null, value: null },
      { id: "semi_finished", label: "Semi Finished", href: "/dashboard/inventory/semi-finished", icon: <Layers className="size-5" />, accent: "bg-tone-violet/10 text-tone-violet", count: null, lowStock: null, value: null },
      { id: "spares", label: "Spares", href: "/dashboard/inventory/spares", icon: <Wrench className="size-5" />, accent: "bg-warning/15 text-warning", count: null, lowStock: null, value: null },
      { id: "consumables", label: "Consumables", href: "/dashboard/inventory/consumables", icon: <FlaskConical className="size-5" />, accent: "bg-primary/10 text-primary", count: null, lowStock: null, value: null },
      { id: "attachments", label: "Attachments", href: "/dashboard/inventory/attachments", icon: <Paperclip className="size-5" />, accent: "bg-tone-violet/10 text-tone-violet", count: null, lowStock: null, value: null },
      { id: "weeders", label: "Weeders", href: "/dashboard/inventory/weeders", icon: <Scissors className="size-5" />, accent: "bg-success/10 text-success", count: null, lowStock: null, value: null },
    ]

    return cards
      .filter((c) => canAccessInventory(accessKey[c.id]))
      .map((c) => {
        const t = summary?.types[typeKey[c.id]]
        return {
          ...c,
          count: t?.count ?? null,
          lowStock: t?.low_stock ?? null,
          value: t?.value ?? null,
        }
      })
  }, [invSummaryQuery.data])

  // ── Upcoming deliveries (users) ────────────────────────────────────────────
  const upcomingDeliveries = useMemo(() => {
    const rows = (schedulesQuery.data as { items: ScheduleRow[] } | undefined)?.items ?? []
    const now = new Date()
    const cutoff = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    return rows
      .filter((s) => {
        if (s.status === "delivered" || s.status === "cancelled") return false
        const d = new Date(s.scheduled_date)
        return d >= now && d <= cutoff
      })
      .sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime())
      .slice(0, 6)
  }, [schedulesQuery.data])

  // ── Recent inventory activity (admin; history endpoint carries the user) ──
  const historyQuery = useQuery({
    queryKey: ["/api/v1/history/inventory?page_size=10"],
    enabled: admin,
    staleTime: 0,
    refetchOnWindowFocus: true,
  })

  const recentActivity = (historyQuery.data as { items: RecentInventory[] } | undefined)?.items?.slice(0, 10) ?? []
  const recentLoading = historyQuery.isLoading || historyQuery.isFetching

  if (dashboardQuery.isError) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <div className="p-6">
          <p className="text-sm text-destructive">
            {dashboardQuery.error instanceof Error ? dashboardQuery.error.message : "Failed to load dashboard"}
          </p>
        </div>
      </>
    )
  }

  if (!dashboardQuery.data) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <DashSkeleton />
      </>
    )
  }

  const data = dashboardQuery.data as unknown as DashboardData
  const o = data.overview

  const actionItems = [
    {
      id: "requests",
      label: "Requests",
      href: "/dashboard/requests",
      icon: <ClipboardList className="size-5" />,
      accent: "bg-tone-blue/10 text-tone-blue",
      ring: "group-hover:ring-tone-blue/30",
      count: pendingCount,
    },
    {
      id: "dispatch",
      label: "Dispatch",
      href: "/dashboard/dispatch",
      icon: <Truck className="size-5" />,
      accent: "bg-tone-emerald/10 text-tone-emerald",
      ring: "group-hover:ring-tone-emerald/30",
      count: dispatchPending,
      enabled: canDispatch,
    },
    {
      id: "grn",
      label: "GRN",
      href: "/dashboard/grn",
      icon: <PackageCheck className="size-5" />,
      accent: "bg-tone-amber/15 text-tone-amber",
      ring: "group-hover:ring-tone-amber/30",
      count: grnPending,
      enabled: canGrn,
    },
    {
      id: "gate_passes",
      label: "Gate Passes",
      href: "/dashboard/gate-passes",
      icon: <PackagePlus className="size-5" />,
      accent: "bg-tone-violet/10 text-tone-violet",
      ring: "group-hover:ring-tone-violet/30",
      count: gatePassPending,
      enabled: canGatePass,
    },
  ].filter((a) => a.enabled !== false)

  const kpi: { label: string; value: number | string; icon: React.ReactNode; tone: "neutral" | "destructive" | "success" | "blue" | "amber" | "emerald" | "violet" }[] = [
    { label: "Schedules", value: o.total_schedules, icon: <Calendar className="size-5" />, tone: "blue" },
    { label: "Production Plans", value: o.total_plans, icon: <ClipboardList className="size-5" />, tone: "amber" },
    { label: "Production Orders", value: o.total_orders, icon: <Factory className="size-5" />, tone: "emerald" },
    { label: "Job Cards", value: o.total_job_cards, icon: <Wrench className="size-5" />, tone: "violet" },
  ]

  return (
    <>
      <PageHeader
        title="Dashboard"
        actions={
          <span className="text-xs text-muted-foreground">
            Last refreshed:{" "}
            {dashboardQuery.dataUpdatedAt
              ? new Date(dashboardQuery.dataUpdatedAt).toLocaleTimeString()
              : "Loading…"}
          </span>
        }
      />

      <div className="flex flex-col gap-6 p-4 md:p-6 overflow-auto">

        {/* ── Inventory overview (uniform cards) ─────────────────────────── */}
        <section>
          <SectionTitle>Inventory Overview</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {invCards.map((c) => (
              <Link
                key={c.id}
                to={dynTo(c.href)}
                className="group rounded-xl border bg-card p-4 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className={cn("flex size-8 items-center justify-center rounded-lg", c.accent)}>
                    {c.icon}
                  </div>
                  <p className="text-sm font-semibold truncate">{c.label}</p>
                </div>
                {c.count === null ? (
                  <div className="h-12 flex items-center">
                    <span className="text-xs text-muted-foreground animate-pulse">Loading…</span>
                  </div>
                ) : c.count === 0 ? (
                  <p className="text-sm text-muted-foreground py-1.5">No items</p>
                ) : (
                  <>
                    <div className="flex items-end justify-between gap-2">
                      <p className="text-2xl font-bold leading-none tabular-nums">{c.count}</p>
                      <span className={cn("text-[11px] font-medium rounded-full px-2 py-0.5",
                        c.lowStock && c.lowStock > 0 ? "bg-warning/15 text-amber-800" : "bg-success/10 text-emerald-800")}>
                        {c.lowStock && c.lowStock > 0 ? `${c.lowStock} low` : "in stock"}
                      </span>
                    </div>
                    {admin && c.value !== null && (
                      <p className="text-xs text-muted-foreground mt-1.5">
                        Value:{" "}
                        {c.value > 0 ? (
                          <span className="font-semibold text-success">{fmtCurrencyShort(c.value)}</span>
                        ) : (
                          <span className="font-semibold">—</span>
                        )}
                      </p>
                    )}
                  </>
                )}
              </Link>
            ))}
          </div>
        </section>

        {/* ── Needs action (permission-aware pending counts) ──────────────── */}
        <section>
          <SectionTitle>Needs Action</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {actionItems.map((a) => (
              <Link
                key={a.id}
                to={dynTo(a.href)}
                className={cn(
                  "group relative rounded-xl border bg-card p-4 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 ring-1 ring-transparent",
                  a.ring
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn("flex size-10 items-center justify-center rounded-lg shrink-0", a.accent)}>
                    {a.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight">{a.label}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">View →</p>
                  </div>
                  <div className="shrink-0 text-right">
                    {a.count > 0 ? (
                      <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-full bg-destructive text-white text-sm font-bold tabular-nums">
                        {a.count > 99 ? "99+" : a.count}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success">
                        <CheckCircle2 className="size-3.5" /> Clear
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Two-column: approvals/pending + activity/deliveries ─────────── */}
        <section className="grid lg:grid-cols-2 gap-4">
          {/* Pending requests */}
          <div className="rounded-xl border bg-card shadow-sm p-5">
            <SectionTitle
              right={
                pendingCount > 0 ? (
                  <Link to={dynTo("/dashboard/requests")} className="text-xs text-primary hover:underline">
                    View all {pendingCount} →
                  </Link>
                ) : undefined
              }
            >
              {admin ? "Requests Awaiting Approval" : "My Pending Requests"}
            </SectionTitle>
            {pendingRequestsQuery.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-14 rounded-lg bg-muted/60 animate-pulse" />
                ))}
              </div>
            ) : awaitingApproval.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                <CheckCircle2 className="size-8 opacity-30" />
                <p className="text-sm">{admin ? "No requests waiting for approval." : "You have no pending requests."}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {awaitingApproval.map((r) => (
                  <Link
                    key={r.id}
                    to={dynTo(`/dashboard/requests?highlight=${r.id}`)}
                    className="flex items-center gap-3 rounded-lg border px-3 py-2.5 hover:bg-muted/40 transition-colors"
                  >
                    <span className="font-mono text-xs font-medium text-primary shrink-0">{r.sn_no}</span>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {REQ_TYPE_LABEL[r.request_type] ?? r.request_type}
                    </span>
                    <span className="text-xs text-muted-foreground truncate flex-1">
                      {r.requested_by_username ?? "—"}
                      {r.department_label ? ` · ${r.department_label}` : ""}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">{fmtQty(r.quantity)}</span>
                    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full border shrink-0 capitalize", REQ_STATUS_CHIP[r.status] ?? "bg-muted")}>
                      {r.status.replace(/_/g, " ")}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Admin: recent inventory activity · Users: upcoming deliveries */}
          {admin ? (
            <div className="rounded-xl border bg-card shadow-sm p-5">
              <SectionTitle>Recent Inventory Activity</SectionTitle>
              {recentLoading && recentActivity.length === 0 ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-12 rounded-lg bg-muted/60 animate-pulse" />
                  ))}
                </div>
              ) : recentActivity.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                  <Clock className="size-8 opacity-30" />
                  <p className="text-sm">No recent inventory activity.</p>
                </div>
              ) : (
                <div className="relative pl-5">
                  <div className="absolute left-[7px] top-1.5 bottom-1.5 w-px bg-border" />
                  <div className="space-y-3.5">
                    {recentActivity.map((a) => (
                      <div key={a.id} className="relative">
                        <span className="absolute -left-5 top-0.5 size-[15px] rounded-full border bg-card flex items-center justify-center">
                          {CHANGE_ICON[a.change_type] ?? <Minus className="size-3 text-muted-foreground" />}
                        </span>
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-sm font-medium truncate" title={a.entity_name ?? ""}>
                            {a.entity_name ?? "—"}
                          </p>
                          <span className="text-[11px] text-muted-foreground shrink-0">{timeAgo(a.changed_at)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {CHANGE_LABEL[a.change_type] ?? a.change_type}
                          {a.qty_delta != null && (
                            <span className={cn("font-medium", a.qty_delta >= 0 ? "text-success" : "text-destructive")}>
                              {" "}
                              {a.qty_delta >= 0 ? "+" : ""}
                              {fmtQty(a.qty_delta)}
                            </span>
                          )}
                          {a.qty_after != null && <span> → {fmtQty(a.qty_after)}</span>}
                          {a.note && <span className="italic"> · {a.note}</span>}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          by <span className="font-medium text-foreground/70">{a.changed_by_username ?? "System"}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border bg-card shadow-sm p-5">
              <SectionTitle
                right={
                  <Link to={dynTo("/dashboard/schedule")} className="text-xs text-primary hover:underline">
                    Open Schedule →
                  </Link>
                }
              >
                Upcoming Deliveries · 7 days
              </SectionTitle>
              {schedulesQuery.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-14 rounded-lg bg-muted/60 animate-pulse" />
                  ))}
                </div>
              ) : upcomingDeliveries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                  <Calendar className="size-8 opacity-30" />
                  <p className="text-sm">No deliveries due in the next 7 days.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {upcomingDeliveries.map((s) => (
                    <Link
                      key={s.id}
                      to={dynTo(`/dashboard/schedule/${s.id}/edit`)}
                      className="flex items-center gap-3 rounded-lg border px-3 py-2.5 hover:bg-muted/40 transition-colors"
                    >
                      <span className="flex flex-col items-center justify-center size-10 rounded-lg bg-muted/60 shrink-0">
                        <span className="text-sm font-bold leading-none tabular-nums">{new Date(s.scheduled_date).getDate()}</span>
                        <span className="text-[9px] uppercase text-muted-foreground mt-0.5">
                          {new Date(s.scheduled_date).toLocaleDateString("en-IN", { month: "short" })}
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-mono text-xs font-medium truncate">{s.schedule_number}</span>
                        <span className="block text-xs text-muted-foreground truncate">{s.customer_name}</span>
                      </span>
                      <span className="text-right shrink-0">
                        <span className="block text-sm font-semibold tabular-nums">{fmtQty(s.scheduled_qty)}</span>
                        {s.backlog_qty > 0 && (
                          <span className="block text-[10px] font-medium text-warning">backlog {fmtQty(s.backlog_qty)}</span>
                        )}
                      </span>
                      <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0", SCHED_STATUS_CHIP[s.status] ?? "bg-muted")}>
                        {s.status.replace(/_/g, " ")}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── Overview (misc cards) ──────────────────────────────────────── */}
        <section>
          <SectionTitle>Overview</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {kpi.map((k) => (
              <StatCard key={k.label} label={k.label} value={k.value} icon={k.icon} tone={k.tone} />
            ))}
          </div>
        </section>
      </div>
    </>
  )
}