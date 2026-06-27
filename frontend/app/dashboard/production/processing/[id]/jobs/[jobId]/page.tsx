"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiFetchJson } from "@/lib/api";
import {
  ArrowLeft, Pencil, PlusIcon, Trash2,
  Factory, Clock, User, Wrench, Package, Hash, CheckCircle, History,
  CalendarDays, BarChart2,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProcessItem {
  id: number;
  name: string;
  sequence: number;
  estimated_time_minutes: number | null;
}

interface OrderInfo {
  id: number;
  order_number: string;
  processes: ProcessItem[];
  planned_qty: number | null;
}

interface JobCardDetail {
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
  actual_qty: number | null;
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

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  open: "secondary", in_progress: "secondary", completed: "outline", cancelled: "destructive",
};
const STATUS_COLOR: Record<string, string> = {
  open: "", in_progress: "!bg-warning/15 !text-amber-800", completed: "", cancelled: "",
};
const STATUS_LABELS: Record<string, string> = {
  open: "Open", in_progress: "In Progress", completed: "Completed", cancelled: "Cancelled",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function JobCardDetailPage() {
  const router = useRouter();
  const { id, jobId } = useParams<{ id: string; jobId: string }>();

  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [job, setJob] = useState<JobCardDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // History
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyHasMore, setHistoryHasMore] = useState(false);

  // Delete dialog
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id || !jobId) return;
    Promise.all([
      apiFetchJson<OrderInfo>(`/api/v1/production/orders/${id}`),
      apiFetchJson<JobCardDetail>(`/api/v1/production/jobs/${jobId}`),
    ])
      .then(([o, jc]) => { setOrder(o); setJob(jc); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Not found"))
      .finally(() => setLoading(false));
  }, [id, jobId]);

  useEffect(() => {
    if (!jobId) return;
    apiFetchJson<HistoryEntry[]>(`/api/v1/production/jobs/${jobId}/history?limit=10&offset=0`)
      .then((data) => { setHistoryEntries(data); setHistoryHasMore(data.length === 10); })
      .catch(() => setHistoryEntries([]))
      .finally(() => setHistoryLoading(false));
  }, [jobId]);

  async function changeHistoryPage(newPage: number) {
    if (!jobId) return;
    setHistoryEntries([]);
    setHistoryLoading(true);
    try {
      const data = await apiFetchJson<HistoryEntry[]>(
        `/api/v1/production/jobs/${jobId}/history?limit=10&offset=${(newPage - 1) * 10}`
      );
      setHistoryEntries(data);
      setHistoryPage(newPage);
      setHistoryHasMore(data.length === 10);
    } catch { /* silent */ } finally { setHistoryLoading(false); }
  }

  async function handleDelete() {
    if (!job) return;
    setDeleting(true);
    try {
      await apiFetchJson(`/api/v1/production/jobs/${job.id}`, { method: "DELETE" });
      router.push(`/dashboard/production/processing/${id}/jobs`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally { setDeleting(false); setShowDeleteDialog(false); }
  }

  // Derived values
  const selectedProcess = order?.processes.find((p) => p.name === (job?.process_name ?? "")) ?? null;
  const estimatedTimeMinutes = selectedProcess?.estimated_time_minutes ?? null;

  const estimatedQty = job?.qty_produced ?? 0;
  const actualQty = job?.actual_qty;
  const hasActual = actualQty !== null && actualQty !== undefined;
  const diff = hasActual ? actualQty - estimatedQty : null;
  const diffPct = diff !== null && estimatedQty > 0 ? (diff / estimatedQty) * 100 : null;
  const diffColor = diff !== null ? (diff >= 0 ? "text-success" : "text-warning") : "";

  const backUrl = `/dashboard/production/processing/${id}/jobs`;

  return (
    <>
      <PageHeader
        title={loading ? "Loading…" : job?.card_number ?? "Job Card"}
        description={job ? `${job.process_name}${job.work_date ? ` — ${new Date(job.work_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}` : ""}` : undefined}
        breadcrumbs={[
          { label: "Production", href: "/dashboard/production" },
          { label: "Processing", href: "/dashboard/production/processing" },
          { label: order?.order_number ?? "Order", href: `/dashboard/production/processing/${id}` },
          { label: "Job Cards", href: `/dashboard/production/processing/${id}/jobs` },
          { label: loading ? "…" : job?.card_number ?? "Not found" },
        ]}
        actions={
          <Link href={backUrl}
            className="p-1.5 rounded-md hover:bg-muted transition-colors" aria-label="Back">
            <ArrowLeft className="size-4" />
          </Link>
        }
      />

      <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : !job ? (
          <p className="text-muted-foreground py-10 text-center">Job card not found.</p>
        ) : (
          <>
            {/* ── Header Card ────────────────────────────────────────────── */}
            <div className="rounded-lg border bg-card p-5 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl font-bold font-mono">{job.card_number}</h2>
                    <Badge variant={STATUS_BADGE[job.status] ?? "outline"}
                      className={`text-xs ${STATUS_COLOR[job.status] ?? ""}`}>
                      {STATUS_LABELS[job.status] ?? job.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <Factory className="size-3.5" />
                    {job.process_name}
                  </p>
                  {job.work_date && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <CalendarDays className="size-3.5" />
                      {new Date(job.work_date).toLocaleDateString("en-IN", {
                        day: "2-digit", month: "short", year: "numeric",
                      })}
                    </p>
                  )}
                </div>
              </div>

              {/* Worker(s) / Supplier */}
              <div className="pt-3 border-t">
                {job.job_type === "supplier" ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Supplier:</span>
                    <span className="font-medium">{job.supplier_name ?? "—"}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm flex-wrap">
                    <User className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">Worker(s):</span>
                    {job.worker_names?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {job.worker_names.map((w) => (
                          <Badge key={w} variant="secondary" className="text-xs">{w}</Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="font-medium">{job.worker_name ?? "—"}</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── Production Stats ──────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg border bg-card p-4 text-center">
                <p className="text-2xl font-bold text-primary">{estimatedQty}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Estimated Qty</p>
              </div>
              <div className="rounded-lg border bg-card p-4 text-center">
                <p className={`text-2xl font-bold ${hasActual ? "" : "text-muted-foreground"}`}>
                  {hasActual ? actualQty : "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Actual Qty</p>
              </div>
              <div className="rounded-lg border bg-card p-4 text-center">
                <p className="text-2xl font-bold text-purple-600">{job.hours_worked}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Hours Worked</p>
              </div>
              <div className="rounded-lg border bg-card p-4 text-center">
                <p className="text-2xl font-bold text-warning">{job.qty_pending}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Qty Pending</p>
              </div>
            </div>

            {/* ── Comparison ───────────────────────────────────────── */}
            {(hasActual || estimatedTimeMinutes != null) && (
              <div className={`rounded-lg border p-4 ${diffColor}`}>
                <p className="text-xs uppercase font-semibold tracking-wide text-muted-foreground mb-2">Estimate vs Actual</p>
                <div className="space-y-1 text-sm">
                  <p>
                    <span className="text-muted-foreground">Estimated:</span>{" "}
                    <strong>{estimatedQty}</strong> units
                    {estimatedTimeMinutes && job.hours_worked > 0 && (
                      <span className="text-muted-foreground ml-1">
                        ({job.hours_worked}h × 60 ÷ {estimatedTimeMinutes} min/unit)
                      </span>
                    )}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Actual:</span>{" "}
                    <strong>{hasActual ? actualQty : "— (not entered)"}</strong> units
                  </p>
                  {hasActual && diff !== null && (
                    <p className={`font-medium ${diffColor}`}>
                      <span className="text-muted-foreground">Diff:</span>{" "}
                      {diff >= 0 ? "+" : ""}{diff} units
                      {diffPct !== null && (
                        <span className="ml-1">
                          ({diffPct >= 0 ? "+" : ""}{diffPct.toFixed(1)}% {diff >= 0 ? "more" : "less"} than estimated)
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ── Machine & Tool/Die ────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wide mb-1">Machine</p>
                <p className="font-medium flex items-center gap-1.5">
                  <Wrench className="size-4 text-muted-foreground shrink-0" />
                  {job.machine_name ?? "—"}
                </p>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wide mb-1">Tool & Die</p>
                <p className="font-medium flex items-center gap-1.5">
                  <Hash className="size-4 text-muted-foreground shrink-0" />
                  {job.tool_die_number ?? "—"}
                </p>
              </div>
            </div>

            {/* ── Notes ─────────────────────────────────────────────── */}
            {job.notes && (
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wide mb-1">Notes</p>
                <p className="text-sm whitespace-pre-wrap">{job.notes}</p>
              </div>
            )}

            {/* ── Worker Activity (this card) ──────────────────────── */}
            {job.worker_names?.length > 0 && job.job_type !== "supplier" && (() => {
              const workerCount = job.worker_names.length;
              const hoursPerWorker = workerCount > 0 ? job.hours_worked / workerCount : 0;
              const qtyPerWorker = workerCount > 0 ? (actualQty || estimatedQty) / workerCount : 0;
              return (
                <div className="rounded-lg border overflow-hidden">
                  <div className="bg-muted/40 px-4 py-2.5 flex items-center gap-2">
                    <User className="size-4 text-muted-foreground" />
                    <span className="font-medium text-sm">Worker Activity</span>
                    <span className="text-xs text-muted-foreground">— this job card</span>
                  </div>
                  <div className="divide-y">
                    {job.worker_names.map((name, i) => (
                      <div key={i} className="px-4 py-3 grid grid-cols-3 gap-3 text-xs hover:bg-muted/20 transition-colors">
                        <div className="flex items-center gap-1.5">
                          <div className="size-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
                            {name.charAt(0).toUpperCase()}
                          </div>
                          <p className="font-medium text-sm">{name}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="size-3.5 text-purple-500 shrink-0" />
                          <div>
                            <p className="font-mono font-semibold text-purple-700">{hoursPerWorker.toFixed(1)} h</p>
                            <p className="text-muted-foreground">Hours worked</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Package className="size-3.5 text-success shrink-0" />
                          <div>
                            <p className="font-mono font-semibold text-success">{qtyPerWorker.toFixed(1)}</p>
                            <p className="text-muted-foreground">Units produced</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* ── Action Buttons ────────────────────────────────────── */}
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href={`/dashboard/production/processing/${id}/jobs/${job.id}/edit`}>
                  <Pencil className="size-4 mr-1" />
                  Edit
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/dashboard/production/processing/${id}/jobs/new?process=${encodeURIComponent(job.process_name)}&tool_die=${encodeURIComponent(job.tool_die_number ?? "")}&machine=${encodeURIComponent(job.machine_name ?? "")}&job_type=${job.job_type}&supplier_id=${job.supplier_id ?? ""}`}>
                  <PlusIcon className="size-4 mr-1" />
                  Log Another
                </Link>
              </Button>
              <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
                <Trash2 className="size-4 mr-1" />
                Deactivate
              </Button>
            </div>

            {/* ── History Timeline ──────────────────────────────────── */}
            <div className="rounded-lg border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b flex items-center gap-2">
                <History className="size-4 text-muted-foreground" />
                <h3 className="font-semibold text-sm">Activity History</h3>
              </div>

              <div>
                {historyLoading ? (
                  <div className="space-y-2 p-4">
                    {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                  </div>
                ) : historyEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No history recorded yet.</p>
                ) : (
                  <>
                    <div className="divide-y max-h-96 overflow-y-auto">
                      {historyEntries.map((h) => {
                        const isCreated = h.change_type === "created";
                        const isQtyChange = h.field_name === "qty_produced";
                        const isHoursChange = h.field_name === "hours_worked";
                        const isWorkerChange = h.field_name === "worker_name";
                        const isDateChange = h.field_name === "work_date";
                        const dateStr = h.changed_at
                          ? new Date(h.changed_at).toLocaleString("en-IN", {
                              day: "2-digit", month: "short", year: "2-digit",
                              hour: "2-digit", minute: "2-digit", hour12: true,
                            })
                          : "—";

                        let icon = <BarChart2 className="size-3.5 text-muted-foreground" />;
                        let accentColor = "border-l-gray-200";
                        let summary = "";

                        if (isCreated) {
                          icon = <CheckCircle className="size-3.5 text-success" />;
                          accentColor = "border-l-emerald-400";
                          summary = "Job card created";
                        } else if (isQtyChange) {
                          icon = <Package className="size-3.5 text-primary" />;
                          accentColor = "border-l-blue-400";
                          const d = h.new_value && h.old_value
                            ? parseFloat(h.new_value) - parseFloat(h.old_value)
                            : null;
                          summary = `Qty produced: ${h.old_value ?? "—"} → ${h.new_value ?? "—"}${d !== null ? ` (${d >= 0 ? "+" : ""}${d})` : ""}`;
                        } else if (isHoursChange) {
                          icon = <Clock className="size-3.5 text-purple-500" />;
                          accentColor = "border-l-purple-400";
                          const d = h.new_value && h.old_value
                            ? parseFloat(h.new_value) - parseFloat(h.old_value)
                            : null;
                          summary = `Hours worked: ${h.old_value ?? "—"} → ${h.new_value ?? "—"}${d !== null ? ` (${d >= 0 ? "+" : ""}${d.toFixed(1)} h)` : ""}`;
                        } else if (isWorkerChange) {
                          icon = <User className="size-3.5 text-warning" />;
                          accentColor = "border-l-amber-400";
                          summary = `Worker: ${h.old_value ?? "—"} → ${h.new_value ?? "—"}`;
                        } else if (isDateChange) {
                          icon = <CalendarDays className="size-3.5 text-teal-500" />;
                          accentColor = "border-l-teal-400";
                          summary = `Work date: ${h.old_value ?? "—"} → ${h.new_value ?? "—"}`;
                        } else if (h.field_name) {
                          summary = `${h.field_name.replace(/_/g, " ")}: ${h.old_value ?? "—"} → ${h.new_value ?? "—"}`;
                        } else if (h.change_type === "deleted") {
                          icon = <Trash2 className="size-3.5 text-destructive" />;
                          accentColor = "border-l-red-400";
                          summary = "Deactivated";
                        }

                        return (
                          <div key={h.id} className={`p-3 border-l-4 ${accentColor} text-xs`}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-1.5 font-medium">
                                {icon}
                                <span>{summary}</span>
                              </div>
                              <span className="text-muted-foreground whitespace-nowrap shrink-0">{dateStr}</span>
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
                    </div>
                  </>
                )}
              </div>

              {(historyPage > 1 || historyHasMore) && (
                <div className="flex items-center justify-between p-3 border-t">
                  <Button size="sm" variant="outline"
                    disabled={historyPage <= 1 || historyLoading}
                    onClick={() => changeHistoryPage(historyPage - 1)}>
                    ← Prev
                  </Button>
                  <span className="text-sm text-muted-foreground">Page {historyPage}</span>
                  <Button size="sm" variant="outline"
                    disabled={!historyHasMore || historyLoading}
                    onClick={() => changeHistoryPage(historyPage + 1)}>
                    Next →
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Delete Dialog ───────────────────────────────────────────── */}
      <AlertDialog open={showDeleteDialog} onOpenChange={(o) => !o && setShowDeleteDialog(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate job card?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark job card <strong>{job?.card_number}</strong> as inactive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deactivating…" : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
