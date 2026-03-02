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

      {/* History Modal */}
      <AlertDialog open={historyJobId !== null} onOpenChange={(o) => !o && setHistoryJobId(null)}>
        <AlertDialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Job Card History
              {historyJobId && order && (() => {
                const jc = order.job_cards.find(j => j.id === historyJobId);
                return jc ? ` — ${jc.card_number}` : "";
              })()}
            </AlertDialogTitle>
            <AlertDialogDescription>Full audit trail of changes.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex-1 overflow-y-auto pr-1 space-y-2 max-h-96">
            {historyLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : historyEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No history recorded yet.</p>
            ) : (
              historyEntries.map((h) => (
                <div key={h.id} className="rounded-md border p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <Badge variant={h.change_type === "created" ? "default" : h.change_type === "deleted" ? "destructive" : "secondary"} className="text-[10px]">
                      {h.change_type}
                    </Badge>
                    <span className="text-muted-foreground">
                      {h.changed_at ? new Date(h.changed_at).toLocaleString() : "—"}
                    </span>
                  </div>
                  {h.field_name && (
                    <p>
                      <span className="font-medium">{h.field_name.replace(/_/g, " ")}</span>
                      {h.change_type === "created" ? (
                        <span className="text-muted-foreground"> set to </span>
                      ) : (
                        <span className="text-muted-foreground"> changed from </span>
                      )}
                      {h.change_type !== "created" && h.old_value != null && (
                        <span className="font-mono text-red-600 line-through">{h.old_value}</span>
                      )}
                      {h.change_type !== "created" && <span className="text-muted-foreground"> → </span>}
                      {h.new_value != null && (
                        <span className="font-mono text-green-600">{h.new_value}</span>
                      )}
                    </p>
                  )}
                  {h.changed_by_username && (
                    <p className="text-muted-foreground">by {h.changed_by_username}</p>
                  )}
                </div>
              ))
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
