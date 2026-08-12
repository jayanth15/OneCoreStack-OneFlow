import { useRef, useState } from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { PageHeader } from "@/components/layout/page-header"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { apiFetchJson } from "@/lib/api"
import { isAdminOrAbove } from "@/lib/user"
import {
  Pencil, Package, PackageCheck, PackageX,
  Factory, Users, Layers, TrendingDown, TrendingUp,
  MapPin, BarChart3, Wrench, Building2, FileText, Upload, ExternalLink, Scale,
} from "lucide-react"

export const Route = createFileRoute("/_auth/dashboard/inventory/$id")({
  component: InventoryDetailPage,
})

// Widens a literal path to `string` for routes not yet registered in the tree.
const dynTo = (s: string) => s

// ── Types ─────────────────────────────────────────────────────────────────────

interface BomUsage {
  bom_id: number
  is_active: boolean
  product_name: string
  qty_per_unit: number
  unit: string
  notes: string | null
  fg_item_id: number | null
  fg_available_qty: number | null
  fg_unit: string | null
  active_schedule_count: number
  total_active_demand: number
  rm_needed_for_demand: number
  rm_shortfall: number
  can_produce: number
}

interface BomRequirement {
  bom_id: number
  raw_material_id: number
  raw_material_code: string
  raw_material_name: string
  unit: string
  qty_per_unit: number
  available_qty: number
  reorder_level: number
  required_for_demand: number
  shortfall: number
  can_produce: number
  notes: string | null
}

interface ScheduleEntry {
  id: number
  schedule_number: string
  customer_name: string
  scheduled_qty: number
  backlog_qty: number
  scheduled_date: string
  status: string
  notes: string | null
}

interface ItemDetail {
  id: number
  code: string
  name: string
  item_type: string
  unit_name: string | null
  quantity_on_hand: number
  reorder_level: number
  storage_type: string | null
  storage_location: string | null
  is_active: boolean
  updated_at: string
  rate: number | null
  weight_value: number | null
  weight_unit_name: string | null
  image_base64: string | null
  vendor_name?: string | null
  has_design_drawing?: boolean
  // RM
  bom_usage?: BomUsage[]
  // FG / SFG
  schedules?: ScheduleEntry[]
  total_ordered?: number
  total_backlog?: number
  fg_shortfall?: number
  bom_requirements?: BomRequirement[]
  production_capacity?: number | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  raw_material: "Raw Material",
  finished_good: "Finished Good",
  semi_finished: "Semi-Finished",
}

const TYPE_COLOR: Record<string, string> = {
  raw_material: "bg-tone-amber/15 text-orange-800 border-orange-200",
  finished_good: "bg-success/10 text-emerald-800 border-success/20",
  semi_finished: "bg-primary/10 text-sky-800 border-sky-200",
}

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-muted text-slate-700",
  confirmed: "bg-primary/10 text-primary",
  in_production: "bg-warning/15 text-amber-800",
  delivered: "bg-success/10 text-emerald-800",
  cancelled: "bg-destructive/10 text-destructive",
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending", confirmed: "Confirmed",
  in_production: "In Production", delivered: "Delivered", cancelled: "Cancelled",
}

function fmt(n: number, dp = 2) {
  return n % 1 === 0 ? String(n) : n.toFixed(dp).replace(/\.?0+$/, "")
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-semibold ${warn ? "text-destructive" : ""}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function SectionHeader({ icon: Icon, title }: { icon: React.ComponentType<{ className?: string }>; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="size-4 text-muted-foreground" />
      <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">{title}</h2>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

function InventoryDetailPage() {
  const { id } = Route.useParams()
  const navigate = Route.useNavigate()
  const admin = isAdminOrAbove()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pdfUploading, setPdfUploading] = useState(false)
  const [pdfViewing, setPdfViewing] = useState(false)

  const detailQuery = useQuery({
    queryKey: [`/api/v1/inventory/${id}/detail`],
    staleTime: 0,
  })

  const item = detailQuery.data as ItemDetail | undefined
  const loading = detailQuery.isLoading || detailQuery.isFetching
  const error = detailQuery.error instanceof Error ? detailQuery.error.message : null

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPdfUploading(true)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      await apiFetchJson(`/api/v1/inventory/${id}/drawing`, {
        method: "PUT",
        body: JSON.stringify({ design_drawing_pdf: base64 }),
      })
      detailQuery.refetch()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setPdfUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function handleViewDrawing() {
    setPdfViewing(true)
    try {
      const res = await apiFetchJson<{ design_drawing_pdf: string }>(
        `/api/v1/inventory/${id}/drawing`
      )
      const dataUrl = res.design_drawing_pdf
      const rawBase64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl
      const byteStr = atob(rawBase64)
      const arr = new Uint8Array(byteStr.length)
      for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i)
      const blob = new Blob([arr], { type: "application/pdf" })
      const url = URL.createObjectURL(blob)
      window.open(url, "_blank")
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to load drawing")
    } finally {
      setPdfViewing(false)
    }
  }

  const isLow = item ? item.quantity_on_hand <= item.reorder_level : false

  return (
    <>
      {/* ── Header ── */}
      <PageHeader
        title={loading ? "Loading…" : (item?.name ?? "Item")}
        breadcrumbs={[
          { label: "Inventory", href: "/dashboard/inventory" },
          { label: loading ? "Loading…" : (item?.name ?? "Item") },
        ]}
        actions={!loading && item ? (
          <Button size="sm" variant="outline" className="gap-2" onClick={() => navigate({ href: `/dashboard/inventory/${id}/edit` })}>
            <Pencil className="size-3.5" /> Edit
          </Button>
        ) : undefined}
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

        {!loading && item && (
          <>
            {/* ── Item header card ── */}
            <div className="rounded-xl border bg-card p-5 flex gap-5">
              {/* Image or placeholder */}
              <div className="shrink-0">
                {item.image_base64 ? (
                  <img
                    src={item.image_base64}
                    alt={item.name}
                    className="w-28 h-28 object-contain rounded-lg border bg-muted"
                  />
                ) : (
                  <div className="w-28 h-28 rounded-lg border bg-muted flex items-center justify-center">
                    <Package className="size-10 text-muted-foreground/30" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded border ${TYPE_COLOR[item.item_type]}`}>
                    {TYPE_LABEL[item.item_type]}
                  </span>
                  {!item.is_active && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded border bg-destructive/10 text-destructive border-destructive/20">
                      Inactive
                    </span>
                  )}
                  {isLow && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded border bg-warning/15 text-amber-800 border-warning/20 flex items-center gap-1">
                      <TrendingDown className="size-3" /> Low Stock
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-mono">{item.code}</p>
                  <h1 className="text-xl font-semibold">{item.name}</h1>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                  {item.storage_location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="size-3.5" />
                      {item.storage_location}
                      {item.storage_type && ` (${item.storage_type})`}
                    </span>
                  )}
                  <span>Unit: <strong className="text-foreground">{item.unit_name ?? "—"}</strong></span>
                  {item.weight_value != null && (
                    <span className="flex items-center gap-1">
                      <Scale className="size-3.5" />
                      Weight: <strong className="text-foreground">{item.weight_value} {item.weight_unit_name}</strong>
                    </span>
                  )}
                  {(item.item_type === "finished_good" || item.item_type === "semi_finished") && item.vendor_name && (
                    <span className="flex items-center gap-1">
                      <Building2 className="size-3.5" />
                      Vendor:{" "}
                      <Link
                        to={dynTo(`/dashboard/vendors/${encodeURIComponent(item.vendor_name)}`)}
                        className="font-semibold text-primary hover:underline"
                      >
                        {item.vendor_name}
                      </Link>
                    </span>
                  )}
                  <span>Last updated: <strong className="text-foreground">{new Date(item.updated_at).toLocaleDateString()}</strong></span>
                </div>
              </div>
            </div>

            {/* ── Stock overview ── */}
            <div className="rounded-xl border bg-card p-5">
              <SectionHeader icon={BarChart3} title="Stock Overview" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                <Stat label="On Hand" value={`${fmt(item.quantity_on_hand)} ${item.unit_name ?? ""}`} warn={isLow} />
                <Stat label="Reorder Level" value={`${fmt(item.reorder_level)} ${item.unit_name ?? ""}`} />
                {admin && item.rate != null && (
                  <Stat label="Unit Rate" value={`₹${item.rate.toLocaleString("en-IN")}`} />
                )}
                {admin && item.rate != null && item.quantity_on_hand > 0 && (
                  <Stat
                    label="Stock Value"
                    value={`₹${(item.rate * item.quantity_on_hand).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`}
                    sub="rate × qty on hand"
                  />
                )}
              </div>
              {/* Stock bar */}
              {item.reorder_level > 0 && (
                <div className="mt-4 space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>0</span>
                    <span>Reorder: {fmt(item.reorder_level)}</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isLow ? "bg-destructive" : "bg-success"}`}
                      style={{ width: `${Math.min(100, (item.quantity_on_hand / (item.reorder_level * 2)) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* ═══════════════ RAW MATERIAL ═══════════════ */}
            {item.item_type === "raw_material" && item.bom_usage !== undefined && (
              <>
                {item.bom_usage.length === 0 ? (
                  <div className="rounded-xl border bg-muted/40 p-6 text-center">
                    <Layers className="size-8 mx-auto text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">This raw material is not linked to any product BOM yet.</p>
                    {admin && (
                      <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate({ href: "/dashboard/admin/bom/new" })}>
                        Add to BOM
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border bg-card p-5">
                    <SectionHeader icon={Factory} title="Used in Products" />

                    {/* Mobile cards */}
                    <div className="md:hidden space-y-3">
                      {item.bom_usage.map((b) => (
                        <div key={b.bom_id} className="rounded-lg border p-3 space-y-2">
                          <div className="font-medium text-sm">
                            {b.fg_item_id ? (
                              <Link to={dynTo(`/dashboard/inventory/${b.fg_item_id}`)} className="hover:underline text-primary">{b.product_name}</Link>
                            ) : b.product_name}
                          </div>
                          {b.fg_available_qty != null && (
                            <p className="text-xs text-muted-foreground">FG in stock: {fmt(b.fg_available_qty)} {b.fg_unit}</p>
                          )}
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                            <div><span className="text-muted-foreground">Qty/Unit:</span> <span className="font-medium">{fmt(b.qty_per_unit)} {b.unit}/{b.fg_unit ?? "unit"}</span></div>
                            <div><span className="text-muted-foreground">Active Orders:</span>{" "}
                              {b.active_schedule_count > 0 ? <span className="font-medium">{fmt(b.total_active_demand)} {b.fg_unit ?? "pcs"}</span> : "—"}
                            </div>
                            <div><span className="text-muted-foreground">RM Needed:</span>{" "}
                              {b.active_schedule_count > 0 ? <span className="font-medium">{fmt(b.rm_needed_for_demand)} {b.unit}</span> : "—"}
                            </div>
                            <div><span className="text-muted-foreground">Shortfall:</span>{" "}
                              {b.rm_shortfall > 0
                                ? <span className="text-destructive font-medium">{fmt(b.rm_shortfall)} {b.unit}</span>
                                : <span className="text-success">OK</span>}
                            </div>
                          </div>
                          <div className="text-xs pt-1 border-t">
                            <span className="text-muted-foreground">Can Produce:</span>{" "}
                            <span className="font-semibold">{fmt(b.can_produce)} {b.fg_unit ?? "units"}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Desktop table */}
                    <div className="hidden md:block overflow-x-auto -mx-1">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-muted-foreground text-xs">
                            <th className="text-left py-2 pr-4 font-medium">Product</th>
                            <th className="text-right py-2 pr-4 font-medium">Qty / Unit</th>
                            <th className="text-right py-2 pr-4 font-medium">Active Orders</th>
                            <th className="text-right py-2 pr-4 font-medium">RM Needed</th>
                            <th className="text-right py-2 pr-4 font-medium">RM Shortfall</th>
                            <th className="text-right py-2 font-medium">Can Produce</th>
                          </tr>
                        </thead>
                        <tbody>
                          {item.bom_usage.map((b) => (
                            <tr key={b.bom_id} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="py-3 pr-4">
                                <div className="font-medium">
                                  {b.fg_item_id ? (
                                    <Link to={dynTo(`/dashboard/inventory/${b.fg_item_id}`)} className="hover:underline text-primary">
                                      {b.product_name}
                                    </Link>
                                  ) : b.product_name}
                                </div>
                                {b.fg_available_qty != null && (
                                  <div className="text-xs text-muted-foreground">
                                    FG in stock: {fmt(b.fg_available_qty)} {b.fg_unit}
                                  </div>
                                )}
                              </td>
                              <td className="text-right py-3 pr-4 tabular-nums">
                                {fmt(b.qty_per_unit)} {b.unit} / {b.fg_unit ?? "unit"}
                              </td>
                              <td className="text-right py-3 pr-4 tabular-nums">
                                {b.active_schedule_count > 0 ? (
                                  <span>{fmt(b.total_active_demand)} {b.fg_unit ?? "pcs"}</span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="text-right py-3 pr-4 tabular-nums">
                                {b.active_schedule_count > 0 ? `${fmt(b.rm_needed_for_demand)} ${b.unit}` : "—"}
                              </td>
                              <td className="text-right py-3 pr-4 tabular-nums">
                                {b.rm_shortfall > 0 ? (
                                  <span className="text-destructive flex items-center justify-end gap-1">
                                    <TrendingDown className="size-3" />
                                    {fmt(b.rm_shortfall)} {b.unit}
                                  </span>
                                ) : (
                                  <span className="text-success">OK</span>
                                )}
                              </td>
                              <td className="text-right py-3 tabular-nums font-medium">
                                {fmt(b.can_produce)} {b.fg_unit ?? "units"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ═══════════════ FINISHED GOOD / SEMI-FINISHED ═══════════════ */}
            {(item.item_type === "finished_good" || item.item_type === "semi_finished") && (
              <>
                {/* Demand summary cards */}
                {item.item_type === "finished_good" && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {/* Total active demand */}
                    <div className="rounded-xl border bg-card p-4 space-y-1">
                      <p className="text-xs text-muted-foreground">Active Demand</p>
                      <p className="text-2xl font-bold">{fmt(item.total_ordered ?? 0)}</p>
                      <p className="text-xs text-muted-foreground">{item.unit_name ?? ""} ordered (active)</p>
                    </div>
                    {/* In Stock */}
                    <div className={`rounded-xl border p-4 space-y-1 ${isLow ? "border-destructive/40 bg-destructive/5" : "bg-card"}`}>
                      <p className="text-xs text-muted-foreground">In Stock</p>
                      <p className={`text-2xl font-bold ${isLow ? "text-destructive" : ""}`}>{fmt(item.quantity_on_hand)}</p>
                      <p className="text-xs text-muted-foreground">{item.unit_name ?? ""} on hand</p>
                    </div>
                    {/* Shortfall / Surplus */}
                    <div className={`rounded-xl border p-4 space-y-1 ${(item.fg_shortfall ?? 0) > 0 ? "border-destructive/40 bg-destructive/5" : "border-success/20 bg-success/10"}`}>
                      <p className="text-xs text-muted-foreground">{(item.fg_shortfall ?? 0) > 0 ? "FG Shortfall" : "FG Surplus"}</p>
                      <p className={`text-2xl font-bold flex items-center gap-1 ${(item.fg_shortfall ?? 0) > 0 ? "text-destructive" : "text-success"}`}>
                        {(item.fg_shortfall ?? 0) > 0
                          ? <><PackageX className="size-5" />{fmt(item.fg_shortfall ?? 0)}</>
                          : <><PackageCheck className="size-5" />{fmt(item.quantity_on_hand - (item.total_ordered ?? 0))}</>}
                      </p>
                      <p className="text-xs text-muted-foreground">{item.unit_name ?? ""}</p>
                    </div>
                    {/* Production capacity */}
                    <div className="rounded-xl border bg-card p-4 space-y-1">
                      <p className="text-xs text-muted-foreground">Can Produce</p>
                      <p className="text-2xl font-bold text-primary">
                        {item.production_capacity != null ? fmt(item.production_capacity) : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.bom_requirements && item.bom_requirements.length > 0
                          ? "units from current RM stock"
                          : "no BOM defined"}
                      </p>
                    </div>
                  </div>
                )}

                {/* Customer Orders */}
                <div className="rounded-xl border bg-card p-5">
                  <SectionHeader icon={Users} title="Customer Orders" />
                  {(!item.schedules || item.schedules.length === 0) ? (
                    <p className="text-sm text-muted-foreground">No schedules found for this product.</p>
                  ) : (
                    <>
                      {/* Mobile cards */}
                      <div className="md:hidden space-y-3">
                        {item.schedules.map((s) => (
                          <div key={s.id} className="rounded-lg border p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <Link to={dynTo(`/dashboard/schedule/${s.id}/edit`)} className="font-mono text-xs hover:underline text-primary">{s.schedule_number}</Link>
                                <p className="font-medium text-sm truncate">{s.customer_name}</p>
                              </div>
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${STATUS_BADGE[s.status] ?? "bg-muted"}`}>
                                {STATUS_LABEL[s.status] ?? s.status}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                              <div><span className="text-muted-foreground">Ordered:</span> <span className="font-medium">{fmt(s.scheduled_qty)} {item.unit_name ?? ""}</span></div>
                              <div>
                                <span className="text-muted-foreground">Backlog:</span>{" "}
                                {s.backlog_qty > 0 ? <span className="text-warning font-medium">{fmt(s.backlog_qty)}</span> : "—"}
                              </div>
                              <div><span className="text-muted-foreground">Delivery:</span> {new Date(s.scheduled_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
                            </div>
                          </div>
                        ))}
                        {(item.total_ordered ?? 0) > 0 && (
                          <div className="flex items-center justify-between text-xs px-1 pt-1 border-t">
                            <span className="text-muted-foreground font-medium">Active Total</span>
                            <span className="font-semibold">{fmt(item.total_ordered ?? 0)} {item.unit_name ?? ""}
                              {(item.total_backlog ?? 0) > 0 && <span className="ml-2 text-warning">(backlog: {fmt(item.total_backlog ?? 0)})</span>}
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
                              <th className="text-left py-2 pr-4 font-medium">Customer</th>
                              <th className="text-right py-2 pr-4 font-medium">Ordered</th>
                              <th className="text-right py-2 pr-4 font-medium">Backlog</th>
                              <th className="text-left py-2 pr-4 font-medium">Delivery</th>
                              <th className="text-left py-2 font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {item.schedules.map((s) => (
                              <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30">
                                <td className="py-2.5 pr-4">
                                  <Link to={dynTo(`/dashboard/schedule/${s.id}/edit`)} className="font-mono text-xs hover:underline text-primary">
                                    {s.schedule_number}
                                  </Link>
                                </td>
                                <td className="py-2.5 pr-4 font-medium">{s.customer_name}</td>
                                <td className="py-2.5 pr-4 text-right tabular-nums">{fmt(s.scheduled_qty)} {item.unit_name ?? ""}</td>
                                <td className="py-2.5 pr-4 text-right tabular-nums">
                                  {s.backlog_qty > 0
                                    ? <span className="text-warning">{fmt(s.backlog_qty)}</span>
                                    : <span className="text-muted-foreground">—</span>}
                                </td>
                                <td className="py-2.5 pr-4 text-sm">{new Date(s.scheduled_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                                <td className="py-2.5">
                                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[s.status] ?? "bg-muted"}`}>
                                    {STATUS_LABEL[s.status] ?? s.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          {(item.total_ordered ?? 0) > 0 && (
                            <tfoot>
                              <tr className="border-t bg-muted/30">
                                <td colSpan={2} className="py-2 pr-4 text-xs font-medium text-muted-foreground">Active Total</td>
                                <td className="py-2 pr-4 text-right tabular-nums font-semibold">{fmt(item.total_ordered ?? 0)} {item.unit_name ?? ""}</td>
                                <td className="py-2 pr-4 text-right tabular-nums font-semibold text-warning">
                                  {(item.total_backlog ?? 0) > 0 ? fmt(item.total_backlog ?? 0) : "—"}
                                </td>
                                <td colSpan={2} />
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </>
                  )}
                </div>

                {/* Design Drawing */}
                <div className="rounded-xl border bg-card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <FileText className="size-4 text-muted-foreground" />
                      <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Design Drawing</h2>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.has_design_drawing && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          disabled={pdfViewing}
                          onClick={handleViewDrawing}
                        >
                          <ExternalLink className="size-3.5" />
                          {pdfViewing ? "Loading…" : "View Drawing"}
                        </Button>
                      )}
                      {admin && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            disabled={pdfUploading}
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <Upload className="size-3.5" />
                            {pdfUploading ? "Uploading…" : item.has_design_drawing ? "Replace PDF" : "Upload PDF"}
                          </Button>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="application/pdf"
                            className="hidden"
                            onChange={handlePdfUpload}
                          />
                        </>
                      )}
                    </div>
                  </div>
                  {!item.has_design_drawing ? (
                    <p className="text-sm text-muted-foreground">No design drawing uploaded yet.</p>
                  ) : (
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <FileText className="size-4 text-primary" />
                      PDF drawing attached. Click “View Drawing” to open.
                    </p>
                  )}
                </div>

                {/* Bill of Materials */}
                {item.item_type === "finished_good" && (
                  <div className="rounded-xl border bg-card p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Wrench className="size-4 text-muted-foreground" />
                        <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Bill of Materials</h2>
                      </div>
                      {admin && (
                        <Button variant="outline" size="sm" onClick={() => navigate({ href: "/dashboard/admin/bom" })}>
                          Manage BOM
                        </Button>
                      )}
                    </div>

                    {(!item.bom_requirements || item.bom_requirements.length === 0) ? (
                      <div className="text-center py-6">
                        <Layers className="size-8 mx-auto text-muted-foreground/30 mb-2" />
                        <p className="text-sm text-muted-foreground">No BOM defined for this product.</p>
                        {admin && (
                          <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate({ href: "/dashboard/admin/bom/new" })}>
                            Add BOM Entry
                          </Button>
                        )}
                      </div>
                    ) : (
                      <>
                        {/* Mobile cards */}
                        <div className="md:hidden space-y-3">
                          {item.bom_requirements.map((r) => (
                            <div key={r.bom_id} className="rounded-lg border p-3 space-y-2">
                              <div>
                                <Link to={dynTo(`/dashboard/inventory/${r.raw_material_id}`)} className="font-medium text-sm hover:underline text-primary">
                                  {r.raw_material_name}
                                </Link>
                                <p className="text-xs text-muted-foreground font-mono">{r.raw_material_code}</p>
                              </div>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                <div><span className="text-muted-foreground">Qty/Unit:</span> <span className="font-medium">{fmt(r.qty_per_unit)} {r.unit}</span></div>
                                <div>
                                  <span className="text-muted-foreground">In Stock:</span>{" "}
                                  <span className={r.available_qty <= r.reorder_level ? "text-warning font-medium" : "font-medium"}>{fmt(r.available_qty)} {r.unit}</span>
                                </div>
                                <div><span className="text-muted-foreground">Need:</span>{" "}
                                  {(item.total_ordered ?? 0) > 0 ? <span className="font-medium">{fmt(r.required_for_demand)} {r.unit}</span> : "—"}
                                </div>
                                <div><span className="text-muted-foreground">Shortfall:</span>{" "}
                                  {r.shortfall > 0
                                    ? <span className="text-destructive font-medium">{fmt(r.shortfall)} {r.unit}</span>
                                    : <span className="text-success">OK</span>}
                                </div>
                              </div>
                              <div className="text-xs pt-1 border-t">
                                <span className="text-muted-foreground">Can Produce:</span>{" "}
                                <span className="font-semibold">{fmt(r.can_produce)} {item.unit_name ?? ""}</span>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Desktop table */}
                        <div className="hidden md:block overflow-x-auto -mx-1">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b text-muted-foreground text-xs">
                                <th className="text-left py-2 pr-4 font-medium">Raw Material</th>
                                <th className="text-right py-2 pr-4 font-medium">Qty / Unit</th>
                                <th className="text-right py-2 pr-4 font-medium">In Stock</th>
                                <th className="text-right py-2 pr-4 font-medium">Need for Orders</th>
                                <th className="text-right py-2 pr-4 font-medium">Shortfall</th>
                                <th className="text-right py-2 font-medium">Can Produce</th>
                              </tr>
                            </thead>
                            <tbody>
                              {item.bom_requirements.map((r) => (
                                <tr key={r.bom_id} className="border-b last:border-0 hover:bg-muted/30">
                                  <td className="py-3 pr-4">
                                    <Link to={dynTo(`/dashboard/inventory/${r.raw_material_id}`)} className="font-medium hover:underline text-primary">
                                      {r.raw_material_name}
                                    </Link>
                                    <div className="text-xs text-muted-foreground font-mono">{r.raw_material_code}</div>
                                  </td>
                                  <td className="text-right py-3 pr-4 tabular-nums">{fmt(r.qty_per_unit)} {r.unit}</td>
                                  <td className={`text-right py-3 pr-4 tabular-nums ${r.available_qty <= r.reorder_level ? "text-warning font-medium" : ""}`}>
                                    {fmt(r.available_qty)} {r.unit}
                                  </td>
                                  <td className="text-right py-3 pr-4 tabular-nums">
                                    {(item.total_ordered ?? 0) > 0 ? `${fmt(r.required_for_demand)} ${r.unit}` : "—"}
                                  </td>
                                  <td className="text-right py-3 pr-4 tabular-nums">
                                    {r.shortfall > 0 ? (
                                      <span className="text-destructive flex items-center justify-end gap-1">
                                        <TrendingDown className="size-3" />{fmt(r.shortfall)} {r.unit}
                                      </span>
                                    ) : (
                                      <span className="text-success">OK</span>
                                    )}
                                  </td>
                                  <td className="text-right py-3 tabular-nums font-medium">
                                    {fmt(r.can_produce)} {item.unit_name ?? ""}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {/* Production capacity callout */}
                          <div className={`mt-4 flex items-center gap-3 rounded-lg p-3 border ${(item.production_capacity ?? 0) >= (item.total_ordered ?? 0) ? "bg-success/10 border-success/20" : "bg-warning/15 border-warning/20"}`}>
                            {(item.production_capacity ?? 0) >= (item.total_ordered ?? 0)
                              ? <TrendingUp className="size-4 text-success shrink-0" />
                              : <TrendingDown className="size-4 text-warning shrink-0" />}
                            <p className="text-sm">
                              With current raw material stock, you can produce{" "}
                              <strong>{item.production_capacity != null ? fmt(item.production_capacity) : "0"} {item.unit_name ?? ""}</strong>
                              {(item.total_ordered ?? 0) > 0 && (
                                <> against an active demand of <strong>{fmt(item.total_ordered ?? 0)} {item.unit_name ?? ""}</strong></>
                              )}.
                              {(item.production_capacity ?? 0) < (item.total_ordered ?? 0) && (
                                <span className="text-warning"> Shortfall of <strong>{fmt((item.total_ordered ?? 0) - (item.production_capacity ?? 0))} {item.unit_name ?? ""}</strong> — purchase raw materials.</span>
                              )}
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}
