"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetchJson } from "@/lib/api";
import {
  ArrowLeft, PlusIcon, Pencil,
  Clock, User, Package,
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
  actual_qty: number;
  work_date: string | null;
  notes: string | null;
  status: string;
  is_active: boolean;
  job_type: string;
  supplier_id: number | null;
  supplier_name: string | null;
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
  effective_qty: number;
  fg_credited: number;
  processes: ProcessItem[];
  job_cards: JobCard[];
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

// ── Inner ─────────────────────────────────────────────────────────────────────

function JobCardsListInner() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<ProductionOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    apiFetchJson<ProductionOrder>(`/api/v1/production/orders/${id}`)
      .then((o) => setOrder(o))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Not found"))
      .finally(() => setLoading(false));
  }, [id]);

  // Group job cards by process_name
  const jobsByProcess = order
    ? order.processes.map((proc) => ({
        process: proc,
        cards: order.job_cards.filter((jc) => jc.process_name === proc.name),
      }))
    : [];

  // Orphaned cards (process not in plan)
  const orphanedCards = order
    ? order.job_cards.filter((jc) => !order.processes.some((p) => p.name === jc.process_name))
    : [];

  // Processes that have no job card yet
  const processesWithoutCards = order
    ? order.processes
        .filter((p) => !order.job_cards.some((jc) => jc.process_name === p.name))
        .map((p) => p.name)
    : [];

  // Worker Activity — aggregate across all job cards
  const workerActivity = order?.job_cards.length
    ? (() => {
        const byWorker: Record<string, { hours: number; produced: number; cards: number; dates: Set<string> }> = {};
        order.job_cards.forEach((jc) => {
          if (jc.job_type === "supplier") return;
          const workers = jc.worker_names?.length ? jc.worker_names : (jc.worker_name ? [jc.worker_name] : ["Unassigned"]);
          workers.forEach((w) => {
            if (!byWorker[w]) byWorker[w] = { hours: 0, produced: 0, cards: 0, dates: new Set() };
            byWorker[w].hours    += jc.hours_worked / workers.length;
            byWorker[w].produced += jc.actual_qty / workers.length;
            byWorker[w].cards    += 1;
            if (jc.work_date) byWorker[w].dates.add(jc.work_date);
          });
        });
        return Object.entries(byWorker);
      })()
    : [];

  return (
    <>
      <PageHeader
        title={loading ? "Loading…" : order?.order_number ?? "Not found"}
        description="Job Cards"
        breadcrumbs={[
          { label: "Production", href: "/dashboard/production" },
          { label: "Processing", href: "/dashboard/production/processing" },
          { label: loading ? "Loading…" : order?.order_number ?? "Not found", href: `/dashboard/production/processing/${id}` },
          { label: "Job Cards" },
        ]}
        actions={
          <Link href={`/dashboard/production/processing/${id}`}
            className="p-1.5 rounded-md hover:bg-muted transition-colors" aria-label="Back">
            <ArrowLeft className="size-4" />
          </Link>
        }
      />

      <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : !order ? (
          <p className="text-muted-foreground py-10 text-center">Production order not found.</p>
        ) : (
          <>
            {/* ── Add Job Card ──────────────────────────────────────────── */}
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
              <div className="space-y-6">
                {jobsByProcess.map(({ process, cards }) => {
                  const processActual = cards
                    .filter(jc => jc.is_active)
                    .reduce((s, jc) => s + jc.actual_qty, 0);
                  const processEstimated = cards
                    .filter(jc => jc.is_active)
                    .reduce((s, jc) => s + jc.qty_produced, 0);
                  const displayActual = processActual > 0 ? processActual : processEstimated;
                  const processPlanned = order.planned_qty ?? 0;
                  const processPending = Math.max(0, processPlanned - processActual);
                  const processPct = processPlanned > 0 ? Math.min(100, Math.round((displayActual / processPlanned) * 100)) : 0;
                  return (
                    <div key={process.id} className="rounded-lg border overflow-hidden">
                      {/* Process header */}
                      <div className="bg-muted/40 px-4 py-3 flex items-center justify-between gap-3">
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
                                  {displayActual} / {processPlanned} ({processPct}%)
                                </span>
                              )}
                              {processActual > 0 && (
                                <span className={`text-[10px] font-medium ${processActual >= processEstimated ? "text-success" : "text-amber-600"}`}>
                                  Actual {processActual >= processEstimated ? "≥" : "<"} Est ({processActual} vs {processEstimated})
                                </span>
                              )}
                            </div>
                            {processPlanned > 0 && (
                              <div className="mt-1.5 h-1.5 w-full max-w-[200px] rounded-full bg-background/60 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    processPct >= 100
                                      ? "bg-success"
                                      : processPct >= 50
                                        ? "bg-primary"
                                        : "bg-warning"
                                  }`}
                                  style={{ width: `${processPct}%` }}
                                />
                              </div>
                            )}
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
                                  <span className="text-[11px] text-warning font-medium">
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
                          Add Card
                        </Button>
                      </div>

                      {/* Job cards table */}
                      {cards.length === 0 ? (
                        <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                          No job card yet for this process.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Card #</TableHead>
                                <TableHead>Worker / Supplier</TableHead>
                                <TableHead>Machine</TableHead>
                                <TableHead>Tool & Die</TableHead>
                                <TableHead className="text-right">Est Qty</TableHead>
                                <TableHead className="text-right">Actual</TableHead>
                                <TableHead className="text-right">Est vs Act</TableHead>
                                <TableHead className="text-right">Hours</TableHead>
                                <TableHead className="text-right">Pending</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {cards.map((jc) => (
                                <TableRow key={jc.id}>
                                  <TableCell className="font-mono font-medium text-xs">{jc.card_number}</TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-1">
                                      <User className="size-3 text-muted-foreground shrink-0" />
                                      <span className="text-xs">
                                        {jc.job_type === "supplier"
                                          ? (jc.supplier_name ?? "—")
                                          : (jc.worker_names?.length
                                              ? jc.worker_names.join(", ")
                                              : (jc.worker_name ?? "—"))}
                                      </span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-xs">{jc.machine_name ?? "—"}</TableCell>
                                  <TableCell className="text-xs">{jc.tool_die_number ?? "—"}</TableCell>
                                  <TableCell className="text-right text-xs tabular-nums">{jc.qty_produced}</TableCell>
                                  <TableCell className="text-right text-xs tabular-nums font-medium">{jc.actual_qty}</TableCell>
                                  <TableCell className="text-right text-xs tabular-nums">
                                    {jc.actual_qty > 0 && jc.qty_produced > 0 ? (
                                      <span className={jc.actual_qty >= jc.qty_produced ? "text-success" : "text-amber-600"}>
                                        {jc.actual_qty >= jc.qty_produced ? "≥" : "<"}
                                      </span>
                                    ) : <span className="text-muted-foreground">—</span>}
                                  </TableCell>
                                  <TableCell className="text-right text-xs tabular-nums">{jc.hours_worked}</TableCell>
                                  <TableCell className="text-right text-xs tabular-nums text-warning">{jc.qty_pending}</TableCell>
                                  <TableCell>
                                    <Badge variant={STATUS_BADGE[jc.status] ?? "outline"}
                                      className={`text-[10px] ${STATUS_COLOR[jc.status] ?? ""}`}>
                                      {STATUS_LABELS[jc.status] ?? jc.status}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button variant="ghost" size="icon" className="size-7"
                                      onClick={() => router.push(`/dashboard/production/processing/${order.id}/jobs/${jc.id}/edit`)}
                                      title="Edit">
                                      <Pencil className="size-3" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Orphaned job cards */}
                {orphanedCards.length > 0 && (
                  <div className="rounded-lg border overflow-hidden">
                    <div className="bg-muted/40 px-4 py-2.5">
                      <span className="font-medium text-sm text-muted-foreground">Other Job Cards</span>
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Card #</TableHead>
                            <TableHead>Process</TableHead>
                            <TableHead>Worker</TableHead>
                            <TableHead className="text-right">Est Qty</TableHead>
                            <TableHead className="text-right">Actual</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {orphanedCards.map((jc) => (
                            <TableRow key={jc.id}>
                              <TableCell className="font-mono font-medium text-xs">{jc.card_number}</TableCell>
                              <TableCell className="text-xs">{jc.process_name}</TableCell>
                              <TableCell className="text-xs">
                                {jc.job_type === "supplier" ? (jc.supplier_name ?? "—") : (jc.worker_names?.length ? jc.worker_names.join(", ") : (jc.worker_name ?? "—"))}
                              </TableCell>
                              <TableCell className="text-right text-xs tabular-nums">{jc.qty_produced}</TableCell>
                              <TableCell className="text-right text-xs tabular-nums font-medium">{jc.actual_qty}</TableCell>
                              <TableCell>
                                <Badge variant={STATUS_BADGE[jc.status] ?? "outline"}
                                  className={`text-[10px] ${STATUS_COLOR[jc.status] ?? ""}`}>
                                  {STATUS_LABELS[jc.status] ?? jc.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button variant="ghost" size="icon" className="size-7"
                                  onClick={() => router.push(`/dashboard/production/processing/${order.id}/jobs/${jc.id}/edit`)}
                                  title="Edit">
                                  <Pencil className="size-3" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Processes without cards */}
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
            )}

            {/* ── Worker Activity ────────────────────────────────────────────── */}
            {workerActivity.length > 0 && (
              <div className="rounded-lg border overflow-hidden">
                <div className="bg-muted/40 px-4 py-2.5 flex items-center gap-2">
                  <User className="size-4 text-muted-foreground" />
                  <span className="font-medium text-sm">Worker Activity</span>
                  <span className="text-xs text-muted-foreground">— across all job cards</span>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Worker</TableHead>
                        <TableHead className="text-right">Hours</TableHead>
                        <TableHead className="text-right">Produced</TableHead>
                        <TableHead className="text-right">Cards</TableHead>
                        <TableHead>Days</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workerActivity.map(([name, stats]) => (
                        <TableRow key={name}>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0 text-xs">
                                {name.charAt(0).toUpperCase()}
                              </div>
                              <span className="font-medium text-sm">{name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-xs tabular-nums font-mono text-purple-700">{stats.hours.toFixed(1)}h</TableCell>
                          <TableCell className="text-right text-xs tabular-nums font-mono text-success">{stats.produced.toFixed(1)}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{stats.cards}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{stats.dates.size} day{stats.dates.size !== 1 ? "s" : ""}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

// ── Page export ────────────────────────────────────────────────────────────────

export default function JobCardsListPage() {
  return (
    <Suspense fallback={
      <div className="p-6 space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-48 w-full" /></div>
    }>
      <JobCardsListInner />
    </Suspense>
  );
}
