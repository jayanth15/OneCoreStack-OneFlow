"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetchJson } from "@/lib/api";
import {
  ArrowLeft, PlusIcon, Pencil,
  Factory, Clock, User, Wrench, Hash, Package,
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
                            {processPlanned > 0 && (
                              <div className="mt-1.5 h-1.5 w-full rounded-full bg-background/60 overflow-hidden">
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

                      {/* Job cards for this process */}
                      {cards.length === 0 ? (
                        <div className="px-4 py-4 text-center text-xs text-muted-foreground">
                          No job card yet for this process.
                        </div>
                      ) : (
                        <div className="divide-y">
                          {cards.map((jc) => (
                            <Link key={jc.id}
                              href={`/dashboard/production/processing/${order.id}/jobs/${jc.id}`}
                              className="px-4 py-3 flex items-center gap-4 hover:bg-muted/20 transition-colors group">
                              <div className="flex-1 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                                <div>
                                  <span className="text-muted-foreground block">Card #</span>
                                  <span className="font-mono font-medium group-hover:text-primary transition-colors">{jc.card_number}</span>
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
                                    <span className="text-muted-foreground block">Est Qty</span>
                                    <span className="font-mono font-medium text-success">{jc.qty_produced}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground block">Pending</span>
                                    <span className="font-mono font-medium text-warning">{jc.qty_pending}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground block">Actual</span>
                                    <span className="font-mono font-medium">{jc.actual_qty}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground block">Hours</span>
                                    <span className="font-mono font-medium">{jc.hours_worked}</span>
                                  </div>
                                </div>
                              </div>

                              <Badge variant={STATUS_BADGE[jc.status] ?? "outline"}
                                className={`text-xs shrink-0 ${STATUS_COLOR[jc.status] ?? ""}`}>
                                {STATUS_LABELS[jc.status] ?? jc.status}
                              </Badge>
                            </Link>
                          ))}
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
                    <div className="divide-y">
                      {orphanedCards.map((jc) => (
                        <Link key={jc.id}
                          href={`/dashboard/production/processing/${order.id}/jobs/${jc.id}`}
                          className="px-4 py-3 flex items-center justify-between text-xs hover:bg-muted/20 transition-colors group">
                          <div>
                            <span className="font-mono font-medium group-hover:text-primary transition-colors">{jc.card_number}</span>{" "}
                            <span className="text-muted-foreground">— {jc.process_name}</span>{" "}
                            <span className="text-muted-foreground">by {jc.job_type === "supplier" ? (jc.supplier_name ?? "—") : (jc.worker_names?.length ? jc.worker_names.join(", ") : (jc.worker_name ?? "—"))}</span>
                          </div>
                          <Badge variant={STATUS_BADGE[jc.status] ?? "outline"}
                            className={`text-xs ${STATUS_COLOR[jc.status] ?? ""}`}>
                            {STATUS_LABELS[jc.status] ?? jc.status}
                          </Badge>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
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
