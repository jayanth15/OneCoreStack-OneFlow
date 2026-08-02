"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetchJson } from "@/lib/api";
import { isAdminOrAbove } from "@/lib/user";
import {
  Package, Users, Calendar, ClipboardList, Factory, Wrench,
  AlertTriangle, TrendingUp, ArrowUpRight, ArrowDownRight, Minus,
  Activity, FlaskConical, Paperclip, Scissors,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { PageHeader } from "@/components/layout/page-header";
import { CHART_COLORS } from "@/lib/theme";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OverviewCounts {
  total_inventory_items: number;
  raw_materials: number;
  finished_goods: number;
  semi_finished: number;
  low_stock_alerts: number;
  total_vendors: number;
  total_schedules: number;
  total_plans: number;
  total_orders: number;
  total_job_cards: number;
}

interface StatusBreakdown { [key: string]: number }

interface InventoryByType {
  item_type: string;
  count: number;
  total_qty: number;
  total_value: number | null;
}

interface RecentInventory {
  id: number;
  item_code: string;
  item_name: string;
  change_type: string;
  quantity_delta: number | null;
  quantity_after: number | null;
  changed_at: string;
  notes: string | null;
}

interface RecentProduction {
  id: number;
  card_number: string;
  order_number: string;
  process_name: string;
  worker_name: string | null;
  qty_produced: number;
  status: string;
  work_date: string | null;
}

interface LowStockItem {
  id: number;
  code: string;
  name: string;
  item_type: string;
  quantity_on_hand: number;
  reorder_level: number;
  unit: string;
}

interface SpareLowStockItem {
  item_id: number;
  item_name: string;
  part_number: string | null;
  category_name: string;
  sub_category_name: string;
  recorded_qty: number;
  reorder_level: number;
  unit: string;
}
interface ConsumableLowStockItem {
  item_id: number;
  name: string;
  code: string | null;
  qty: number;
  reorder_level: number;
}

interface SparesCatSummary {
  categories: number;
  items: number;
  total_value: number;
}

interface DashboardData {
  overview: OverviewCounts;
  plan_status: StatusBreakdown;
  job_card_status: StatusBreakdown;
  inventory_by_type: InventoryByType[];
  recent_inventory: RecentInventory[];
  recent_production: RecentProduction[];
  low_stock_items: LowStockItem[];
}

// ── Palette ───────────────────────────────────────────────────────────────────

const PIE_COLORS = CHART_COLORS;

const CHANGE_ICON: Record<string, React.ReactNode> = {
  add: <ArrowUpRight className="size-3.5 text-success" />,
  subtract: <ArrowDownRight className="size-3.5 text-destructive" />,
  create: <TrendingUp className="size-3.5 text-primary" />,
  set: <Minus className="size-3.5 text-warning" />,
  edit: <Minus className="size-3.5 text-muted-foreground" />,
};

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  completed: "Completed",
  pending: "Pending",
  confirmed: "Confirmed",
  in_production: "In Production",
  delivered: "Delivered",
  draft: "Draft",
  approved: "Approved",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCurrencyShort(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1).replace(/\.0$/, "")}Cr`;
  if (n >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(1).replace(/\.0$/, "")}L`;
  if (n >= 1_000)       return `₹${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return `₹${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fmtCurrencyFull(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function formatType(t: string) {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
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
      <div className="grid md:grid-cols-2 gap-4">
        <div className="h-64 rounded-xl bg-muted" />
        <div className="h-64 rounded-xl bg-muted" />
      </div>
      <div className="h-72 rounded-xl bg-muted" />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sparesStats, setSparesStats] = useState<SparesCatSummary | null>(null);
  const [consumablesTotal, setConsumablesTotal] = useState<number | null>(null);
  const [consumablesValue, setConsumablesValue] = useState<number | null>(null);
  const [consumablesLowStock, setConsumablesLowStock] = useState<number>(0);
  const [consumablesLoaded, setConsumablesLoaded] = useState(false);
  const [attachmentsTotal, setAttachmentsTotal] = useState<number | null>(null);
  const [attachmentsValue, setAttachmentsValue] = useState<number | null>(null);
  const [attachmentsLowStock, setAttachmentsLowStock] = useState<number>(0);
  const [attachmentsLoaded, setAttachmentsLoaded] = useState(false);
  const [weedersTotal, setWeedersTotal] = useState<number | null>(null);
  const [weedersValue, setWeedersValue] = useState<number | null>(null);
  const [weedersLowStock, setWeedersLowStock] = useState<number>(0);
  const [weedersLoaded, setWeedersLoaded] = useState(false);

  useEffect(() => {
    apiFetchJson<DashboardData>("/api/v1/dashboard")
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load dashboard"));
    apiFetchJson<{items: {id: number; item_count: number; total_value: number | null}[]; total: number}>("/api/v1/spares/categories?include_inactive=false&page_size=500")
      .then(data => setSparesStats({
        categories: data.total,
        items: data.items.reduce((s, c) => s + c.item_count, 0),
        total_value: data.items.reduce((s, c) => s + (c.total_value ?? 0), 0),
      }))
      .catch(() => {});
    apiFetchJson<{items: {total_price: number | null; qty: number; reorder_level: number}[], total: number}>("/api/v1/consumables?page_size=500&include_inactive=false")
      .then(d => {
        setConsumablesTotal(d.total);
        setConsumablesValue(d.items.reduce((s, c) => s + (c.total_price ?? 0), 0));
        setConsumablesLowStock(d.items.filter(c => c.reorder_level > 0 && c.qty <= c.reorder_level).length);
      })
      .catch(() => { setConsumablesTotal(0); })
      .finally(() => { setConsumablesLoaded(true); });
    apiFetchJson<{items: {total_rate: number | null; qty: number; reorder_level: number}[], total: number}>("/api/v1/attachments?page_size=500&include_inactive=false")
      .then(d => {
        setAttachmentsTotal(d.total);
        setAttachmentsValue(d.items.reduce((s, c) => s + (c.total_rate ?? 0), 0));
        setAttachmentsLowStock(d.items.filter(c => c.reorder_level > 0 && c.qty <= c.reorder_level).length);
      })
      .catch(() => { setAttachmentsTotal(0); })
      .finally(() => { setAttachmentsLoaded(true); });
    apiFetchJson<{items: {total_rate: number | null; qty: number; reorder_level: number}[], total: number}>("/api/v1/weeders?page_size=500&include_inactive=false")
      .then(d => {
        setWeedersTotal(d.total);
        setWeedersValue(d.items.reduce((s, c) => s + (c.total_rate ?? 0), 0));
        setWeedersLowStock(d.items.filter(c => c.reorder_level > 0 && c.qty <= c.reorder_level).length);
      })
      .catch(() => { setWeedersTotal(0); })
      .finally(() => { setWeedersLoaded(true); });
  }, []);

  if (error) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <div className="p-6"><p className="text-sm text-destructive">{error}</p></div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <DashSkeleton />
      </>
    );
  }

  const { overview: o } = data;

  return (
    <>
      <PageHeader
        title="Dashboard"
        actions={
          <span className="text-xs text-muted-foreground">
            Last refreshed: {new Date().toLocaleTimeString()}
          </span>
        }
      />

      <div className="flex flex-col gap-6 p-4 md:p-6 overflow-auto">

        {/* ── KPI Cards Row 1 ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard label="Vendors" value={o.total_vendors}
            icon={<Users className="size-5" />} tone="violet" />
          <StatCard label="Schedules" value={o.total_schedules}
            icon={<Calendar className="size-5" />} tone="blue" />
          <StatCard label="Production Plans" value={o.total_plans}
            icon={<ClipboardList className="size-5" />} tone="amber" />
          <StatCard label="Production Orders" value={o.total_orders}
            icon={<Factory className="size-5" />} tone="emerald" />
          <StatCard label="Job Cards" value={o.total_job_cards}
            icon={<Wrench className="size-5" />} tone="blue" />
        </div>

        {/* ── KPI Cards Row 2 ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard label="Inventory Items" value={o.total_inventory_items}
            icon={<Package className="size-5" />} />
          <StatCard label="Raw Materials" value={o.raw_materials}
            icon={<Package className="size-5" />} tone="amber" />
          <StatCard label="Semi Finished" value={o.semi_finished}
            icon={<Package className="size-5" />} tone="violet" />
          <StatCard label="Finished Goods" value={o.finished_goods}
            icon={<Package className="size-5" />} tone="emerald" />
          {o.low_stock_alerts > 0 ? (
            <StatCard label="Low Stock Alerts" value={o.low_stock_alerts}
              icon={<AlertTriangle className="size-5" />} tone="destructive" />
          ) : (
            <StatCard label="Low Stock Alerts" value="None"
              icon={<AlertTriangle className="size-5" />} tone="success" />
          )}
        </div>

        {/* ── Spares & Consumables Overview ─────────────────────────── */}
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* Spares card */}
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex size-8 items-center justify-center rounded-lg bg-tone-violet/10 text-tone-violet">
                <Wrench className="size-4" />
              </div>
              <p className="text-sm font-semibold">Spares</p>
              <Link href="/dashboard/inventory/spares" className="ml-auto text-xs text-primary hover:underline">View all</Link>
            </div>
            {sparesStats === null ? (
              <p className="text-xs text-muted-foreground text-center py-3">No inventory items</p>
            ) : sparesStats.items === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">No inventory items</p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-3 text-center">
                <div>
                  <p className="text-xl font-bold">{sparesStats.categories}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Categories</p>
                </div>
                <div>
                  <p className="text-xl font-bold">{sparesStats.items}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Items</p>
                </div>
                {isAdminOrAbove() && (
                  <div>
                    {sparesStats.total_value > 0 ? (
                      <>
                        <p className="text-xl font-bold text-success cursor-help" title={fmtCurrencyFull(sparesStats.total_value)}>{fmtCurrencyShort(sparesStats.total_value)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Value</p>
                      </>
                    ) : (
                      <>
                        <p className="text-xl font-bold">—</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Value</p>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Consumables card */}
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FlaskConical className="size-4" />
              </div>
              <p className="text-sm font-semibold">Consumables</p>
              <Link href="/dashboard/inventory/consumables" className="ml-auto text-xs text-primary hover:underline">View all</Link>
            </div>
            {consumablesLoaded && (consumablesTotal === null || consumablesTotal === 0) ? (
              <p className="text-xs text-muted-foreground text-center py-3">No inventory items</p>
            ) : !consumablesLoaded ? (
              <div className="flex justify-center gap-1.5 py-4">
                <span className="size-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]"/>
                <span className="size-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]"/>
                <span className="size-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]"/>
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-3 text-center">
                <div>
                  <p className="text-xl font-bold">{consumablesTotal}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Items</p>
                </div>
                <div>
                  <p className={`text-xl font-bold ${consumablesLowStock > 0 ? "text-warning" : ""}`}>
                    {consumablesLowStock > 0 ? consumablesLowStock : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Low Stock</p>
                </div>
                {isAdminOrAbove() && (
                  <div>
                    {consumablesValue !== null && consumablesValue > 0 ? (
                      <>
                        <p className="text-xl font-bold text-success cursor-help" title={fmtCurrencyFull(consumablesValue!)}>{fmtCurrencyShort(consumablesValue!)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Value</p>
                      </>
                    ) : (
                      <>
                        <p className="text-xl font-bold">—</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Value</p>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Attachments card */}
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex size-8 items-center justify-center rounded-lg bg-tone-amber/15 text-tone-amber">
                <Paperclip className="size-4" />
              </div>
              <p className="text-sm font-semibold">Attachments</p>
              <Link href="/dashboard/inventory/attachments" className="ml-auto text-xs text-primary hover:underline">View all</Link>
            </div>
            {attachmentsLoaded && (attachmentsTotal === null || attachmentsTotal === 0) ? (
              <p className="text-xs text-muted-foreground text-center py-3">No inventory items</p>
            ) : !attachmentsLoaded ? (
              <div className="flex justify-center gap-1.5 py-4">
                <span className="size-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]"/>
                <span className="size-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]"/>
                <span className="size-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]"/>
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-3 text-center">
                <div>
                  <p className="text-xl font-bold">{attachmentsTotal}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Items</p>
                </div>
                <div>
                  <p className={`text-xl font-bold ${attachmentsLowStock > 0 ? "text-warning" : ""}`}>
                    {attachmentsLowStock > 0 ? attachmentsLowStock : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Low Stock</p>
                </div>
                {isAdminOrAbove() && (
                  <div>
                    {attachmentsValue !== null && attachmentsValue > 0 ? (
                      <>
                        <p className="text-xl font-bold text-success cursor-help" title={fmtCurrencyFull(attachmentsValue!)}>{fmtCurrencyShort(attachmentsValue!)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Value</p>
                      </>
                    ) : (
                      <>
                        <p className="text-xl font-bold">—</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Value</p>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Weeders card */}
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex size-8 items-center justify-center rounded-lg bg-tone-emerald/10 text-tone-emerald">
                <Scissors className="size-4" />
              </div>
              <p className="text-sm font-semibold">Weeders</p>
              <Link href="/dashboard/inventory/weeders" className="ml-auto text-xs text-primary hover:underline">View all</Link>
            </div>
            {weedersLoaded && (weedersTotal === null || weedersTotal === 0) ? (
              <p className="text-xs text-muted-foreground text-center py-3">No inventory items</p>
            ) : !weedersLoaded ? (
              <div className="flex justify-center gap-1.5 py-4">
                <span className="size-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]"/>
                <span className="size-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]"/>
                <span className="size-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]"/>
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-3 text-center">
                <div>
                  <p className="text-xl font-bold">{weedersTotal}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Items</p>
                </div>
                <div>
                  <p className={`text-xl font-bold ${weedersLowStock > 0 ? "text-warning" : ""}`}>
                    {weedersLowStock > 0 ? weedersLowStock : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Low Stock</p>
                </div>
                {isAdminOrAbove() && (
                  <div>
                    {weedersValue !== null && weedersValue > 0 ? (
                      <>
                        <p className="text-xl font-bold text-success cursor-help" title={fmtCurrencyFull(weedersValue!)}>{fmtCurrencyShort(weedersValue!)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Value</p>
                      </>
                    ) : (
                      <>
                        <p className="text-xl font-bold">—</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Value</p>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {isAdminOrAbove() && data.inventory_by_type.length > 0 && (
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <p className="text-sm font-semibold mb-3">Inventory Value Summary</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {data.inventory_by_type.map((t) => (
                <div key={t.item_type} className="text-center p-3 rounded-lg bg-muted/30">
                  <p className="text-xs text-muted-foreground">{formatType(t.item_type)}</p>
                  <p className="text-lg font-bold mt-1">{t.count} items</p>
                  <p className="text-sm text-muted-foreground">
                    {t.total_qty.toLocaleString()} units
                  </p>
                  {t.total_value != null && t.total_value > 0 && (
                    <p className="text-sm font-medium text-success mt-0.5 cursor-help" title={fmtCurrencyFull(t.total_value)}>
                      {fmtCurrencyShort(t.total_value)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
