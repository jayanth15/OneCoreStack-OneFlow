"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList,
  BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiFetchJson } from "@/lib/api";
import { isAdminOrAbove, getCurrentUser } from "@/lib/user";
import {
  ArrowLeft, PlusIcon, Pencil, Trash2,
  Factory, Clock, User, Wrench, Package, Hash, CheckCircle, History,
  CalendarDays, BarChart2,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProcessItem {
  id: number;
  plan_id: number;
  name: string;
  sequence: number;
  notes: string | null;
  estimated_time_minutes: number | null;
}

// BOM summary line
interface BomLine {
  id: number;
  raw_material_name: string | null;
  raw_material_unit: string | null;
  material_used: number | null;
  scrap: number | null;
  material_unit: string | null;
}

interface JobCard {
  id: number;
  card_number: string;
  production_order_id: number;
  process_name: string;
  tool_die_number: string | null;
  machine_name: string | null;
  worker_name: string | null;
  worker_names: string[];
  hours_worked: number;
  qty_produced: number;
  qty_pending: number;
  work_date: string | null;
  notes: string | null;
  status: string;
  is_active: boolean;
  job_type: string;
  supplier_id: number | null;
  supplier_name: string | null;
}

interface HistoryEntry {
  id: number;
  job_card_id: number;
  changed_by_username: string | null;
  changed_at: string;
  change_type: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  notes: string | null;
}

interface ProductionOrder {
  id: number;
  order_number: string;
  production_plan_id: number;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  status: string;
  is_active: boolean;
  plan_number: string | null;
  plan_title: string | null;
  plan_status: string | null;
  schedule_number: string | null;
  customer_name: string | null;
  product_description: string | null;
  planned_qty: number | null;
  effective_qty: number;    // MIN(qty_produced) across all processes
  fg_credited: number;      // FG already added to inventory
  processes: ProcessItem[];
  job_cards: JobCard[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  open: "secondary", in_progress: "secondary", completed: "outline", cancelled: "destructive",
};
const STATUS_COLOR: Record<string, string> = {
  open: "", in_progress: "!bg-amber-100 !text-amber-800", completed: "", cancelled: "",
};
const STATUS_LABELS: Record<string, string> = {
  open: "Open", in_progress: "In Progress", completed: "Completed", cancelled: "Cancelled",
};
const ORDER_STATUSES = ["open", "in_progress", "completed", "cancelled"];

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProductionOrderDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<ProductionOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [deleteJobId, setDeleteJobId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [bomLines, setBomLines] = useState<BomLine[]>([]);

  // History modal state
  const [historyJobId, setHistoryJobId] = useState<number | null>(null);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyHasMore, setHistoryHasMore] = useState(false);

  const loadOrder = useCallback(() => {
    if (!id) return;
    setLoading(true);
    apiFetchJson<ProductionOrder>(`/api/v1/production/orders/${id}`)
      .then((o) => {
        setOrder(o);
        if (o.product_description) {
          apiFetchJson<BomLine[]>(`/api/v1/bom?product_name=${encodeURIComponent(o.product_description)}`)
            .then((lines) => setBomLines(lines.filter((l) => l.material_used != null || l.scrap != null)))
            .catch(() => {});
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Not found"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { loadOrder(); }, [loadOrder]);
  // Detect admin once on mount
  useEffect(() => {
    setAdmin(isAdminOrAbove());
    setCurrentUsername(getCurrentUser()?.username ?? null);
  }, []);

  async function changeStatus(newStatus: string) {
    if (!order) return;
    setStatusSaving(true);
    try {
      await apiFetchJson(`/api/v1/production/orders/${order.id}`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
      });
      loadOrder();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Status update failed");
    } finally { setStatusSaving(false); }
  }

  async function handleDeleteJob() {
    if (deleteJobId === null) return;
    setDeleting(true);
    try {
      await apiFetchJson(`/api/v1/production/jobs/${deleteJobId}`, { method: "DELETE" });
      setDeleteJobId(null);
      loadOrder();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally { setDeleting(false); }
  }

  async function openHistory(jobId: number) {
    setHistoryJobId(jobId);
    setHistoryEntries([]);
    setHistoryPage(1);
    setHistoryHasMore(false);
    setHistoryLoading(true);
    try {
      const data = await apiFetchJson<HistoryEntry[]>(`/api/v1/production/jobs/${jobId}/history?limit=10&offset=0`);
      setHistoryEntries(data);
      setHistoryHasMore(data.length === 10);
    } catch {
      setHistoryEntries([]);
    } finally { setHistoryLoading(false); }
  }

  async function changeHistoryPage(newPage: number) {
    if (!historyJobId) return;
    setHistoryEntries([]);
    setHistoryLoading(true);
    try {
      const data = await apiFetchJson<HistoryEntry[]>(`/api/v1/production/jobs/${historyJobId}/history?limit=10&offset=${(newPage - 1) * 10}`);
      setHistoryEntries(data);
      setHistoryPage(newPage);
      setHistoryHasMore(data.length === 10);
    } catch { /* silent */ } finally { setHistoryLoading(false); }
  }

  // Group job cards by process_name
  const jobsByProcess = order
    ? order.processes.map((proc) => ({
        process: proc,
        cards: order.job_cards.filter((jc) => jc.process_name === proc.name),
      }))
    : [];

  // Processes that have no job card yet
  const processesWithoutCards = order
    ? order.processes
        .filter((p) => !order.job_cards.some((jc) => jc.process_name === p.name))
        .map((p) => p.name)
    : [];

  // Summary stats
  const totalProduced = order?.job_cards.reduce((s, jc) => s + jc.qty_produced, 0) ?? 0;
  const totalHours    = order?.job_cards.reduce((s, jc) => s + jc.hours_worked, 0) ?? 0;
  const effectiveQty  = order?.effective_qty ?? 0;
  // Total estimated time = sum of estimated_time_minutes per process × planned_qty
  const totalEstimatedMinutes = order
    ? order.processes.reduce((s, p) => s + (p.estimated_time_minutes ?? 0), 0) * (order.planned_qty ?? 1)
    : 0;
  const hasEstimatedTime = order ? order.processes.some((p) => p.estimated_time_minutes != null) : false;
  // FG pending = how many more finished goods still need to complete all processes
  const fgPending = order?.planned_qty != null ? Math.max(0, order.planned_qty - effectiveQty) : null;
  // Per-process produced / pending breakdown
  const byProcess: Array<{ name: string; produced: number; pending: number }> = order
    ? order.processes.map(p => {
        const produced = order.job_cards
          .filter(jc => jc.process_name === p.name && jc.is_active)
          .reduce((s, jc) => s + jc.qty_produced, 0);
        const pending = Math.max(0, (order.planned_qty ?? 0) - produced);
        return { name: p.name, produced, pending };
      })
    : [];
  // FG completion flags
  const plannedQty = order?.planned_qty ?? 0;
  const isFgComplete = plannedQty > 0 && effectiveQty >= plannedQty;
  const isFgSurplus  = plannedQty > 0 && effectiveQty > plannedQty;

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4 md:px-6">
        <Link href="/dashboard/production/processing"
          className="p-1.5 rounded-md hover:bg-muted transition-colors" aria-label="Back">
          <ArrowLeft className="size-4" />
        </Link>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href="/dashboard/production">Production</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href="/dashboard/production/processing">Processing</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>{loading ? "Loading…" : order?.order_number ?? "Not found"}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

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
                      <Badge className="bg-green-100 text-green-800 border-green-200">Production Complete</Badge>
                    )}
                    {isFgSurplus && (
                      <Badge className="bg-amber-100 text-amber-800 border-amber-200">Surplus</Badge>
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
                    disabled={statusSaving}
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
                <div className="p-2 rounded-md text-green-600 bg-green-50"><CheckCircle className="size-4" /></div>
                <div>
                  <p className="text-lg font-semibold leading-none">{effectiveQty}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">FG Completed</p>
                </div>
              </div>
              {/* Job Cards */}
              <div className="rounded-lg border p-3 flex items-center gap-3">
                <div className="p-2 rounded-md text-blue-600 bg-blue-50"><Factory className="size-4" /></div>
                <div>
                  <p className="text-lg font-semibold leading-none">{order.job_cards.length}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Job Cards</p>
                </div>
              </div>
              {/* FG Pending */}
              <div className="rounded-lg border p-3 flex items-center gap-3">
                <div className="p-2 rounded-md text-amber-600 bg-amber-50"><Clock className="size-4" /></div>
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
                      <span className={l.material_used != null ? "text-blue-700 font-mono font-semibold" : "text-muted-foreground"}>
                        {l.material_used != null ? (l.material_used * effectiveQty).toFixed(3) : "—"}
                      </span>
                      <span className={l.scrap != null ? "text-amber-600 font-mono font-semibold" : "text-muted-foreground"}>
                        {l.scrap != null ? (l.scrap * effectiveQty).toFixed(3) : "—"}
                      </span>
                      <span className="text-muted-foreground">{l.material_unit ?? l.raw_material_unit ?? "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* FG explanation note */}
            <div className="rounded-lg border border-dashed bg-green-50/50 p-3 text-xs text-muted-foreground">
              <span className="font-medium text-green-700">FG Completed = MIN(produced) across all processes.</span>{" "}
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
                    const procTotal = proc.produced + proc.pending;
                    const pct = procTotal > 0 ? Math.round((proc.produced / procTotal) * 100) : 0;
                    const surplus = plannedQty > 0 ? Math.max(0, proc.produced - plannedQty) : 0;
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
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="text-emerald-700 font-semibold">
                            {proc.produced}{" "}
                            <span className="font-normal text-muted-foreground">done</span>
                          </span>
                          <span className="text-amber-600">
                            {proc.pending}{" "}
                            <span className="text-muted-foreground">pending</span>
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${surplus > 0 ? "bg-purple-500" : "bg-emerald-500"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1 text-right">{pct}% complete</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Worker Activity Summary ───────────────────────────────── */}
            {order.job_cards.length > 0 && (() => {
              // Aggregate by worker_name; expand worker_names array when present
              const byWorker: Record<string, { hours: number; produced: number; cards: number; dates: Set<string> }> = {};
              order.job_cards.forEach((jc) => {
                if (jc.job_type === "supplier") return;
                const workers = jc.worker_names?.length ? jc.worker_names : (jc.worker_name ? [jc.worker_name] : ["Unassigned"]);
                workers.forEach((w) => {
                  if (!byWorker[w]) byWorker[w] = { hours: 0, produced: 0, cards: 0, dates: new Set() };
                  byWorker[w].hours    += jc.hours_worked / workers.length;
                  byWorker[w].produced += jc.qty_produced / workers.length;
                  byWorker[w].cards    += 1;
                  if (jc.work_date) byWorker[w].dates.add(jc.work_date);
                });
              });
              const entries = Object.entries(byWorker);
              if (entries.length === 0) return null;
              return (
                <div className="rounded-lg border overflow-hidden">
                  <div className="bg-muted/40 px-4 py-2.5 flex items-center gap-2">
                    <User className="size-4 text-muted-foreground" />
                    <span className="font-medium text-sm">Worker Activity</span>
                    <span className="text-xs text-muted-foreground">— total across all job cards</span>
                  </div>
                  <div className="divide-y">
                    {entries.map(([name, stats]) => (
                      <div key={name} className="px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs hover:bg-muted/20 transition-colors">
                        <div className="flex items-center gap-1.5">
                          <div className="size-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
                            {name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{name}</p>
                            <p className="text-muted-foreground">{stats.cards} job card{stats.cards !== 1 ? "s" : ""}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="size-3.5 text-purple-500 shrink-0" />
                          <div>
                            <p className="font-mono font-semibold text-purple-700">{stats.hours.toFixed(1)} h</p>
                            <p className="text-muted-foreground">Hours worked</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Package className="size-3.5 text-emerald-500 shrink-0" />
                          <div>
                            <p className="font-mono font-semibold text-emerald-700">{stats.produced}</p>
                            <p className="text-muted-foreground">Units produced</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <CalendarDays className="size-3.5 text-blue-500 shrink-0" />
                          <div>
                            <p className="font-mono font-semibold text-blue-700">{stats.dates.size} day{stats.dates.size !== 1 ? "s" : ""}</p>
                            <p className="text-muted-foreground truncate max-w-[140px]" title={[...stats.dates].sort().join(", ")}>
                              {[...stats.dates].sort().slice(-2).join(", ") || "—"}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* ── Process Steps & Job Cards ─────────────────────────────────── */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Process Steps & Job Cards</h2>
                <Button size="sm"
                  onClick={() => router.push(`/dashboard/production/processing/${order.id}/jobs/new`)}>
                  <PlusIcon className="size-4 mr-1" />
                  Add Job Card
                </Button>
              </div>

              {order.processes.length === 0 ? (
                <div className="rounded-lg border p-6 text-center text-muted-foreground">
                  <p>No process steps found on the linked production plan.</p>
                  <p className="text-xs mt-1">Add process steps to the plan first, then create job cards.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {jobsByProcess.map(({ process, cards }) => {
                    const processProduced = cards
                      .filter(jc => jc.is_active)
                      .reduce((s, jc) => s + jc.qty_produced, 0);
                    const processPlanned = order.planned_qty ?? 0;
                    const processPending = Math.max(0, processPlanned - processProduced);
                    const processPct = processPlanned > 0 ? Math.min(100, Math.round((processProduced / processPlanned) * 100)) : 0;
                    return (
                    <div key={process.id} className="rounded-lg border overflow-hidden">
                      {/* Process header */}
                      <div className="bg-muted/40 px-4 py-2.5 flex items-center justify-between gap-3">
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <span className="inline-flex items-center justify-center size-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0 mt-0.5">
                            {process.sequence}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{process.name}</span>
                              {process.notes && (
                                <span className="text-xs text-muted-foreground hidden sm:inline">— {process.notes}</span>
                              )}
                              {processPlanned > 0 && (
                                <span className="text-[11px] text-muted-foreground font-mono">
                                  {processProduced} / {processPlanned} ({processPct}%)
                                </span>
                              )}
                            </div>
                            {/* Progress bar */}
                            {processPlanned > 0 && (
                              <div className="mt-1.5 h-1.5 w-full rounded-full bg-background/60 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    processPct >= 100
                                      ? "bg-emerald-500"
                                      : processPct >= 50
                                        ? "bg-blue-500"
                                        : "bg-amber-500"
                                  }`}
                                  style={{ width: `${processPct}%` }}
                                />
                              </div>
                            )}
                            {/* Time summary */}
                            {(process.estimated_time_minutes != null) && (
                              <div className="flex items-center gap-3 mt-1 flex-wrap">
                                <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                                  <Clock className="size-3" />
                                  {process.estimated_time_minutes < 1
                                    ? `${Math.round(process.estimated_time_minutes * 60)} sec`
                                    : process.estimated_time_minutes >= 60
                                      ? `${(process.estimated_time_minutes / 60).toFixed(1)} hr`
                                      : `${process.estimated_time_minutes} min`} / unit
                                </span>
                                {processPending > 0 && (
                                  <span className="text-[11px] text-amber-600 font-medium">
                                    {processPending} unit{processPending !== 1 ? "s" : ""} pending
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0"
                          onClick={() =>
                            router.push(`/dashboard/production/processing/${order.id}/jobs/new?process=${encodeURIComponent(process.name)}`)
                          }>
                          <PlusIcon className="size-3 mr-1" />
                          Add Job Card
                        </Button>
                      </div>

                      {/* Job cards for this process */}
                      {cards.length === 0 ? (
                        <div className="px-4 py-4 text-center text-xs text-muted-foreground">
                          No job card yet for this process.
                        </div>
                      ) : (
                        <div className="divide-y">
                          {cards.map((jc) => (
                            <div key={jc.id} className="px-4 py-3 flex items-center gap-4 hover:bg-muted/20 transition-colors">
                              <div className="flex-1 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                                <div>
                                  <span className="text-muted-foreground block">Card #</span>
                                  <span className="font-mono font-medium">{jc.card_number}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <User className="size-3 text-muted-foreground shrink-0" />
                                  <div>
                                    <span className="text-muted-foreground block">{jc.job_type === "supplier" ? "Supplier" : "Worker"}</span>
                                    <span className="font-medium">
                                      {jc.job_type === "supplier"
                                        ? (jc.supplier_name ?? "—")
                                        : (jc.worker_names?.length
                                            ? jc.worker_names.join(", ")
                                            : (jc.worker_name ?? "—"))}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Wrench className="size-3 text-muted-foreground shrink-0" />
                                  <div>
                                    <span className="text-muted-foreground block">Machine</span>
                                    <span className="font-medium">{jc.machine_name ?? "—"}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Hash className="size-3 text-muted-foreground shrink-0" />
                                  <div>
                                    <span className="text-muted-foreground block">Tool & Die</span>
                                    <span className="font-medium">{jc.tool_die_number ?? "—"}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <div>
                                    <span className="text-muted-foreground block">Produced</span>
                                    <span className="font-mono font-medium text-emerald-600">{jc.qty_produced}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground block">Pending</span>
                                    <span className="font-mono font-medium text-amber-600">{jc.qty_pending}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground block">Hours</span>
                                    <span className="font-mono font-medium">{jc.hours_worked}</span>
                                  </div>
                                </div>
                              </div>

                              <Badge variant={STATUS_BADGE[jc.status] ?? "outline"} className={`text-xs shrink-0 ${STATUS_COLOR[jc.status] ?? ""}`}>
                                {STATUS_LABELS[jc.status] ?? jc.status}
                              </Badge>

                              <div className="flex gap-1 shrink-0">
                                <Button variant="ghost" size="icon" className="size-7"
                                  onClick={() => openHistory(jc.id)}
                                  title="History">
                                  <History className="size-3" />
                                </Button>
                                <Button
                                  variant="ghost" size="sm"
                                  className="h-7 text-xs px-2 text-primary hover:text-primary"
                                  onClick={() => {
                                    const params = new URLSearchParams({ process: jc.process_name });
                                    if (jc.worker_names?.length) params.set("worker", jc.worker_names.join(", "));
                                    else if (jc.worker_name) params.set("worker", jc.worker_name);
                                    if (jc.tool_die_number) params.set("tool_die", jc.tool_die_number);
                                    if (jc.machine_name) params.set("machine", jc.machine_name);
                                    if (jc.job_type) params.set("job_type", jc.job_type);
                                    if (jc.supplier_id) params.set("supplier_id", String(jc.supplier_id));
                                    router.push(`/dashboard/production/processing/${order.id}/jobs/new?${params}`);
                                  }}
                                  title="Log another entry with the same worker / tool / machine"
                                >
                                  <PlusIcon className="size-3 mr-1" />
                                  Log
                                </Button>
                                {(admin || (jc.worker_names?.includes(currentUsername ?? "") ?? jc.worker_name === currentUsername)) && (
                                  <Button variant="ghost" size="icon" className="size-7"
                                    onClick={() => router.push(`/dashboard/production/processing/${order.id}/jobs/${jc.id}/edit`)}
                                    title="Edit">
                                    <Pencil className="size-3" />
                                  </Button>
                                )}
                                {admin && (
                                  <Button variant="ghost" size="icon"
                                    className="size-7 text-destructive hover:text-destructive"
                                    onClick={() => setDeleteJobId(jc.id)} title="Deactivate">
                                    <Trash2 className="size-3" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    );
                  })}

                  {/* Orphaned job cards (process not in plan) */}
                  {order.job_cards
                    .filter((jc) => !order.processes.some((p) => p.name === jc.process_name))
                    .length > 0 && (
                    <div className="rounded-lg border overflow-hidden">
                      <div className="bg-muted/40 px-4 py-2.5">
                        <span className="font-medium text-sm text-muted-foreground">Other Job Cards</span>
                      </div>
                      <div className="divide-y">
                        {order.job_cards
                          .filter((jc) => !order.processes.some((p) => p.name === jc.process_name))
                          .map((jc) => (
                            <div key={jc.id} className="px-4 py-3 flex items-center justify-between text-xs">
                              <div>
                                <span className="font-mono font-medium">{jc.card_number}</span>{" "}
                                <span className="text-muted-foreground">— {jc.process_name}</span>{" "}
                                <span className="text-muted-foreground">by {jc.job_type === "supplier" ? (jc.supplier_name ?? "—") : (jc.worker_names?.length ? jc.worker_names.join(", ") : (jc.worker_name ?? "—"))}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant={STATUS_BADGE[jc.status] ?? "outline"} className={`text-xs ${STATUS_COLOR[jc.status] ?? ""}`}>
                                  {STATUS_LABELS[jc.status] ?? jc.status}
                                </Badge>
                                {(admin || (jc.worker_names?.includes(currentUsername ?? "") ?? jc.worker_name === currentUsername)) && (
                                  <Button variant="ghost" size="icon" className="size-7"
                                    onClick={() => router.push(`/dashboard/production/processing/${order.id}/jobs/${jc.id}/edit`)}>
                                    <Pencil className="size-3" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Quick-add hint if processes without cards exist */}
              {processesWithoutCards.length > 0 && (
                <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  <p>
                    {processesWithoutCards.length} process{processesWithoutCards.length > 1 ? "es" : ""} still
                    need job cards:{" "}
                    <span className="font-medium text-foreground">{processesWithoutCards.join(", ")}</span>
                  </p>
                </div>
              )}
            </div>

            {/* ── Worker Activity Summary ───────────────────────────────────── */}
            {order.job_cards.length > 0 && (() => {
              // Group all job cards by worker
              const byWorker: Record<string, {
                name: string;
                totalHours: number;
                totalQty: number;
                processes: string[];
                dates: string[];
                cards: JobCard[];
              }> = {};
              order.job_cards.forEach((jc) => {
                if (jc.job_type === "supplier") return;
                const workers = jc.worker_names?.length ? jc.worker_names : (jc.worker_name ? [jc.worker_name] : ["(unassigned)"]);
                workers.forEach((key) => {
                  if (!byWorker[key]) {
                    byWorker[key] = { name: key, totalHours: 0, totalQty: 0, processes: [], dates: [], cards: [] };
                  }
                  byWorker[key].totalHours += jc.hours_worked / workers.length;
                  byWorker[key].totalQty   += jc.qty_produced / workers.length;
                  byWorker[key].cards.push(jc);
                  if (!byWorker[key].processes.includes(jc.process_name))
                    byWorker[key].processes.push(jc.process_name);
                  if (jc.work_date && !byWorker[key].dates.includes(jc.work_date))
                    byWorker[key].dates.push(jc.work_date);
                });
              });
              const workers = Object.values(byWorker).sort((a, b) => b.totalHours - a.totalHours);

              return (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <User className="size-4 text-muted-foreground" />
                    <h2 className="text-lg font-semibold">Worker Activity</h2>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {workers.map((w) => (
                      <div key={w.name} className="rounded-lg border p-4 space-y-3">
                        {/* Worker header */}
                        <div className="flex items-center gap-2">
                          <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <User className="size-4 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate">{w.name}</p>
                            <p className="text-xs text-muted-foreground">{w.cards.length} job card{w.cards.length !== 1 ? "s" : ""}</p>
                          </div>
                        </div>

                        {/* Stats row */}
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/20 p-2">
                            <p className="text-lg font-bold text-emerald-600">{w.totalQty}</p>
                            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">Pcs Produced</p>
                          </div>
                          <div className="rounded-md bg-purple-50 dark:bg-purple-950/20 p-2">
                            <p className="text-lg font-bold text-purple-600">{w.totalHours.toFixed(1)}</p>
                            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">Hours Worked</p>
                          </div>
                          <div className="rounded-md bg-blue-50 dark:bg-blue-950/20 p-2">
                            <p className="text-lg font-bold text-blue-600">
                              {w.totalHours > 0 ? (w.totalQty / w.totalHours).toFixed(1) : "—"}
                            </p>
                            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">Pcs / Hr</p>
                          </div>
                        </div>

                        {/* Processes */}
                        <div className="space-y-1">
                          <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wide">Processes</p>
                          <div className="flex flex-wrap gap-1">
                            {w.processes.map((p) => (
                              <Badge key={p} variant="secondary" className="text-[10px] px-1.5 py-0">{p}</Badge>
                            ))}
                          </div>
                        </div>

                        {/* Per-card detail */}
                        <div className="space-y-1 border-t pt-2">
                          <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wide">Session Breakdown</p>
                          {w.cards.map((jc) => (
                            <div key={jc.id} className="flex items-center justify-between text-xs py-0.5 border-b border-dashed last:border-0">
                              <div className="min-w-0">
                                <span className="font-mono text-muted-foreground mr-1.5">{jc.card_number}</span>
                                <span className="font-medium">{jc.process_name}</span>
                                {jc.work_date && (
                                  <span className="text-muted-foreground ml-1.5">
                                    {new Date(jc.work_date).toLocaleDateString("en-IN", { day:"2-digit", month:"short" })}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0 ml-2">
                                <span className="text-emerald-600 font-medium"><Package className="size-2.5 inline mr-0.5" />{jc.qty_produced}</span>
                                <span className="text-purple-600 font-medium"><Clock className="size-2.5 inline mr-0.5" />{jc.hours_worked}h</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </div>

      <AlertDialog open={deleteJobId !== null} onOpenChange={(o) => !o && setDeleteJobId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate job card?</AlertDialogTitle>
            <AlertDialogDescription>This will mark the job card as inactive.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteJob} disabled={deleting}>
              {deleting ? "Deactivating…" : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* History Modal — Worker Activity View */}
      {historyJobId !== null && (() => {
        const jc = order?.job_cards.find(j => j.id === historyJobId) ?? null;
        return (
          <AlertDialog open onOpenChange={(o) => !o && setHistoryJobId(null)}>
            <AlertDialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <History className="size-4" />
                  Job Card Activity
                  {jc && <span className="font-mono text-sm text-muted-foreground ml-1">— {jc.card_number}</span>}
                </AlertDialogTitle>
                {jc && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1">
                    <span className="flex items-center gap-1"><User className="size-3" />{jc.job_type === "supplier" ? (jc.supplier_name ?? "No supplier") : (jc.worker_names?.length ? jc.worker_names.join(", ") : (jc.worker_name ?? "No worker"))}</span>
                    <span className="flex items-center gap-1"><Factory className="size-3" />{jc.process_name}</span>
                    {jc.machine_name && <span className="flex items-center gap-1"><Wrench className="size-3" />{jc.machine_name}</span>}
                    {jc.work_date && <span className="flex items-center gap-1"><CalendarDays className="size-3" />{jc.work_date}</span>}
                  </div>
                )}
              </AlertDialogHeader>

              {/* Current snapshot */}
              {jc && (
                <div className="grid grid-cols-3 gap-3 rounded-lg border bg-muted/30 p-3 text-sm shrink-0">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-emerald-600">{jc.qty_produced}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Qty Produced</p>
                  </div>
                  <div className="text-center border-x">
                    <p className="text-2xl font-bold text-amber-600">{jc.qty_pending}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Qty Pending</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-purple-600">{jc.hours_worked}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Hours Worked</p>
                  </div>
                </div>
              )}

              {/* Change log */}
              <div className="flex-1 overflow-y-auto pr-1 space-y-1.5 min-h-0 max-h-80">
                {historyLoading ? (
                  <div className="space-y-2 py-2">
                    {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                  </div>
                ) : historyEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No history recorded yet.</p>
                ) : (
                  <>
                    {/* Worker activity summary: group by date */}
                    {(() => {
                      // Collect unique (worker, date, qty, hours) snapshots from history
                      const workerActivity: Record<string, { worker: string; date: string; productions: { qty: string; hours: string; note: string | null }[] }> = {};
                      historyEntries
                        .filter(h => h.change_type === "created" || (h.change_type === "updated" && (h.field_name === "qty_produced" || h.field_name === "hours_worked")))
                        .forEach(h => {
                          const date = h.changed_at ? new Date(h.changed_at).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"2-digit" }) : "—";
                          const worker = h.changed_by_username ?? "Unknown";
                          const key = `${worker}::${date}`;
                          if (!workerActivity[key]) workerActivity[key] = { worker, date, productions: [] };
                          workerActivity[key].productions.push({
                            qty: h.new_value ?? "—",
                            hours: "—",
                            note: h.notes,
                          });
                        });
                      return null; // we just render the raw entries below with better formatting
                    })()}

                    {historyEntries.map((h) => {
                      const isCreated = h.change_type === "created";
                      const isQtyChange = h.field_name === "qty_produced";
                      const isHoursChange = h.field_name === "hours_worked";
                      const isWorkerChange = h.field_name === "worker_name";
                      const isDateChange = h.field_name === "work_date";
                      const dateStr = h.changed_at
                        ? new Date(h.changed_at).toLocaleString("en-IN", { day:"2-digit", month:"short", year:"2-digit", hour:"2-digit", minute:"2-digit", hour12:true })
                        : "—";

                      let icon = <BarChart2 className="size-3.5 text-muted-foreground" />;
                      let accentColor = "border-l-gray-200";
                      let summary = "";

                      if (isCreated) {
                        icon = <CheckCircle className="size-3.5 text-emerald-500" />;
                        accentColor = "border-l-emerald-400";
                        summary = "Job card created";
                      } else if (isQtyChange) {
                        icon = <Package className="size-3.5 text-blue-500" />;
                        accentColor = "border-l-blue-400";
                        const diff = h.new_value && h.old_value
                          ? parseFloat(h.new_value) - parseFloat(h.old_value)
                          : null;
                        summary = `Qty produced: ${h.old_value ?? "—"} → ${h.new_value ?? "—"}${diff !== null ? ` (${diff >= 0 ? "+" : ""}${diff})` : ""}`;
                      } else if (isHoursChange) {
                        icon = <Clock className="size-3.5 text-purple-500" />;
                        accentColor = "border-l-purple-400";
                        const diff = h.new_value && h.old_value
                          ? parseFloat(h.new_value) - parseFloat(h.old_value)
                          : null;
                        summary = `Hours worked: ${h.old_value ?? "—"} → ${h.new_value ?? "—"}${diff !== null ? ` (${diff >= 0 ? "+" : ""}${diff.toFixed(1)} h)` : ""}`;
                      } else if (isWorkerChange) {
                        icon = <User className="size-3.5 text-amber-500" />;
                        accentColor = "border-l-amber-400";
                        summary = `Worker: ${h.old_value ?? "—"} → ${h.new_value ?? "—"}`;
                      } else if (isDateChange) {
                        icon = <CalendarDays className="size-3.5 text-teal-500" />;
                        accentColor = "border-l-teal-400";
                        summary = `Work date: ${h.old_value ?? "—"} → ${h.new_value ?? "—"}`;
                      } else if (h.field_name) {
                        summary = `${h.field_name.replace(/_/g, " ")}: ${h.old_value ?? "—"} → ${h.new_value ?? "—"}`;
                      } else if (h.change_type === "deleted") {
                        icon = <Trash2 className="size-3.5 text-red-500" />;
                        accentColor = "border-l-red-400";
                        summary = "Deactivated";
                      }

                      return (
                        <div key={h.id} className={`rounded-md border border-l-4 ${accentColor} bg-card p-3 text-xs`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-1.5 font-medium">
                              {icon}
                              <span>{summary}</span>
                            </div>
                            <span className="text-muted-foreground whitespace-nowrap">{dateStr}</span>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-muted-foreground">
                            {h.changed_by_username && (
                              <span className="flex items-center gap-1">
                                <User className="size-2.5" />{h.changed_by_username}
                              </span>
                            )}
                            {h.notes && <span className="italic">{h.notes}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>

              {(historyPage > 1 || historyHasMore) && (
                <div className="flex items-center justify-between pt-3 pb-1">
                  <Button size="sm" variant="outline" disabled={historyPage <= 1 || historyLoading} onClick={() => changeHistoryPage(historyPage - 1)}>← Prev</Button>
                  <span className="text-sm text-muted-foreground">Page {historyPage}</span>
                  <Button size="sm" variant="outline" disabled={!historyHasMore || historyLoading} onClick={() => changeHistoryPage(historyPage + 1)}>Next →</Button>
                </div>
              )}

              <AlertDialogFooter>
                <AlertDialogCancel>Close</AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      })()}
    </>
  );
}
