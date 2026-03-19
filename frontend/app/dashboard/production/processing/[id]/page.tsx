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
}

interface JobCard {
  id: number;
  card_number: string;
  production_order_id: number;
  process_name: string;
  tool_die_number: string | null;
  machine_name: string | null;
  worker_name: string | null;
  hours_worked: number;
  qty_produced: number;
  qty_pending: number;
  work_date: string | null;
  notes: string | null;
  status: string;
  is_active: boolean;
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
  open: "secondary", in_progress: "default", completed: "outline", cancelled: "destructive",
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

  // History modal state
  const [historyJobId, setHistoryJobId] = useState<number | null>(null);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadOrder = useCallback(() => {
    if (!id) return;
    setLoading(true);
    apiFetchJson<ProductionOrder>(`/api/v1/production/orders/${id}`)
      .then(setOrder)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Not found"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { loadOrder(); }, [loadOrder]);

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
    setHistoryLoading(true);
    try {
      const data = await apiFetchJson<HistoryEntry[]>(`/api/v1/production/jobs/${jobId}/history`);
      setHistoryEntries(data);
    } catch {
      setHistoryEntries([]);
    } finally { setHistoryLoading(false); }
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
  const totalPending  = order?.job_cards.reduce((s, jc) => s + jc.qty_pending, 0) ?? 0;
  const totalHours    = order?.job_cards.reduce((s, jc) => s + jc.hours_worked, 0) ?? 0;
  const effectiveQty  = order?.effective_qty ?? 0;

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
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-semibold">{order.order_number}</h1>
                    <Badge variant={STATUS_BADGE[order.status] ?? "outline"}>
                      {STATUS_LABELS[order.status] ?? order.status}
                    </Badge>
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
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: "FG Completed", val: effectiveQty, icon: CheckCircle, color: "text-green-600 bg-green-50" },
                { label: "Job Cards", val: order.job_cards.length, icon: Factory, color: "text-blue-600 bg-blue-50" },
                { label: "Sum Produced", val: totalProduced, icon: Package, color: "text-emerald-600 bg-emerald-50" },
                { label: "Sum Pending", val: totalPending, icon: Clock, color: "text-amber-600 bg-amber-50" },
                { label: "Total Hours", val: totalHours.toFixed(1), icon: Clock, color: "text-purple-600 bg-purple-50" },
              ].map((c) => (
                <div key={c.label} className="rounded-lg border p-3 flex items-center gap-3">
                  <div className={`p-2 rounded-md ${c.color}`}><c.icon className="size-4" /></div>
                  <div>
                    <p className="text-lg font-semibold leading-none">{c.val}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{c.label}</p>
                  </div>
                </div>
              ))}
            </div>

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

            {/* ── Worker Activity Summary ───────────────────────────────── */}
            {order.job_cards.length > 0 && (() => {
              // Aggregate by worker_name
              const byWorker: Record<string, { hours: number; produced: number; cards: number; dates: Set<string> }> = {};
              order.job_cards.forEach((jc) => {
                const w = jc.worker_name ?? "Unassigned";
                if (!byWorker[w]) byWorker[w] = { hours: 0, produced: 0, cards: 0, dates: new Set() };
                byWorker[w].hours    += jc.hours_worked;
                byWorker[w].produced += jc.qty_produced;
                byWorker[w].cards    += 1;
                if (jc.work_date) byWorker[w].dates.add(jc.work_date);
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
                  {jobsByProcess.map(({ process, cards }) => (
                    <div key={process.id} className="rounded-lg border overflow-hidden">
                      {/* Process header */}
                      <div className="bg-muted/40 px-4 py-2.5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center size-6 rounded-full bg-primary/10 text-primary text-xs font-bold">
                            {process.sequence}
                          </span>
                          <span className="font-medium text-sm">{process.name}</span>
                          {process.notes && (
                            <span className="text-xs text-muted-foreground hidden sm:inline">— {process.notes}</span>
                          )}
                        </div>
                        <Button variant="ghost" size="sm" className="h-7 text-xs"
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
                                    <span className="text-muted-foreground block">Worker</span>
                                    <span className="font-medium">{jc.worker_name ?? "—"}</span>
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

                              <Badge variant={STATUS_BADGE[jc.status] ?? "outline"} className="text-xs shrink-0">
                                {STATUS_LABELS[jc.status] ?? jc.status}
                              </Badge>

                              <div className="flex gap-1 shrink-0">
                                <Button variant="ghost" size="icon" className="size-7"
                                  onClick={() => openHistory(jc.id)}
                                  title="History">
                                  <History className="size-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="size-7"
                                  onClick={() => router.push(`/dashboard/production/processing/${order.id}/jobs/${jc.id}/edit`)}
                                  title="Edit">
                                  <Pencil className="size-3" />
                                </Button>
                                <Button variant="ghost" size="icon"
                                  className="size-7 text-destructive hover:text-destructive"
                                  onClick={() => setDeleteJobId(jc.id)} title="Deactivate">
                                  <Trash2 className="size-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

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
                                <span className="text-muted-foreground">by {jc.worker_name ?? "—"}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant={STATUS_BADGE[jc.status] ?? "outline"} className="text-xs">
                                  {STATUS_LABELS[jc.status] ?? jc.status}
                                </Badge>
                                <Button variant="ghost" size="icon" className="size-7"
                                  onClick={() => router.push(`/dashboard/production/processing/${order.id}/jobs/${jc.id}/edit`)}>
                                  <Pencil className="size-3" />
                                </Button>
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
                const key = jc.worker_name ?? "(unassigned)";
                if (!byWorker[key]) {
                  byWorker[key] = { name: key, totalHours: 0, totalQty: 0, processes: [], dates: [], cards: [] };
                }
                byWorker[key].totalHours += jc.hours_worked;
                byWorker[key].totalQty   += jc.qty_produced;
                byWorker[key].cards.push(jc);
                if (!byWorker[key].processes.includes(jc.process_name))
                  byWorker[key].processes.push(jc.process_name);
                if (jc.work_date && !byWorker[key].dates.includes(jc.work_date))
                  byWorker[key].dates.push(jc.work_date);
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
                    <span className="flex items-center gap-1"><User className="size-3" />{jc.worker_name ?? "No worker"}</span>
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
