"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList,
  BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { apiFetchJson } from "@/lib/api";
import { isAdminOrAbove } from "@/lib/user";
import {
  ArrowLeft, Pencil, Package, PackageCheck, PackageX,
  Factory, Users, Layers, TrendingDown, TrendingUp,
  MapPin, BarChart3, Wrench,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BomUsage {
  bom_id: number;
  is_active: boolean;
  product_name: string;
  qty_per_unit: number;
  unit: string;
  notes: string | null;
  fg_item_id: number | null;
  fg_available_qty: number | null;
  fg_unit: string | null;
  active_schedule_count: number;
  total_active_demand: number;
  rm_needed_for_demand: number;
  rm_shortfall: number;
  can_produce: number;
}

interface BomRequirement {
  bom_id: number;
  raw_material_id: number;
  raw_material_code: string;
  raw_material_name: string;
  unit: string;
  qty_per_unit: number;
  available_qty: number;
  reorder_level: number;
  required_for_demand: number;
  shortfall: number;
  can_produce: number;
  notes: string | null;
}

interface ScheduleEntry {
  id: number;
  schedule_number: string;
  customer_name: string;
  scheduled_qty: number;
  backlog_qty: number;
  scheduled_date: string;
  status: string;
  notes: string | null;
}

interface ItemDetail {
  id: number;
  code: string;
  name: string;
  item_type: string;
  unit: string;
  quantity_on_hand: number;
  reorder_level: number;
  storage_type: string | null;
  storage_location: string | null;
  is_active: boolean;
  updated_at: string;
  rate: number | null;
  image_base64: string | null;
  // RM
  bom_usage?: BomUsage[];
  // FG / SFG
  schedules?: ScheduleEntry[];
  total_ordered?: number;
  total_backlog?: number;
  fg_shortfall?: number;
  bom_requirements?: BomRequirement[];
  production_capacity?: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  raw_material: "Raw Material",
  finished_good: "Finished Good",
  semi_finished: "Semi-Finished",
};

const TYPE_COLOR: Record<string, string> = {
  raw_material:  "bg-orange-100 text-orange-800 border-orange-200",
  finished_good: "bg-emerald-100 text-emerald-800 border-emerald-200",
  semi_finished: "bg-sky-100 text-sky-800 border-sky-200",
};

const STATUS_BADGE: Record<string, string> = {
  pending:       "bg-slate-100 text-slate-700",
  confirmed:     "bg-blue-100 text-blue-700",
  in_production: "bg-amber-100 text-amber-800",
  delivered:     "bg-emerald-100 text-emerald-800",
  cancelled:     "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending", confirmed: "Confirmed",
  in_production: "In Production", delivered: "Delivered", cancelled: "Cancelled",
};

function fmt(n: number, dp = 2) {
  return n % 1 === 0 ? String(n) : n.toFixed(dp).replace(/\.?0+$/, "");
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-semibold ${warn ? "text-destructive" : ""}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function SectionHeader({ icon: Icon, title }: { icon: React.ComponentType<{ className?: string }>; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="size-4 text-muted-foreground" />
      <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">{title}</h2>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InventoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const admin = isAdminOrAbove();

  useEffect(() => {
    apiFetchJson<ItemDetail>(`/api/v1/inventory/${id}/detail`)
      .then(setItem)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Not found"))
      .finally(() => setLoading(false));
  }, [id]);

  const isLow = item ? item.quantity_on_hand <= item.reorder_level : false;

  return (
    <>
      {/* ── Header ── */}
      <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4 md:px-6">
        <Link href="/dashboard/inventory" className="p-1.5 rounded-md hover:bg-muted transition-colors" aria-label="Back">
          <ArrowLeft className="size-4" />
        </Link>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href="/dashboard/inventory">Inventory</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>{loading ? "Loading…" : (item?.name ?? "Item")}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        {!loading && item && (
          <Button size="sm" variant="outline" className="ml-auto gap-2" onClick={() => router.push(`/dashboard/inventory/${id}/edit`)}>
            <Pencil className="size-3.5" /> Edit
          </Button>
        )}
      </header>

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
                    <span className="text-xs font-medium px-2 py-0.5 rounded border bg-red-50 text-red-700 border-red-200">
                      Inactive
                    </span>
                  )}
                  {isLow && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded border bg-amber-50 text-amber-800 border-amber-200 flex items-center gap-1">
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
                  <span>Unit: <strong className="text-foreground">{item.unit}</strong></span>
                  <span>Last updated: <strong className="text-foreground">{new Date(item.updated_at).toLocaleDateString()}</strong></span>
                </div>
              </div>
            </div>

            {/* ── Stock overview ── */}
            <div className="rounded-xl border bg-card p-5">
              <SectionHeader icon={BarChart3} title="Stock Overview" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                <Stat label="On Hand" value={`${fmt(item.quantity_on_hand)} ${item.unit}`} warn={isLow} />
                <Stat label="Reorder Level" value={`${fmt(item.reorder_level)} ${item.unit}`} />
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
                      className={`h-full rounded-full transition-all ${isLow ? "bg-destructive" : "bg-emerald-500"}`}
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
                      <Button variant="outline" size="sm" className="mt-3" onClick={() => router.push("/dashboard/admin/bom/new")}>
                        Add to BOM
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border bg-card p-5">
                    <SectionHeader icon={Factory} title="Used in Products" />
                    <div className="overflow-x-auto -mx-1">
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
                                    <Link href={`/dashboard/inventory/${b.fg_item_id}`} className="hover:underline text-blue-600">
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
                                  <span className="text-emerald-600">OK</span>
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
                      <p className="text-xs text-muted-foreground">{item.unit} ordered (active)</p>
                    </div>
                    {/* In Stock */}
                    <div className={`rounded-xl border p-4 space-y-1 ${isLow ? "border-destructive/40 bg-destructive/5" : "bg-card"}`}>
                      <p className="text-xs text-muted-foreground">In Stock</p>
                      <p className={`text-2xl font-bold ${isLow ? "text-destructive" : ""}`}>{fmt(item.quantity_on_hand)}</p>
                      <p className="text-xs text-muted-foreground">{item.unit} on hand</p>
                    </div>
                    {/* Shortfall / Surplus */}
                    <div className={`rounded-xl border p-4 space-y-1 ${(item.fg_shortfall ?? 0) > 0 ? "border-destructive/40 bg-destructive/5" : "border-emerald-200 bg-emerald-50"}`}>
                      <p className="text-xs text-muted-foreground">{(item.fg_shortfall ?? 0) > 0 ? "FG Shortfall" : "FG Surplus"}</p>
                      <p className={`text-2xl font-bold flex items-center gap-1 ${(item.fg_shortfall ?? 0) > 0 ? "text-destructive" : "text-emerald-600"}`}>
                        {(item.fg_shortfall ?? 0) > 0
                          ? <><PackageX className="size-5" />{fmt(item.fg_shortfall ?? 0)}</>
                          : <><PackageCheck className="size-5" />{fmt(item.quantity_on_hand - (item.total_ordered ?? 0))}</>}
                      </p>
                      <p className="text-xs text-muted-foreground">{item.unit}</p>
                    </div>
                    {/* Production capacity */}
                    <div className="rounded-xl border bg-card p-4 space-y-1">
                      <p className="text-xs text-muted-foreground">Can Produce</p>
                      <p className="text-2xl font-bold text-blue-700">
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
                    <div className="overflow-x-auto -mx-1">
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
                                <Link href={`/dashboard/schedule/${s.id}/edit`} className="font-mono text-xs hover:underline text-blue-600">
                                  {s.schedule_number}
                                </Link>
                              </td>
                              <td className="py-2.5 pr-4 font-medium">{s.customer_name}</td>
                              <td className="py-2.5 pr-4 text-right tabular-nums">{fmt(s.scheduled_qty)} {item.unit}</td>
                              <td className="py-2.5 pr-4 text-right tabular-nums">
                                {s.backlog_qty > 0
                                  ? <span className="text-amber-600">{fmt(s.backlog_qty)}</span>
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
                              <td className="py-2 pr-4 text-right tabular-nums font-semibold">{fmt(item.total_ordered ?? 0)} {item.unit}</td>
                              <td className="py-2 pr-4 text-right tabular-nums font-semibold text-amber-600">
                                {(item.total_backlog ?? 0) > 0 ? fmt(item.total_backlog ?? 0) : "—"}
                              </td>
                              <td colSpan={2} />
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
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
                        <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/admin/bom")}>
                          Manage BOM
                        </Button>
                      )}
                    </div>

                    {(!item.bom_requirements || item.bom_requirements.length === 0) ? (
                      <div className="text-center py-6">
                        <Layers className="size-8 mx-auto text-muted-foreground/30 mb-2" />
                        <p className="text-sm text-muted-foreground">No BOM defined for this product.</p>
                        {admin && (
                          <Button variant="outline" size="sm" className="mt-3" onClick={() => router.push("/dashboard/admin/bom/new")}>
                            Add BOM Entry
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="overflow-x-auto -mx-1">
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
                                  <Link href={`/dashboard/inventory/${r.raw_material_id}`} className="font-medium hover:underline text-blue-600">
                                    {r.raw_material_name}
                                  </Link>
                                  <div className="text-xs text-muted-foreground font-mono">{r.raw_material_code}</div>
                                </td>
                                <td className="text-right py-3 pr-4 tabular-nums">{fmt(r.qty_per_unit)} {r.unit}</td>
                                <td className={`text-right py-3 pr-4 tabular-nums ${r.available_qty <= r.reorder_level ? "text-amber-600 font-medium" : ""}`}>
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
                                    <span className="text-emerald-600">OK</span>
                                  )}
                                </td>
                                <td className="text-right py-3 tabular-nums font-medium">
                                  {fmt(r.can_produce)} {item.unit}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {/* Production capacity callout */}
                        <div className={`mt-4 flex items-center gap-3 rounded-lg p-3 border ${(item.production_capacity ?? 0) >= (item.total_ordered ?? 0) ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
                          {(item.production_capacity ?? 0) >= (item.total_ordered ?? 0)
                            ? <TrendingUp className="size-4 text-emerald-600 shrink-0" />
                            : <TrendingDown className="size-4 text-amber-600 shrink-0" />}
                          <p className="text-sm">
                            With current raw material stock, you can produce{" "}
                            <strong>{item.production_capacity != null ? fmt(item.production_capacity) : "0"} {item.unit}</strong>
                            {(item.total_ordered ?? 0) > 0 && (
                              <> against an active demand of <strong>{fmt(item.total_ordered ?? 0)} {item.unit}</strong></>
                            )}.
                            {(item.production_capacity ?? 0) < (item.total_ordered ?? 0) && (
                              <span className="text-amber-700"> Shortfall of <strong>{fmt((item.total_ordered ?? 0) - (item.production_capacity ?? 0))} {item.unit}</strong> — purchase raw materials.</span>
                            )}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
