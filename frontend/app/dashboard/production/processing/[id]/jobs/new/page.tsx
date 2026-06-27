"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetchJson } from "@/lib/api";
import { getCurrentUser, isWorker, isAdminOrAbove } from "@/lib/user";
import { ArrowLeft } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProcessItem { id: number; name: string; sequence: number; estimated_time_minutes: number | null; }
interface OrderInfo {
  id: number;
  order_number: string;
  processes: ProcessItem[];
  planned_qty: number | null;
}
interface SupplierOption { id: number; name: string; }

// ── Inner ─────────────────────────────────────────────────────────────────────

function NewJobCardInner() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const preSelectedProcess = searchParams.get("process") ?? "";
  const prefillWorker = searchParams.get("worker") ?? "";
  const prefillToolDie = searchParams.get("tool_die") ?? "";
  const prefillMachine = searchParams.get("machine") ?? "";
  const prefillJobType = (searchParams.get("job_type") ?? "internal") as "internal" | "supplier";
  const prefillSupplierId = searchParams.get("supplier_id") ?? "";

  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [processName, setProcessName] = useState(preSelectedProcess);
  const [toolDie, setToolDie] = useState(prefillToolDie);
  const [machine, setMachine] = useState(prefillMachine);
  const [selectedWorkers, setSelectedWorkers] = useState<{id: number; username: string}[]>([]);
  const [workerSearch, setWorkerSearch] = useState("");
  const [workerResults, setWorkerResults] = useState<{id: number; username: string}[]>([]);
  const [workerBusy, setWorkerBusy] = useState(false);
  const [jobType, setJobType] = useState<"internal" | "supplier">(prefillJobType);
  const [supplierId, setSupplierId] = useState<string>(prefillSupplierId);
  const [hoursWorked, setHoursWorked] = useState("0");
  const [workDate, setWorkDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [dateLocked, setDateLocked] = useState(false);
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      apiFetchJson<OrderInfo>(`/api/v1/production/orders/${id}`),
      apiFetchJson<SupplierOption[]>("/api/v1/suppliers/names"),
    ])
      .then(([o, s]) => {
        setOrder(o);
        setSuppliers(s);
        if (!processName && o.processes.length > 0) {
          setProcessName(o.processes[0].name);
        }
        // Pre-fill the worker for worker-role users
        const me = getCurrentUser();
        if (me && isWorker()) {
          setSelectedWorkers([{ id: me.id, username: me.username }]);
        }
        // Lock date for non-admins — always today
        if (!isAdminOrAbove()) {
          setDateLocked(true);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Debounced worker search
  useEffect(() => {
    if (!workerSearch.trim()) { setWorkerResults([]); setWorkerBusy(false); return; }
    const timer = setTimeout(() => {
      setWorkerBusy(true);
      apiFetchJson<{id: number; username: string}[]>(`/api/v1/production/workers?search=${encodeURIComponent(workerSearch.trim())}`)
        .then((r) => setWorkerResults(r))
        .catch(() => setWorkerResults([]))
        .finally(() => setWorkerBusy(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [workerSearch]);

  // Auto-compute qty_produced from hours_worked and process estimated time
  const selectedProcess = order?.processes.find((p) => p.name === processName) ?? null;
  const estimatedTimeMinutes = selectedProcess?.estimated_time_minutes ?? null;
  const computedQty = estimatedTimeMinutes && parseFloat(hoursWorked) > 0
    ? ((parseFloat(hoursWorked) * 60) / estimatedTimeMinutes).toFixed(2)
    : "0";

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!processName.trim()) { setError("Select a process"); return; }
    if (jobType === "internal" && selectedWorkers.length === 0) { setError("Select at least one worker"); return; }
    setSaving(true);
    setError(null);
    try {
      const workerNames = selectedWorkers.map((w) => w.username);
      const body = {
        process_name: processName.trim(),
        tool_die_number: toolDie || null,
        machine_name: machine || null,
        worker_name: workerNames[0] ?? null,
        worker_names: workerNames,
        hours_worked: parseFloat(hoursWorked) || 0,
        qty_produced: parseFloat(computedQty) || 0,
        work_date: workDate || null,
        notes: notes || null,
        job_type: jobType,
        supplier_id: jobType === "supplier" && supplierId ? parseInt(supplierId) : null,
        supplier_name: jobType === "supplier" && supplierId
          ? (suppliers.find(s => s.id === parseInt(supplierId))?.name ?? null)
          : null,
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
      <PageHeader
        title="New Job Card"
        description="Track workers' production for a specific process step."
        breadcrumbs={[
          { label: "Production", href: "/dashboard/production" },
          { label: "Processing", href: "/dashboard/production/processing" },
          { label: order?.order_number ?? "Order", href: backUrl },
          { label: "New Job Card" },
        ]}
        actions={
          <Link href={backUrl} className="p-1.5 rounded-md hover:bg-muted transition-colors" aria-label="Back">
            <ArrowLeft className="size-4" />
          </Link>
        }
      />

      <div className="p-4 md:p-8 max-w-lg mx-auto">
        {loading ? (
          <div className="space-y-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : (
          <form onSubmit={handleSave} className="space-y-5">
            {/* Job Type */}
            <div className="space-y-1.5">
              <Label>Job Type</Label>
              <div className="flex rounded-md border border-input overflow-hidden">
                <button type="button"
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    jobType === "internal" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                  onClick={() => setJobType("internal")} disabled={saving}>
                  Internal
                </button>
                <button type="button"
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    jobType === "supplier" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                  onClick={() => setJobType("supplier")} disabled={saving}>
                  Supplier
                </button>
              </div>
            </div>

            {/* Supplier picker (only when supplier type) */}
            {jobType === "supplier" && (
              <div className="space-y-1.5">
                <Label htmlFor="supplier">Supplier <span className="text-destructive">*</span></Label>
                <select id="supplier" value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)} disabled={saving}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
                  <option value="">— Select supplier —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}

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
              {(() => {
                const selected = order?.processes.find((p) => p.name === processName);
                return selected?.estimated_time_minutes != null ? (
                  <p className="text-xs text-muted-foreground mt-1">
                    Estimated time: {selected.estimated_time_minutes} minutes
                  </p>
                ) : null;
              })()}
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

            {/* Workers — multi-select with search (only for internal jobs) */}
            {jobType === "internal" && (
              <div className="space-y-1.5">
                <Label>Worker(s) <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Input
                    value={workerSearch}
                    onChange={(e) => setWorkerSearch(e.target.value)}
                    disabled={saving}
                    placeholder="Search worker name…"
                  />
                  {workerSearch.trim() && (
                    <div className="absolute top-full mt-1 left-0 right-0 z-50 rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
                      {workerBusy ? (
                        <p className="px-3 py-2 text-sm text-muted-foreground">Searching…</p>
                      ) : workerResults.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-muted-foreground">No workers found</p>
                      ) : (
                        workerResults
                          .filter((w) => !selectedWorkers.some((s) => s.id === w.id))
                          .map((w) => (
                            <button
                              key={w.id}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                              onMouseDown={(e) => { e.preventDefault(); setSelectedWorkers((prev) => [...prev, w]); setWorkerSearch(""); setWorkerResults([]); }}
                            >
                              {w.username}
                            </button>
                          ))
                      )}
                    </div>
                  )}
                </div>
                {selectedWorkers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {selectedWorkers.map((w) => (
                      <span key={w.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                        {w.username}
                        <button type="button" className="size-3.5 flex items-center justify-center rounded-full hover:bg-primary/20"
                          onClick={() => setSelectedWorkers((prev) => prev.filter((s) => s.id !== w.id))}>
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Search and select worker names from the list.
                </p>
              </div>
            )}

            {/* Hours Worked — qty produced is auto-computed */}
            <div className="space-y-1.5">
              <Label htmlFor="hours">Hours Worked <span className="text-destructive">*</span></Label>
              <Input id="hours" type="number" step="0.1" value={hoursWorked}
                onChange={(e) => setHoursWorked(e.target.value)} disabled={saving} />
              {estimatedTimeMinutes && parseFloat(hoursWorked) > 0 && (
                <p className="text-xs text-muted-foreground">
                  {computedQty} units produced ({hoursWorked}h × 60 ÷ {estimatedTimeMinutes} min/unit)
                </p>
              )}
              {estimatedTimeMinutes == null && (
                <p className="text-xs text-amber-600">
                  No estimated time set for this process. Qty produced will be 0.
                </p>
              )}
            </div>

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


