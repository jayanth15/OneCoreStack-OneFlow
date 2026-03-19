"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
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
import { getCurrentUser, isWorker, isAdminOrAbove } from "@/lib/user";
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

interface JobCardData {
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



// ── Component ─────────────────────────────────────────────────────────────────

export default function EditJobCardPage() {
  const router = useRouter();
  const { id, jobId } = useParams<{ id: string; jobId: string }>();

  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [cardNumber, setCardNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [processName, setProcessName] = useState("");
  const [toolDie, setToolDie] = useState("");
  const [machine, setMachine] = useState("");
  const [worker, setWorker] = useState("");
  const [workerLocked, setWorkerLocked] = useState(false);
  const [dateLocked, setDateLocked] = useState(false);
  const [hoursWorked, setHoursWorked] = useState("0");
  const [qtyProduced, setQtyProduced] = useState("0");
  const [workDate, setWorkDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !jobId) return;
    Promise.all([
      apiFetchJson<OrderInfo>(`/api/v1/production/orders/${id}`),
      apiFetchJson<JobCardData>(`/api/v1/production/jobs/${jobId}`),
      apiFetchJson<WorkerOption[]>("/api/v1/production/workers"),
    ])
      .then(([o, jc, w]) => {
        setOrder(o);
        setWorkers(w);
        setCardNumber(jc.card_number);
        setProcessName(jc.process_name);
        setToolDie(jc.tool_die_number ?? "");
        setMachine(jc.machine_name ?? "");
        // If worker role, lock to their username; otherwise use saved value
        const me = getCurrentUser();
        if (me && isWorker()) {
          setWorker(me.username);
          setWorkerLocked(true);
        } else {
          setWorker(jc.worker_name ?? "");
        }
        setHoursWorked(String(jc.hours_worked));
        setQtyProduced(String(jc.qty_produced));
        // Lock date for non-admins — always today on edit too
        if (!isAdminOrAbove()) {
          setDateLocked(true);
          setWorkDate(new Date().toISOString().split("T")[0]);
        } else {
          setWorkDate(jc.work_date ?? "");
        }
        setNotes(jc.notes ?? "");
        setIsActive(jc.is_active);
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "Not found"))
      .finally(() => setLoading(false));
  }, [id, jobId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!processName.trim()) { setSaveError("Process is required"); return; }
    setSaving(true);
    setSaveError(null);
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
        is_active: isActive,
      };
      await apiFetchJson(`/api/v1/production/jobs/${jobId}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      router.push(`/dashboard/production/processing/${id}`);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
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
            <BreadcrumbItem>
              <BreadcrumbPage>{loading ? "Edit…" : `Edit ${cardNumber}`}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="p-4 md:p-8 max-w-lg mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">Edit Job Card</h1>
          {!loading && cardNumber && (
            <p className="text-sm text-muted-foreground mt-1">
              Editing <span className="font-mono font-medium">{cardNumber}</span>
            </p>
          )}
        </div>

        {loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : loading ? (
          <div className="space-y-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
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
                  {/* Keep current value even if not in plan's processes */}
                  {!order.processes.some((p) => p.name === processName) && processName && (
                    <option value={processName}>{processName} (custom)</option>
                  )}
                </select>
              ) : (
                <Input id="process" value={processName}
                  onChange={(e) => setProcessName(e.target.value)} disabled={saving} />
              )}
            </div>

            {/* Tool & Die + Machine */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="tool_die">Tool & Die #</Label>
                <Input id="tool_die" value={toolDie}
                  onChange={(e) => setToolDie(e.target.value)} disabled={saving} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="machine">Machine Name</Label>
                <Input id="machine" value={machine}
                  onChange={(e) => setMachine(e.target.value)} disabled={saving} />
              </div>
            </div>

            {/* Worker */}
            <div className="space-y-1.5">
              <Label htmlFor="worker">Worker Name</Label>
              <select id="worker" value={worker}
                onChange={(e) => setWorker(e.target.value)} disabled={saving || workerLocked}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
                <option value="">— Select worker —</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.username}>{w.username}</option>
                ))}
                {worker && !workers.some((w) => w.username === worker) && (
                  <option value={worker}>{worker} (current)</option>
                )}
              </select>
              {workerLocked && (
                <p className="text-xs text-muted-foreground">Auto-assigned to your account.</p>
              )}
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
                Qty Pending is auto-computed: {order.planned_qty} (planned) − qty produced
              </p>
            )}

            {/* Work Date */}
            <div className="space-y-1.5">
              <Label htmlFor="work_date">Work Date</Label>
              <Input id="work_date" type="date" value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
                disabled={saving || dateLocked}
                readOnly={dateLocked} />
              {dateLocked && (
                <p className="text-xs text-muted-foreground">Date is locked to today. Only admins can change it.</p>
              )}
            </div>

            {/* Active */}
            <div className="space-y-1.5">
              <Label htmlFor="is_active">Active</Label>
              <select id="is_active" value={isActive ? "true" : "false"}
                onChange={(e) => setIsActive(e.target.value === "true")} disabled={saving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <textarea id="notes" rows={2} value={notes}
                onChange={(e) => setNotes(e.target.value)} disabled={saving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 resize-none" />
            </div>

            {saveError && <p className="text-sm text-destructive">{saveError}</p>}

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={saving} className="flex-1 sm:flex-none">
                {saving ? "Saving…" : "Save Changes"}
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
