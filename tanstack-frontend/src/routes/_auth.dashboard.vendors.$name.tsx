import { useEffect } from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { PageHeader } from "@/components/layout/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { isAdminOrAbove } from "@/lib/user"
import {
  ArrowLeft, Package, PackageCheck, PackageX, CalendarDays,
  TrendingDown, TrendingUp, Clock, Layers, ShoppingCart,
} from "lucide-react"

export const Route = createFileRoute("/_auth/dashboard/vendors/$name")({
  component: VendorDetailPage,
})

// Widens a literal path to `string` for routes not yet registered in the tree.
const dynTo = (s: string) => s

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScheduleEntry {
  id: number
  schedule_number: string
  description: string
  scheduled_qty: number
  backlog_qty: number
  scheduled_date: string
  status: string
  notes: string | null
}

interface POEntry {
  id: number
  po_number: string
  status: string
  po_date: string | null
  expected_delivery: string | null
  total_value: number
  supplier_name: string | null
  vendor_name: string | null
  purchase_request_number: string | null
  items: { item_name: string; quantity: number; rate: number | null; unit: string | null }[]
}

interface ProductSummary {
  product_name: string
  total_schedules: number
  active_schedules: number
  total_ordered: number
  total_backlog: number
  total_delivered: number
  next_delivery_date: string | null
  status_counts: Record<string, number>
  fg_item_id: number | null
  fg_available_qty: number | null
  fg_unit: string | null
  fg_code: string | null
}

interface FGItem {
  id: number
  code: string
  name: string
  item_type: string
  unit: string
  quantity_on_hand: number
  is_active: boolean
  has_design_drawing: boolean
}

interface VendorDetail {
  vendor_name: string
  total_schedules: number
  active_schedules: number
  total_active_qty: number
  total_backlog: number
  total_delivered: number
  status_counts: Record<string, number>
  schedules: ScheduleEntry[]
  products: ProductSummary[]
  fg_items?: FGItem[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

function daysUntil(d: string | null) {
  if (!d) return null
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000)
}

function fmt(n: number) {
  return n % 1 === 0 ? String(n) : n.toFixed(2).replace(/\.?0+$/, "")
}

const STATUS_BADGE: Record<string, string> = {
  pending:       "bg-muted text-slate-700",
  confirmed:     "bg-primary/10 text-primary",
  in_production: "bg-warning/15 text-amber-800",
  delivered:     "bg-success/10 text-emerald-800",
  cancelled:     "bg-destructive/10 text-destructive",
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending", confirmed: "Confirmed",
  in_production: "In Production", delivered: "Delivered", cancelled: "Cancelled",
}

const STATUS_RING: Record<string, string> = {
  pending:       "ring-slate-200",
  confirmed:     "ring-blue-200",
  in_production: "ring-amber-200",
  delivered:     "ring-emerald-200",
  cancelled:     "ring-red-200",
}

function avatarColor(name: string) {
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  return `hsl(${hue},55%,40%)`
}

function SectionHeader({ icon: Icon, title }: { icon: React.ComponentType<{ className?: string }>; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className="size-4 text-muted-foreground" />
      <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">{title}</h2>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

function VendorDetailPage() {
  const { name } = Route.useParams()
  const navigate = Route.useNavigate()
  const vendorName = decodeURIComponent(name)

  // Role gate: only admin/super_admin can see this page
  useEffect(() => {
    if (!isAdminOrAbove()) { navigate({ href: "/dashboard", replace: true }) }
  }, [navigate])

  // ── Fetch ───────────────────────────────────────────────────────────────────

  const detailQuery = useQuery({
    queryKey: [`/api/v1/vendors/${encodeURIComponent(vendorName)}`],
    staleTime: 0,
  })

  const poQuery = useQuery({
    queryKey: [`/api/v1/purchase-orders?vendor=${encodeURIComponent(vendorName)}&page_size=50`],
    staleTime: 0,
  })

  const data = detailQuery.data as VendorDetail | undefined
  const loading = detailQuery.isLoading || detailQuery.isFetching
  const error = detailQuery.error instanceof Error ? detailQuery.error.message : null

  const purchaseOrders = (poQuery.data as { items: POEntry[] } | undefined)?.items ?? []

  const initials = (() => {
    if (!vendorName) return ""
    const words = vendorName.trim().split(/\s+/)
    return (words.length >= 2 ? words[0][0] + words[1][0] : vendorName.slice(0, 2)).toUpperCase()
  })()

  return (
    <>
      {/* ── Header ── */}
      <PageHeader
        title={loading ? "Loading…" : vendorName}
        breadcrumbs={[
          { label: "Vendors", href: "/dashboard/vendors" },
          { label: loading ? "Loading…" : vendorName },
        ]}
        actions={
          <>
            <Link to={dynTo("/dashboard/vendors")} className="p-1.5 rounded-md hover:bg-muted transition-colors" aria-label="Back">
              <ArrowLeft className="size-4" />
            </Link>
            <Button size="sm" onClick={() => navigate({ href: "/dashboard/schedule/new" })}>
              + New Schedule
            </Button>
          </>
        }
      />

      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
        {loading && (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {!loading && data && (
          <>
            {/* ── Vendor hero ── */}
            <div className="rounded-xl border bg-card p-5 flex items-center gap-5">
              <div
                className="size-16 rounded-full flex items-center justify-center text-white text-xl font-bold shrink-0"
                style={{ backgroundColor: avatarColor(vendorName) }}
              >
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-semibold">{vendorName}</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {data.products.length} product{data.products.length !== 1 ? "s" : ""} ·{" "}
                  {data.total_schedules} schedule{data.total_schedules !== 1 ? "s" : ""}
                </p>
              </div>
            </div>

            {/* ── Stat cards ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="rounded-xl border bg-card p-4 space-y-1">
                <p className="text-xs text-muted-foreground">Active Orders</p>
                <p className="text-2xl font-bold">{fmt(data.total_active_qty)}</p>
                <p className="text-xs text-muted-foreground">units across {data.active_schedules} schedule{data.active_schedules !== 1 ? "s" : ""}</p>
              </div>
              <div className="rounded-xl border bg-card p-4 space-y-1">
                <p className="text-xs text-muted-foreground">Total Delivered</p>
                <p className="text-2xl font-bold text-success">{fmt(data.total_delivered)}</p>
                <p className="text-xs text-muted-foreground">units lifetime</p>
              </div>
              <div className="rounded-xl border bg-card p-4 space-y-1">
                <p className="text-xs text-muted-foreground">Carry-over Backlog</p>
                <p className={`text-2xl font-bold ${data.total_backlog > 0 ? "text-warning" : ""}`}>
                  {fmt(data.total_backlog)}
                </p>
                <p className="text-xs text-muted-foreground">units from prev. periods</p>
              </div>
              <div className="rounded-xl border bg-card p-4 space-y-1">
                <p className="text-xs text-muted-foreground">Total Schedules</p>
                <p className="text-2xl font-bold">{data.total_schedules}</p>
                <div className="flex gap-1.5 flex-wrap mt-1">
                  {Object.entries(data.status_counts)
                    .filter(([, c]) => c > 0)
                    .map(([s, c]) => (
                      <span key={s} className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_BADGE[s] ?? "bg-muted"}`}>
                        {c} {STATUS_LABEL[s] ?? s}
                      </span>
                    ))}
                </div>
              </div>
            </div>

            <Separator />

            {/* ── Products breakdown ── */}
            <div className="rounded-xl border bg-card p-5">
              <SectionHeader icon={Layers} title="Products Ordered" />
              <div className="space-y-4">
                {data.products.map((p) => {
                  const days = daysUntil(p.next_delivery_date)
                  const urgent = days !== null && days <= 14
                  const hasFG = p.fg_item_id !== null
                  const fgCoverage = hasFG && p.fg_available_qty !== null && p.total_ordered > 0
                    ? p.fg_available_qty >= p.total_ordered
                    : null

                  return (
                    <div key={p.product_name} className={`rounded-lg border p-4 ${urgent ? "border-warning/20 bg-warning/15" : ""}`}>
                      <div className="flex items-start gap-3 flex-wrap">
                        {/* Product name + FG link */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {hasFG ? (
                              <Link to={dynTo(`/dashboard/inventory/${p.fg_item_id}`)} className="font-semibold text-sm hover:underline text-primary">
                                {p.product_name}
                              </Link>
                            ) : (
                              <span className="font-semibold text-sm">{p.product_name}</span>
                            )}
                            {p.fg_code && (
                              <span className="text-xs font-mono text-muted-foreground">{p.fg_code}</span>
                            )}
                            {urgent && p.next_delivery_date && (
                              <span className="text-xs bg-warning/15 text-amber-800 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                                <Clock className="size-3" />
                                {days === 0 ? "Due today" : days < 0 ? `${Math.abs(days)}d overdue` : `Due in ${days}d`}
                              </span>
                            )}
                          </div>

                          {/* Mini stats */}
                          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                            {p.total_ordered > 0 && (
                              <span className="flex items-center gap-1">
                                <Package className="size-3" />
                                {fmt(p.total_ordered)} {p.fg_unit ?? "units"} ordered
                              </span>
                            )}
                            {p.total_backlog > 0 && (
                              <span className="text-warning flex items-center gap-1">
                                <TrendingDown className="size-3" />
                                {fmt(p.total_backlog)} backlog
                              </span>
                            )}
                            {p.total_delivered > 0 && (
                              <span className="text-success flex items-center gap-1">
                                <TrendingUp className="size-3" />
                                {fmt(p.total_delivered)} delivered
                              </span>
                            )}
                            {p.next_delivery_date && (
                              <span className="flex items-center gap-1">
                                <CalendarDays className="size-3" />
                                Next: {fmtDate(p.next_delivery_date)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* FG stock badge */}
                        {hasFG && p.fg_available_qty !== null && (
                          <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg ring-1 ${
                            fgCoverage
                              ? "bg-success/10 text-success ring-emerald-200"
                              : "bg-destructive/10 text-destructive ring-red-200"
                          }`}>
                            {fgCoverage
                              ? <PackageCheck className="size-3.5" />
                              : <PackageX className="size-3.5" />}
                            {fmt(p.fg_available_qty)} {p.fg_unit} in stock
                            {!fgCoverage && p.total_ordered > 0 && (
                              <span>· Shortfall {fmt(p.total_ordered - p.fg_available_qty)}</span>
                            )}
                          </div>
                        )}
                        {!hasFG && (
                          <span className="text-xs text-muted-foreground px-2 py-1 rounded-lg ring-1 ring-muted">
                            No FG inventory match
                          </span>
                        )}
                      </div>

                      {/* Status pills */}
                      <div className="mt-3 flex gap-1.5 flex-wrap">
                        {Object.entries(p.status_counts)
                          .filter(([, c]) => c > 0)
                          .map(([s, c]) => (
                            <span key={s} className={`text-xs px-2 py-0.5 rounded-full font-medium ring-1 ${STATUS_BADGE[s] ?? "bg-muted"} ${STATUS_RING[s] ?? ""}`}>
                              {c}× {STATUS_LABEL[s] ?? s}
                            </span>
                          ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── Finished Goods ── */}
            {data.fg_items && data.fg_items.length > 0 && (
              <div className="rounded-xl border bg-card p-5">
                <SectionHeader icon={Package} title={`Finished Goods (${data.fg_items.length})`} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {data.fg_items.map((fg) => (
                    <Link
                      key={fg.id}
                      to={dynTo(`/dashboard/inventory/${fg.id}`)}
                      className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">{fg.name}</span>
                          <span className="text-xs font-mono text-muted-foreground">{fg.code}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                          <span>{fg.item_type === "finished_good" ? "Finished Good" : "Semi-Finished"}</span>
                          <span>·</span>
                          <span className={fg.quantity_on_hand > 0 ? "text-success" : "text-warning"}>
                            {fg.quantity_on_hand} {fg.unit} in stock
                          </span>
                          {fg.has_design_drawing && (
                            <>
                              <span>·</span>
                              <span className="text-primary">Has Drawing</span>
                            </>
                          )}
                        </div>
                      </div>
                      {!fg.is_active && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                          Inactive
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* ── All schedules ── */}
            <div className="rounded-xl border bg-card p-5">
              <SectionHeader icon={CalendarDays} title="All Schedules" />

              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {data.schedules.map((s) => {
                  const days = daysUntil(s.scheduled_date)
                  return (
                    <div key={s.id} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mono text-xs">{s.schedule_number}</p>
                          <p className="font-medium text-sm truncate">{s.description}</p>
                        </div>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${STATUS_BADGE[s.status] ?? "bg-muted"}`}>
                          {STATUS_LABEL[s.status] ?? s.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <div><span className="text-muted-foreground">Ordered:</span> <span className="font-medium">{fmt(s.scheduled_qty)}</span></div>
                        <div>
                          <span className="text-muted-foreground">Backlog:</span>{" "}
                          {s.backlog_qty > 0 ? <span className="text-warning">{fmt(s.backlog_qty)}</span> : "—"}
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">Delivery:</span> {fmtDate(s.scheduled_date)}
                          {days !== null && days <= 7 && days >= 0 && <Clock className="size-3 text-warning" />}
                        </div>
                      </div>
                      <div className="flex justify-end pt-1 border-t">
                        <Button variant="ghost" size="sm" className="h-7 text-xs"
                          onClick={() => navigate({ href: dynTo(`/dashboard/schedule/${s.id}/edit`) })}>Edit</Button>
                      </div>
                    </div>
                  )
                })}
                {data.total_active_qty > 0 && (
                  <div className="flex items-center justify-between text-xs px-1 pt-1 border-t">
                    <span className="text-muted-foreground font-medium">Active Total</span>
                    <span className="font-semibold">{fmt(data.total_active_qty)}
                      {data.total_backlog > 0 && <span className="ml-2 text-warning">(backlog: {fmt(data.total_backlog)})</span>}
                    </span>
                  </div>
                )}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto -mx-1">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-xs">
                      <th className="text-left py-2 pr-4 font-medium">Schedule #</th>
                      <th className="text-left py-2 pr-4 font-medium">Product</th>
                      <th className="text-right py-2 pr-4 font-medium">Ordered</th>
                      <th className="text-right py-2 pr-4 font-medium">Backlog</th>
                      <th className="text-left py-2 pr-4 font-medium">Delivery</th>
                      <th className="text-left py-2 pr-4 font-medium">Status</th>
                      <th className="text-right py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.schedules.map((s) => {
                      const days = daysUntil(s.scheduled_date)
                      return (
                        <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2.5 pr-4">
                            <span className="font-mono text-xs">{s.schedule_number}</span>
                          </td>
                          <td className="py-2.5 pr-4 font-medium max-w-[180px] truncate">{s.description}</td>
                          <td className="py-2.5 pr-4 text-right tabular-nums">{fmt(s.scheduled_qty)}</td>
                          <td className="py-2.5 pr-4 text-right tabular-nums">
                            {s.backlog_qty > 0
                              ? <span className="text-warning">{fmt(s.backlog_qty)}</span>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="py-2.5 pr-4">
                            <div className="flex items-center gap-1.5">
                              <span>{fmtDate(s.scheduled_date)}</span>
                              {days !== null && days <= 7 && days >= 0 && (
                                <Clock className="size-3 text-warning" />
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 pr-4">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[s.status] ?? "bg-muted"}`}>
                              {STATUS_LABEL[s.status] ?? s.status}
                            </span>
                          </td>
                          <td className="py-2.5 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => navigate({ href: dynTo(`/dashboard/schedule/${s.id}/edit`) })}
                            >
                              Edit
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {data.total_active_qty > 0 && (
                    <tfoot>
                      <tr className="border-t bg-muted/30">
                        <td colSpan={2} className="py-2 pr-4 text-xs font-medium text-muted-foreground">Active Total</td>
                        <td className="py-2 pr-4 text-right tabular-nums font-semibold">{fmt(data.total_active_qty)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums font-semibold text-warning">
                          {data.total_backlog > 0 ? fmt(data.total_backlog) : "—"}
                        </td>
                        <td colSpan={3} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* ── Current jobs (in-production schedules, prominently) ── */}
            {(() => {
              const inProd = data.schedules.filter(s => s.status === "in_production")
              if (inProd.length === 0) return null
              return (
                <div className="rounded-xl border-2 border-warning/20 bg-warning/15 p-5">
                  <SectionHeader icon={Clock} title={`Current Jobs (${inProd.length})`} />
                  <div className="space-y-2">
                    {inProd.map(s => {
                      const days = daysUntil(s.scheduled_date)
                      return (
                        <div key={s.id} className="rounded-lg border bg-card p-3 flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-mono text-xs text-muted-foreground">{s.schedule_number}</p>
                            <p className="font-medium text-sm truncate">{s.description}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Qty: <span className="font-semibold text-foreground">{fmt(s.scheduled_qty)}</span>
                              {s.backlog_qty > 0 && <span className="text-warning ml-2">+{fmt(s.backlog_qty)} backlog</span>}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs text-muted-foreground">Delivery</p>
                            <p className="text-sm font-medium">{fmtDate(s.scheduled_date)}</p>
                            {days !== null && (
                              <p className={`text-xs font-medium ${days < 0 ? "text-destructive" : days <= 7 ? "text-warning" : "text-success"}`}>
                                {days === 0 ? "Today" : days < 0 ? `${Math.abs(days)}d overdue` : `in ${days}d`}
                              </p>
                            )}
                          </div>
                          <Button
                            size="sm" variant="outline" className="h-7 text-xs"
                            onClick={() => navigate({ href: dynTo(`/dashboard/schedule/${s.id}/edit`) })}
                          >
                            Open
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* ── Purchase orders ── */}
            <div className="rounded-xl border bg-card p-5">
              <SectionHeader icon={ShoppingCart} title={`Purchase Orders (${purchaseOrders.length})`} />
              {purchaseOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No purchase orders linked to this vendor.</p>
              ) : (
                <div className="space-y-2">
                  {purchaseOrders.map(po => (
                    <div key={po.id} className="rounded-lg border p-3 hover:bg-muted/20 transition-colors">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-xs">{po.po_number}</span>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                            po.status === "received" ? "bg-success/10 text-success" :
                            po.status === "approved" ? "bg-primary/10 text-primary" :
                            po.status === "cancelled" ? "bg-destructive/10 text-destructive" :
                            "bg-muted text-slate-700"
                          }`}>
                            {po.status}
                          </span>
                          {po.purchase_request_number && (
                            <span className="text-[10px] text-primary font-mono">PR: {po.purchase_request_number}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                          {po.po_date && <span>Created: {fmtDate(po.po_date)}</span>}
                          {po.expected_delivery && <span>Due: {fmtDate(po.expected_delivery)}</span>}
                          {po.total_value > 0 && <span className="font-mono font-semibold text-foreground">₹{po.total_value.toLocaleString("en-IN")}</span>}
                        </div>
                      </div>
                      {po.items.length > 0 && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          {po.items.slice(0, 3).map((it, i) => (
                            <span key={i}>
                              {it.item_name}{it.quantity ? ` × ${it.quantity}` : ""}{i < Math.min(po.items.length, 3) - 1 ? ", " : ""}
                            </span>
                          ))}
                          {po.items.length > 3 && <span> +{po.items.length - 3} more</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}
