"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
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

interface JobCardData {
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function EditJobCardPage() {
  const router = useRouter();
  const { id, jobId } = useParams<{ id: string; jobId: string }>();

  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [cardNumber, setCardNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [processName, setProcessName] = useState("");
  const [toolDie, setToolDie] = useState("");
  const [machine, setMachine] = useState("");
  const [selectedWorkers, setSelectedWorkers] = useState<{id: number; username: string}[]>([]);
  const [workerSearch, setWorkerSearch] = useState("");
  const [workerResults, setWorkerResults] = useState<{id: number; username: string}[]>([]);
  const [workerBusy, setWorkerBusy] = useState(false);
  const [dateLocked, setDateLocked] = useState(false);
  const [jobType, setJobType] = useState<"internal" | "supplier">("internal");
  const [supplierId, setSupplierId] = useState<string>("");
  const [hoursWorked, setHoursWorked] = useState("0");
  const [actualQty, setActualQty] = useState("0");
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
      apiFetchJson<SupplierOption[]>("/api/v1/suppliers/names"),
    ])
      .then(([o, jc, s]) => {
        setOrder(o);
        setSuppliers(s);
        setCardNumber(jc.card_number);
        setProcessName(jc.process_name);
        setToolDie(jc.tool_die_number ?? "");
        setMachine(jc.machine_name ?? "");
        setJobType((jc.job_type ?? "internal") as "internal" | "supplier");
        setSupplierId(jc.supplier_id ? String(jc.supplier_id) : "");
        // Pre-fill with current user's username for worker-role users; otherwise restore saved
        const me = getCurrentUser();
        if (me && isWorker()) {
          setSelectedWorkers([{ id: me.id, username: me.username }]);
        } else {
          const saved = jc.worker_names?.length
            ? jc.worker_names
            : jc.worker_name ? [jc.worker_name] : [];
          // Try to resolve IDs from usernames
          if (saved.length > 0) {
            apiFetchJson<{id: number; username: string}[]>(`/api/v1/production/workers`)
              .then((workers) => {
                const matched = workers.filter((w) => saved.includes(w.username));
                setSelectedWorkers(matched);
              })
              .catch(() => setSelectedWorkers(saved.map((n: string) => ({ id: 0, username: n }))));
          }
        }
        setHoursWorked(String(jc.hours_worked));
        setActualQty(String(jc.actual_qty ?? 0));
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

  // Auto-compute qty_produced from hours_worked and process estimated time
  const selectedProcess = order?.processes.find((p) => p.name === processName) ?? null;
  const estimatedTimeMinutes = selectedProcess?.estimated_time_minutes ?? null;
  const computedQty = estimatedTimeMinutes && parseFloat(hoursWorked) > 0
    ? ((parseFloat(hoursWorked) * 60) / estimatedTimeMinutes).toFixed(2)
    : "0";

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

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (jobType === "internal" && selectedWorkers.length === 0) { setSaveError("Select at least one worker"); return; }
    setSaving(true);
    setSaveError(null);
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
        actual_qty: parseFloat(actualQty) || 0,
        work_date: workDate || null,
        notes: notes || null,
        is_active: isActive,
        job_type: jobType,
        supplier_id: jobType === "supplier" && supplierId ? parseInt(supplierId) : null,
        supplier_name: jobType === "supplier" && supplierId
          ? (suppliers.find(s => s.id === parseInt(supplierId))?.name ?? null)
          : null,
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
      <PageHeader
        title="Edit Job Card"
        description={!loading && cardNumber ? `Editing ${cardNumber}` : undefined}
        breadcrumbs={[
          { label: "Production", href: "/dashboard/production" },
          { label: "Processing", href: "/dashboard/production/processing" },
          { label: order?.order_number ?? "Order", href: backUrl },
          { label: loading ? "Edit…" : `Edit ${cardNumber}` },
        ]}
        actions={
          <Link href={backUrl} className="p-1.5 rounded-md hover:bg-muted transition-colors" aria-label="Back">
            <ArrowLeft className="size-4" />
          </Link>
        }
      />

      <div className="p-4 md:p-8 max-w-lg mx-auto">
        {loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : loading ? (
          <div className="space-y-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
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

            {/* Supplier picker */}
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
            {order?.planned_qty != null && (
              <p className="text-xs text-muted-foreground">
                Qty Pending is auto-computed: {order.planned_qty} (planned) − qty produced
              </p>
            )}

            {/* Actual Qty */}
            <div className="space-y-1.5">
              <Label htmlFor="actual_qty">Actual Produced <span className="text-destructive">*</span></Label>
              <Input id="actual_qty" type="number" step="any" value={actualQty}
                onChange={(e) => setActualQty(e.target.value)} disabled={saving} />
              {parseFloat(computedQty) > 0 && parseFloat(actualQty) > 0 && (
                <p className={`text-xs ${parseFloat(actualQty) >= parseFloat(computedQty) ? "text-success" : "text-amber-600"}`}>
                  {parseFloat(actualQty) >= parseFloat(computedQty)
                    ? "Met or exceeded estimated qty"
                    : `${((parseFloat(computedQty) - parseFloat(actualQty)) / parseFloat(computedQty) * 100).toFixed(0)}% less than estimated`}
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
