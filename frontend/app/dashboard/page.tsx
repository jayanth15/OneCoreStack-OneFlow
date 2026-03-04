"use client";

import { useEffect, useState } from "react";
import { apiFetchJson } from "@/lib/api";
import { isAdminOrAbove } from "@/lib/user";
import {
  Package, Users, Calendar, ClipboardList, Factory, Wrench,
  AlertTriangle, TrendingUp, ArrowUpRight, ArrowDownRight, Minus,
  Activity,
} from "lucide-react";
import {
  BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import type { PieLabelRenderProps } from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SemiFGItem {
  id: number;
  code: string;
  name: string;
  unit: string;
  quantity_on_hand: number;
  reorder_level: number;
  storage_type: string | null;
  storage_location: string | null;
  updated_at: string;
}

interface PaginatedInventory {
  items: SemiFGItem[];
}

interface OverviewCounts {
  total_inventory_items: number;
  raw_materials: number;
  finished_goods: number;
  semi_finished: number;
  low_stock_alerts: number;
  total_customers: number;
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

interface TopProduct {
  product_name: string;
  total_planned_qty: number;
  plan_count: number;
}

interface DailyOutput {
  date: string;
  qty_produced: number;
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

interface DashboardData {
  overview: OverviewCounts;
  schedule_status: StatusBreakdown;
  plan_status: StatusBreakdown;
  order_status: StatusBreakdown;
  job_card_status: StatusBreakdown;
  inventory_by_type: InventoryByType[];
  recent_inventory: RecentInventory[];
  recent_production: RecentProduction[];
  top_products: TopProduct[];
  daily_production_output: DailyOutput[];
  low_stock_items: LowStockItem[];
}

// ── Palette ───────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  confirmed: "#3b82f6",
  in_production: "#8b5cf6",
  delivered: "#10b981",
  draft: "#94a3b8",
  approved: "#3b82f6",
  in_progress: "#f59e0b",
  completed: "#10b981",
  open: "#94a3b8",
};

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

const CHANGE_ICON: Record<string, React.ReactNode> = {
  add: <ArrowUpRight className="size-3.5 text-emerald-500" />,
  subtract: <ArrowDownRight className="size-3.5 text-red-500" />,
  create: <TrendingUp className="size-3.5 text-blue-500" />,
  set: <Minus className="size-3.5 text-amber-500" />,
  edit: <Minus className="size-3.5 text-slate-400" />,
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

const STATUS_DOT: Record<string, string> = {
  open: "bg-slate-400",
  in_progress: "bg-amber-500",
  completed: "bg-emerald-500",
  pending: "bg-amber-500",
  confirmed: "bg-blue-500",
  in_production: "bg-violet-500",
  delivered: "bg-emerald-500",
  draft: "bg-slate-400",
  approved: "bg-blue-500",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, accent }: {
  label: string; value: number | string;
  icon: React.ReactNode; accent?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 flex items-center gap-4 shadow-sm">
      <div className={`flex size-10 items-center justify-center rounded-lg ${accent ?? "bg-primary/10 text-primary"}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold leading-none tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
      </div>
    </div>
  );
}

// ── Status bar ────────────────────────────────────────────────────────────────

function StatusBar({ data, title }: { data: StatusBreakdown; title: string }) {
  const total = Object.values(data).reduce((s, v) => s + v, 0);
  if (total === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</p>
      <div className="flex h-3 rounded-full overflow-hidden bg-muted">
        {Object.entries(data).map(([status, count]) =>
          count > 0 ? (
            <div
              key={status}
              className="h-full transition-all"
              style={{
                width: `${(count / total) * 100}%`,
                backgroundColor: STATUS_COLORS[status] ?? "#94a3b8",
              }}
              title={`${STATUS_LABEL[status] ?? status}: ${count}`}
            />
          ) : null
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {Object.entries(data).map(([status, count]) => (
          <span key={status} className="flex items-center gap-1.5">
            <span className={`size-2 rounded-full ${STATUS_DOT[status] ?? "bg-slate-400"}`} />
            {STATUS_LABEL[status] ?? status} <span className="font-medium">{count}</span>
          </span>
        ))}
      </div>
    </div>
  );
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
  const [semiFGItems, setSemiFGItems] = useState<SemiFGItem[]>([]);

  useEffect(() => {
    apiFetchJson<DashboardData>("/api/v1/dashboard")
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load dashboard"));
    apiFetchJson<PaginatedInventory>("/api/v1/inventory?item_type=semi_finished&page_size=20&include_inactive=false")
      .then((d) => setSemiFGItems(d.items))
      .catch(() => {});
  }, []);

  if (error) {
    return (
      <>
        <header className="flex h-16 shrink-0 items-center border-b px-6">
          <h1 className="text-base font-semibold">Dashboard</h1>
        </header>
        <div className="p-6"><p className="text-sm text-destructive">{error}</p></div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <header className="flex h-16 shrink-0 items-center border-b px-6">
          <h1 className="text-base font-semibold">Dashboard</h1>
        </header>
        <DashSkeleton />
      </>
    );
  }

  const { overview: o } = data;

  // Prepare chart data
  const scheduleChartData = Object.entries(data.schedule_status)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name: STATUS_LABEL[name] ?? name, value }));

  const inventoryPieData = data.inventory_by_type.map((t) => ({
    name: formatType(t.item_type),
    value: t.count,
  }));

  const topProductsChart = data.top_products.map((p) => ({
    name: p.product_name.length > 20 ? p.product_name.slice(0, 18) + "…" : p.product_name,
    qty: p.total_planned_qty,
  }));

  return (
    <>
      <header className="flex h-16 shrink-0 items-center border-b px-6">
        <h1 className="text-base font-semibold">Dashboard</h1>
        <span className="ml-auto text-xs text-muted-foreground">
          Last refreshed: {new Date().toLocaleTimeString()}
        </span>
      </header>

      <div className="flex flex-col gap-6 p-4 md:p-6 overflow-auto">

        {/* ── KPI Cards Row 1 ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard label="Customers" value={o.total_customers}
            icon={<Users className="size-5" />} accent="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" />
          <StatCard label="Schedules" value={o.total_schedules}
            icon={<Calendar className="size-5" />} accent="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" />
          <StatCard label="Production Plans" value={o.total_plans}
            icon={<ClipboardList className="size-5" />} accent="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" />
          <StatCard label="Production Orders" value={o.total_orders}
            icon={<Factory className="size-5" />} accent="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" />
          <StatCard label="Job Cards" value={o.total_job_cards}
            icon={<Wrench className="size-5" />} accent="bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400" />
        </div>

        {/* ── KPI Cards Row 2 ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard label="Inventory Items" value={o.total_inventory_items}
            icon={<Package className="size-5" />} />
          <StatCard label="Raw Materials" value={o.raw_materials}
            icon={<Package className="size-5" />} accent="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" />
          <StatCard label="Semi Finished" value={o.semi_finished}
            icon={<Package className="size-5" />} accent="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" />
          <StatCard label="Finished Goods" value={o.finished_goods}
            icon={<Package className="size-5" />} accent="bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400" />
          {o.low_stock_alerts > 0 ? (
            <StatCard label="Low Stock Alerts" value={o.low_stock_alerts}
              icon={<AlertTriangle className="size-5" />} accent="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" />
          ) : (
            <StatCard label="Low Stock Alerts" value="None"
              icon={<AlertTriangle className="size-5" />} accent="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" />
          )}
        </div>

        {/* ── Status Bars ────────────────────────────────────────────────── */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-xl border bg-card p-4 shadow-sm space-y-4">
            <StatusBar data={data.schedule_status} title="Schedule Status" />
            <StatusBar data={data.plan_status} title="Plan Status" />
          </div>
          <div className="rounded-xl border bg-card p-4 shadow-sm space-y-4">
            <StatusBar data={data.order_status} title="Order Status" />
            <StatusBar data={data.job_card_status} title="Job Card Status" />
          </div>
        </div>

        {/* ── Charts Row ─────────────────────────────────────────────────── */}
        <div className="grid md:grid-cols-2 gap-4">

          {/* Schedule status pie */}
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <p className="text-sm font-semibold mb-3">Schedule Distribution</p>
            {scheduleChartData.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-10">No schedules yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={scheduleChartData} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" outerRadius={80} innerRadius={40} paddingAngle={2}
                    label={(props: PieLabelRenderProps) => `${props.name ?? ""} ${((props.percent ?? 0) * 100).toFixed(0)}%`}>
                    {scheduleChartData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Inventory by type pie */}
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <p className="text-sm font-semibold mb-3">Inventory Composition</p>
            {inventoryPieData.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-10">No inventory items</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={inventoryPieData} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" outerRadius={80} innerRadius={40} paddingAngle={2}
                    label={(props: PieLabelRenderProps) => `${props.name ?? ""} ${((props.percent ?? 0) * 100).toFixed(0)}%`}>
                    {inventoryPieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ── Production Output Chart ────────────────────────────────────── */}
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-sm font-semibold mb-3">Daily Production Output (last 30 days)</p>
          {data.daily_production_output.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-10">No production output recorded yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={data.daily_production_output}>
                <defs>
                  <linearGradient id="colorQty" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="qty_produced" stroke="#3b82f6" fill="url(#colorQty)"
                  strokeWidth={2} name="Qty Produced" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── Top Products Bar Chart ─────────────────────────────────────── */}
        {topProductsChart.length > 0 && (
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <p className="text-sm font-semibold mb-3">Top Products by Planned Quantity</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topProductsChart} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="qty" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="Planned Qty" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Bottom Row: Recent activity + Low stock ────────────────────── */}
        <div className="grid lg:grid-cols-3 gap-4">

          {/* Recent inventory activity */}
          <div className="rounded-xl border bg-card shadow-sm lg:col-span-1 flex flex-col">
            <div className="flex items-center gap-2 px-4 pt-4 pb-2">
              <Activity className="size-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Recent Inventory</p>
            </div>
            <div className="flex-1 overflow-auto max-h-80 divide-y">
              {data.recent_inventory.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No activity yet</p>
              ) : (
                data.recent_inventory.map((r) => (
                  <div key={r.id} className="px-4 py-2.5 flex items-start gap-2.5">
                    <div className="mt-0.5">{CHANGE_ICON[r.change_type] ?? <Minus className="size-3.5 text-slate-400" />}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{r.item_code} · {r.item_name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {r.change_type === "add" ? "+" : r.change_type === "subtract" ? "" : ""}
                        {r.quantity_delta != null ? r.quantity_delta.toLocaleString() : "—"} &rarr; {r.quantity_after?.toLocaleString() ?? "—"}
                        {r.notes ? ` · ${r.notes}` : ""}
                      </p>
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5">
                      {timeAgo(r.changed_at)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent production activity */}
          <div className="rounded-xl border bg-card shadow-sm lg:col-span-1 flex flex-col">
            <div className="flex items-center gap-2 px-4 pt-4 pb-2">
              <Factory className="size-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Recent Production</p>
            </div>
            <div className="flex-1 overflow-auto max-h-80 divide-y">
              {data.recent_production.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No production yet</p>
              ) : (
                data.recent_production.map((r) => (
                  <div key={r.id} className="px-4 py-2.5 flex items-start gap-2.5">
                    <div className="mt-0.5">
                      <span className={`block size-2 rounded-full mt-1 ${STATUS_DOT[r.status] ?? "bg-slate-400"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">
                        {r.card_number} · {r.process_name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {r.order_number}
                        {r.worker_name ? ` · ${r.worker_name}` : ""}
                        {" · "}
                        <span className="font-medium text-emerald-600">{r.qty_produced}</span> produced
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {r.work_date ?? "—"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Low stock items */}
          <div className="rounded-xl border bg-card shadow-sm lg:col-span-1 flex flex-col">
            <div className="flex items-center gap-2 px-4 pt-4 pb-2">
              <AlertTriangle className="size-4 text-red-500" />
              <p className="text-sm font-semibold">Low Stock Alerts</p>
            </div>
            <div className="flex-1 overflow-auto max-h-80 divide-y">
              {data.low_stock_items.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">All stock levels healthy</p>
              ) : (
                data.low_stock_items.map((item) => {
                  const pct = item.reorder_level > 0
                    ? Math.round((item.quantity_on_hand / item.reorder_level) * 100)
                    : 0;
                  return (
                    <div key={item.id} className="px-4 py-2.5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium">{item.code} · {item.name}</p>
                        <span className="text-[10px] text-muted-foreground">{formatType(item.item_type)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${pct < 30 ? "bg-red-500" : pct < 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground w-20 text-right">
                          {item.quantity_on_hand} / {item.reorder_level} {item.unit}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

        {/* ── Semi Finished Goods ───────────────────────────────────── */}
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <div className="flex items-center gap-2">
              <Package className="size-4 text-indigo-500" />
              <p className="text-sm font-semibold">Semi Finished Goods</p>
            </div>
            <a href="/dashboard/inventory?tab=semi_finished"
              className="text-xs text-primary hover:underline">
              View all
            </a>
          </div>
          {semiFGItems.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No semi-finished items found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-b bg-muted/40">
                    <th className="px-4 py-2.5 text-left font-medium text-xs">Name / Code</th>
                    <th className="px-4 py-2.5 text-right font-medium text-xs">Qty on Hand</th>
                    <th className="px-4 py-2.5 text-right font-medium text-xs">Reorder Lvl</th>
                    <th className="px-4 py-2.5 text-left font-medium text-xs">Storage/Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {semiFGItems.map((item) => {
                    const low = item.reorder_level > 0 && item.quantity_on_hand <= item.reorder_level;
                    return (
                      <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2.5">
                          <a href={`/dashboard/inventory/${item.id}`}
                            className="font-medium hover:underline text-sm">
                            {item.name}
                          </a>
                          <div className="text-[11px] text-muted-foreground font-mono">{item.code}</div>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={low ? "text-amber-600 font-medium" : ""}>
                            {low && <AlertTriangle className="size-3 inline mr-0.5" />}
                            {item.quantity_on_hand % 1 === 0 ? item.quantity_on_hand.toFixed(0) : item.quantity_on_hand.toFixed(2)} {item.unit}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground text-xs">
                          {item.reorder_level > 0 ? `${item.reorder_level} ${item.unit}` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {[item.storage_type, item.storage_location].filter(Boolean).join(" · ") || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Inventory Value Summary (admin/super_admin only) ───────── */}
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
                    <p className="text-sm font-medium text-emerald-600 mt-0.5">
                      ₹{t.total_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
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
