"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList,
  BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetchJson } from "@/lib/api";
import { ArrowLeft } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProcessItem { id: number; name: string; sequence: number; }
interface OrderInfo {
  id: number;
  order_number: string;
  processes: ProcessItem[];
  planned_qty: number | null;
}
interface WorkerOption { id: number; username: string; }

// ── Inner ─────────────────────────────────────────────────────────────────────

function NewJobCardInner() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const preSelectedProcess = searchParams.get("process") ?? "";

  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [processName, setProcessName] = useState(preSelectedProcess);
  const [toolDie, setToolDie] = useState("");
  const [machine, setMachine] = useState("");
  const [worker, setWorker] = useState("");
  const [hoursWorked, setHoursWorked] = useState("0");
  const [qtyProduced, setQtyProduced] = useState("0");
  const [workDate, setWorkDate] = useState("");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      apiFetchJson<OrderInfo>(`/api/v1/production/orders/${id}`),
      apiFetchJson<WorkerOption[]>("/api/v1/production/workers"),
    ])
      .then(([o, w]) => {
        setOrder(o);
        setWorkers(w);
        if (!processName && o.processes.length > 0) {
          setProcessName(o.processes[0].name);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!processName.trim()) { setError("Select a process"); return; }
    setSaving(true);
    setError(null);
    try {
      const body = {
        process_name: processName.trim(),
        tool_die_number: toolDie || null,
        machine_name: machine || null,
        worker_name: worker || null,
        hours_worked: parseFloat(hoursWorked) || 0,
        qty_produced: parseFloat(qtyProduced) || 0,
        work_date: workDate || null,
        notes: notes || null,
      };
      await apiFetchJson(`/api/v1/production/orders/${id}/jobs`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      router.push(`/dashboard/production/processing/${id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  const backUrl = `/dashboard/production/processing/${id}`;

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4 md:px-6">
        <Link href={backUrl} className="p-1.5 rounded-md hover:bg-muted transition-colors" aria-label="Back">
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
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href={backUrl}>{order?.order_number ?? "Order"}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem><BreadcrumbPage>New Job Card</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="p-4 md:p-8 max-w-lg mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">New Job Card</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track a worker&apos;s production for a specific process step.
          </p>
        </div>

        {loading ? (
          <div className="space-y-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : (
          <form onSubmit={handleSave} className="space-y-5">
            {/* Process */}
            <div className="space-y-1.5">
              <Label htmlFor="process">Process Step <span className="text-destructive">*</span></Label>
              {order && order.processes.length > 0 ? (
                <select id="process" value={processName}
                  onChange={(e) => setProcessName(e.target.value)} disabled={saving}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
                  {order.processes.map((p) => (
                    <option key={p.id} value={p.name}>{p.sequence}. {p.name}</option>
                  ))}
                </select>
              ) : (
                <Input id="process" value={processName}
                  onChange={(e) => setProcessName(e.target.value)} disabled={saving}
                  placeholder="e.g. Blanking" />
              )}
            </div>

            {/* Tool & Die + Machine */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="tool_die">Tool & Die #</Label>
                <Input id="tool_die" placeholder="e.g. Die Set A-12" value={toolDie}
                  onChange={(e) => setToolDie(e.target.value)} disabled={saving} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="machine">Machine Name</Label>
                <Input id="machine" placeholder="e.g. Press Brake #1" value={machine}
                  onChange={(e) => setMachine(e.target.value)} disabled={saving} />
              </div>
            </div>

            {/* Worker */}
            <div className="space-y-1.5">
              <Label htmlFor="worker">Worker Name</Label>
              <select id="worker" value={worker}
                onChange={(e) => setWorker(e.target.value)} disabled={saving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
                <option value="">— Select worker —</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.username}>{w.username}</option>
                ))}
              </select>
            </div>

            {/* Qty + Hours */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="qty_produced">Qty Produced</Label>
                <Input id="qty_produced" type="number" step="any" value={qtyProduced}
                  onChange={(e) => setQtyProduced(e.target.value)} disabled={saving} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hours">Hours Worked</Label>
                <Input id="hours" type="number" step="0.1" value={hoursWorked}
                  onChange={(e) => setHoursWorked(e.target.value)} disabled={saving} />
              </div>
            </div>

            {order?.planned_qty != null && (
              <p className="text-xs text-muted-foreground">
                Qty Pending will be auto-computed: {order.planned_qty} (planned) − qty produced
              </p>
            )}

            {/* Work Date */}
            <div className="space-y-1.5">
              <Label htmlFor="work_date">Work Date</Label>
              <Input id="work_date" type="date" value={workDate}
                onChange={(e) => setWorkDate(e.target.value)} disabled={saving} />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <textarea id="notes" rows={2} placeholder="Remarks…" value={notes}
                onChange={(e) => setNotes(e.target.value)} disabled={saving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 resize-none" />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={saving} className="flex-1 sm:flex-none">
                {saving ? "Creating…" : "Create Job Card"}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.push(backUrl)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}

// ── Page export ────────────────────────────────────────────────────────────────

export default function NewJobCardPage() {
  return (
    <Suspense fallback={
      <div className="p-6 space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-48 w-full" /></div>
    }>
      <NewJobCardInner />
    </Suspense>
  );
}
