"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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
import { ArrowLeft, Info, Plus, Trash2, AlertTriangle, Package } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────────────────

interface ScheduleOption {
  id: number;
  schedule_number: string;
  customer_name: string;
  description: string;
  scheduled_date: string | null;
  scheduled_qty: number;
  backlog_qty: number;
  status: string;
}

interface PaginatedSchedules {
  items: ScheduleOption[];
}

interface PlanData {
  id: number;
  plan_number: string;
  title: string;
  schedule_id: number | null;
  planned_qty: number;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  status: string;
  is_active: boolean;
  schedule_number: string | null;
  customer_name: string | null;
  product_description: string | null;
  scheduled_qty: number | null;
  backlog_qty: number | null;
  scheduled_date: string | null;
  schedule_status: string | null;
  processes: ProcessItem[];
}

interface PlanForm {
  title: string;
  schedule_id: string;
  planned_qty: string;
  start_date: string;
  end_date: string;
  notes: string;
  status: string;
  is_active: boolean;
}

interface ProcessItem {
  id: number;
  plan_id: number;
  name: string;
  sequence: number;
  notes: string | null;
  // local editing state
  _editName?: string;
  _editNotes?: string;
}

interface MaterialRequirement {
  item_id: number;
  code: string;
  name: string;
  unit: string;
  item_type: string;
  qty_per_unit: number;
  required_qty: number;
  available_qty: number;
  to_purchase: number;
}

// ── Page ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export default function EditPlanPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [form, setForm] = useState<PlanForm>({
    title: "", schedule_id: "", planned_qty: "", start_date: "", end_date: "",
    notes: "", status: "draft", is_active: true,
  });
  const [planNumber, setPlanNumber] = useState("");
  const [schedules, setSchedules] = useState<ScheduleOption[]>([]);
  const [selectedSched, setSelectedSched] = useState<ScheduleOption | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Processes (live CRUD against API) ───────────────────────────────────────────────
  const [processes, setProcesses] = useState<ProcessItem[]>([]);
  const [processInput, setProcessInput] = useState("");
  const [procError, setProcError] = useState<string | null>(null);

  // ── Materials BOM preview ───────────────────────────────────────────────────────────────
  const [materials, setMaterials] = useState<MaterialRequirement[]>([]);
  const [matsLoading, setMatsLoading] = useState(false);
  const [matsError, setMatsError] = useState<string | null>(null);

  // Load plan + schedules
  useEffect(() => {
    if (!id) return;
    Promise.all([
      apiFetchJson<PlanData>(`/api/v1/production/plans/${id}`),
      apiFetchJson<PaginatedSchedules>("/api/v1/schedules?page_size=200&available_for_planning=true"),
    ])
      .then(([plan, schedResp]) => {
        let schedList = schedResp.items;

        // If this plan is linked to a schedule that isn't in the available list,
        // synthesise a ScheduleOption from the plan data so it still shows in the dropdown.
        if (plan.schedule_id != null && !schedList.some((s) => s.id === plan.schedule_id) && plan.schedule_number) {
          const synth: ScheduleOption = {
            id: plan.schedule_id,
            schedule_number: plan.schedule_number,
            customer_name: plan.customer_name ?? "",
            description: plan.product_description ?? "",
            scheduled_date: plan.scheduled_date ?? null,
            scheduled_qty: plan.scheduled_qty ?? 0,
            backlog_qty: plan.backlog_qty ?? 0,
            status: plan.schedule_status ?? "confirmed",
          };
          schedList = [synth, ...schedList];
        }

        setSchedules(schedList);
        setPlanNumber(plan.plan_number);
        setForm({
          title: plan.title,
          schedule_id: plan.schedule_id != null ? String(plan.schedule_id) : "",
          planned_qty: String(plan.planned_qty ?? 0),
          start_date: plan.start_date ?? "",
          end_date: plan.end_date ?? "",
          notes: plan.notes ?? "",
          status: plan.status,
          is_active: plan.is_active,
        });
        setProcesses(
          (plan.processes ?? []).map((p) => ({ ...p, _editName: p.name, _editNotes: p.notes ?? "" }))
        );
        if (plan.schedule_id != null) {
          const found = schedList.find((s) => s.id === plan.schedule_id) ?? null;
          setSelectedSched(found);
        }
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "Not found"))
      .finally(() => setLoading(false));
  }, [id]);

  // Fetch BOM preview when schedule or qty changes
  const fetchMaterials = useCallback((sched: ScheduleOption | null, qty: string) => {
    const q = parseFloat(qty);
    if (!sched || !q || q <= 0) { setMaterials([]); setMatsError(null); return; }
    setMatsLoading(true);
    setMatsError(null);
    const params = new URLSearchParams({ product_name: sched.description, planned_qty: String(q) });
    apiFetchJson<MaterialRequirement[]>(`/api/v1/production/bom-preview?${params}`)
      .then(setMaterials)
      .catch((e: unknown) => { setMaterials([]); setMatsError(e instanceof Error ? e.message : "Failed"); })
      .finally(() => setMatsLoading(false));
  }, []);

  useEffect(() => {
    fetchMaterials(selectedSched, form.planned_qty);
  }, [selectedSched, form.planned_qty, fetchMaterials]);

  function set(key: string, val: unknown) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function handleScheduleChange(sid: string) {
    set("schedule_id", sid);
    const found = sid ? schedules.find((s) => String(s.id) === sid) ?? null : null;
    setSelectedSched(found);
  }

  // ── Process CRUD helpers ───────────────────────────────────────────────────────────────────────

  async function addProcess() {
    const name = processInput.trim();
    if (!name || !id) return;
    setProcError(null);
    try {
      const seq = processes.length;
      const created = await apiFetchJson<ProcessItem>(
        `/api/v1/production/plans/${id}/processes`,
        { method: "POST", body: JSON.stringify({ name, sequence: seq, notes: null }) },
      );
      setProcesses((p) => [...p, { ...created, _editName: created.name, _editNotes: "" }]);
      setProcessInput("");
    } catch (e: unknown) {
      setProcError(e instanceof Error ? e.message : "Failed to add process");
    }
  }

  async function deleteProcess(procId: number) {
    if (!id) return;
    setProcError(null);
    try {
      await apiFetchJson(`/api/v1/production/plans/${id}/processes/${procId}`, { method: "DELETE" });
      setProcesses((p) => p.filter((x) => x.id !== procId));
    } catch (e: unknown) {
      setProcError(e instanceof Error ? e.message : "Failed to delete process");
    }
  }

  function updateLocalProcess(procId: number, field: "_editName" | "_editNotes", val: string) {
    setProcesses((p) => p.map((x) => x.id === procId ? { ...x, [field]: val } : x));
  }

  async function saveProcess(proc: ProcessItem) {
    if (!id) return;
    const name = proc._editName?.trim();
    if (!name) return;
    if (name === proc.name && (proc._editNotes ?? "") === (proc.notes ?? "")) return; // no change
    try {
      await apiFetchJson(`/api/v1/production/plans/${id}/processes/${proc.id}`, {
        method: "PUT",
        body: JSON.stringify({ name, notes: proc._editNotes?.trim() || null }),
      });
      setProcesses((p) => p.map((x) => x.id === proc.id
        ? { ...x, name, notes: proc._editNotes?.trim() || null }
        : x
      ));
    } catch {
      // silently revert
      setProcesses((p) => p.map((x) => x.id === proc.id
        ? { ...x, _editName: x.name, _editNotes: x.notes ?? "" }
        : x
      ));
    }
  }

  // ── Save plan ────────────────────────────────────────────────────────────────

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setSaveError("Title is required"); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const body = {
        title: form.title.trim(),
        schedule_id: form.schedule_id ? parseInt(form.schedule_id) : null,
        planned_qty: parseFloat(form.planned_qty) || 0,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        notes: form.notes || null,
        status: form.status,
        is_active: form.is_active,
      };
      await apiFetchJson(`/api/v1/production/plans/${id}`, { method: "PUT", body: JSON.stringify(body) });
      router.push("/dashboard/production/planning");
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const showMaterials = !!selectedSched && parseFloat(form.planned_qty) > 0;

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4 md:px-6">
        <Link href="/dashboard/production/planning" className="p-1.5 rounded-md hover:bg-muted transition-colors" aria-label="Back">
          <ArrowLeft className="size-4" />
        </Link>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href="/dashboard/production">Production</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href="/dashboard/production/planning">Planning</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>{loading ? "Edit…" : `Edit ${planNumber}`}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="p-4 md:p-8 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">Edit Production Plan</h1>
          {!loading && planNumber && (
            <p className="text-sm text-muted-foreground mt-1">
              Editing <span className="font-mono font-medium">{planNumber}</span> — {form.title}
            </p>
          )}
        </div>

        {loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : loading ? (
          <div className="space-y-5">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : (
          <form onSubmit={handleSave} className="space-y-8">

            {/* ── Schedule ───────────────────────────────────────────────────────────────────────────────── */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Schedule</h2>
              <div className="space-y-1.5">
                <Label htmlFor="schedule_id">Customer Schedule</Label>
                <select id="schedule_id" value={form.schedule_id}
                  onChange={(e) => handleScheduleChange(e.target.value)} disabled={saving}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
                  <option value="">— None —</option>
                  {schedules.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.schedule_number} · {s.customer_name} — {s.description}
                      {" "}(qty: {(s.scheduled_qty + s.backlog_qty).toLocaleString()}
                      {s.scheduled_date ? `, delivery: ${s.scheduled_date}` : ""})
                    </option>
                  ))}
                </select>
              </div>

              {selectedSched && (
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Info className="size-4 text-muted-foreground" />
                    Schedule Details
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Schedule #</p>
                      <p className="font-mono font-medium">{selectedSched.schedule_number}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Customer</p>
                      <p className="font-medium">{selectedSched.customer_name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Product</p>
                      <p>{selectedSched.description}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Scheduled Qty</p>
                      <p className="font-medium">{selectedSched.scheduled_qty.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Backlog Qty</p>
                      <p className="font-medium">{selectedSched.backlog_qty.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total to Produce</p>
                      <p className="font-medium text-primary">
                        {(selectedSched.scheduled_qty + selectedSched.backlog_qty).toLocaleString()}
                      </p>
                    </div>
                    {selectedSched.scheduled_date && (
                      <div>
                        <p className="text-xs text-muted-foreground">Delivery Date</p>
                        <p>{selectedSched.scheduled_date}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-muted-foreground">Schedule Status</p>
                      <p className="capitalize">{selectedSched.status.replace("_", " ")}</p>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* ── Plan Details ──────────────────────────────────────────────────────────────────────────────────── */}
            <section className="space-y-4">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Plan Details</h2>

              <div className="space-y-1.5">
                <Label htmlFor="title">Plan Title <span className="text-destructive">*</span></Label>
                <Input id="title" value={form.title} onChange={(e) => set("title", e.target.value)} disabled={saving} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="planned_qty">Planned Quantity</Label>
                <Input id="planned_qty" type="number" min={0} step="any"
                  value={form.planned_qty} onChange={(e) => set("planned_qty", e.target.value)} disabled={saving} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="start_date">Start Date</Label>
                  <Input id="start_date" type="date"
                    value={form.start_date} onChange={(e) => set("start_date", e.target.value)} disabled={saving} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="end_date">End Date</Label>
                  <Input id="end_date" type="date"
                    value={form.end_date} onChange={(e) => set("end_date", e.target.value)} disabled={saving} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="status">Status</Label>
                  <select id="status" value={form.status}
                    onChange={(e) => set("status", e.target.value)} disabled={saving}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
                    <option value="draft">Draft</option>
                    <option value="approved">Approved</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="is_active">Active</Label>
                  <select id="is_active" value={form.is_active ? "true" : "false"}
                    onChange={(e) => set("is_active", e.target.value === "true")} disabled={saving}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="notes">Notes</Label>
                <textarea id="notes" rows={3} value={form.notes}
                  onChange={(e) => set("notes", e.target.value)} disabled={saving}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 resize-none" />
              </div>
            </section>

            {/* ── Process Steps ───────────────────────────────────────────────────────────────────────────────────────────────── */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Process Steps</h2>
                <span className="text-xs text-muted-foreground">{processes.length} step{processes.length !== 1 ? "s" : ""}</span>
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder="Step name, e.g. Blanking, Numbering, Assembly…"
                  value={processInput}
                  onChange={(e) => setProcessInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addProcess(); } }}
                  className="flex-1"
                />
                <Button type="button" size="sm" variant="secondary"
                  onClick={() => void addProcess()} disabled={!processInput.trim()}>
                  <Plus className="size-4 mr-1" />
                  Add
                </Button>
              </div>

              {procError && <p className="text-xs text-destructive">{procError}</p>}

              {processes.length > 0 ? (
                <div className="rounded-lg border divide-y">
                  {processes.map((proc, idx) => (
                    <div key={proc.id} className="flex items-start gap-3 px-3 py-2.5">
                      <span className="mt-2 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                        {idx + 1}
                      </span>
                      <div className="flex-1 space-y-1.5">
                        <Input
                          value={proc._editName ?? proc.name}
                          onChange={(e) => updateLocalProcess(proc.id, "_editName", e.target.value)}
                          onBlur={() => void saveProcess(proc)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void saveProcess(proc); } }}
                          className="h-8 text-sm font-medium"
                        />
                        <Input
                          value={proc._editNotes ?? proc.notes ?? ""}
                          onChange={(e) => updateLocalProcess(proc.id, "_editNotes", e.target.value)}
                          onBlur={() => void saveProcess(proc)}
                          placeholder="Notes (optional)"
                          className="h-7 text-xs text-muted-foreground"
                        />
                      </div>
                      <Button
                        type="button" variant="ghost" size="icon"
                        className="mt-1 size-7 text-muted-foreground hover:text-destructive"
                        onClick={() => void deleteProcess(proc.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No process steps yet. Add steps like “Blanking”, “Numbering”, “Assembly”…
                </div>
              )}
            </section>

            {/* ── Materials Panel ───────────────────────────────────────────────────────────────────────────────────────────────── */}
            {showMaterials && (
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <Package className="size-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Material Requirements</h2>
                  <span className="text-xs text-muted-foreground">— BOM for {selectedSched!.description}</span>
                </div>

                {matsLoading ? (
                  <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Loading material requirements…</div>
                ) : matsError ? (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{matsError}</div>
                ) : materials.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-6 text-center space-y-2">
                    <p className="text-sm text-muted-foreground">
                      No BOM defined for &quot;{selectedSched!.description}&quot;.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      An admin can add raw material requirements under{" "}
                      <Link
                        href={`/dashboard/admin/bom/new?product=${encodeURIComponent(selectedSched!.description)}`}
                        className="underline hover:text-foreground font-medium"
                      >
                        Admin → Bill of Materials
                      </Link>.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/40">
                            <th className="px-3 py-2 text-left font-medium text-xs">Code</th>
                            <th className="px-3 py-2 text-left font-medium text-xs">Material</th>
                            <th className="px-3 py-2 text-left font-medium text-xs hidden sm:table-cell">Type</th>
                            <th className="px-3 py-2 text-right font-medium text-xs">Per Unit</th>
                            <th className="px-3 py-2 text-right font-medium text-xs">Required</th>
                            <th className="px-3 py-2 text-right font-medium text-xs">In Stock</th>
                            <th className="px-3 py-2 text-right font-medium text-xs">To Purchase</th>
                          </tr>
                        </thead>
                        <tbody>
                          {materials.map((m) => (
                            <tr key={m.item_id} className="border-b last:border-0 hover:bg-muted/20">
                              <td className="px-3 py-2 font-mono text-xs">{m.code}</td>
                              <td className="px-3 py-2 font-medium">{m.name}</td>
                              <td className="px-3 py-2 hidden sm:table-cell">
                                <span className="text-xs capitalize text-muted-foreground">{m.item_type.replace("_", " ")}</span>
                              </td>
                              <td className="px-3 py-2 text-right text-xs text-muted-foreground">{m.qty_per_unit} {m.unit}</td>
                              <td className="px-3 py-2 text-right font-medium">{m.required_qty.toLocaleString()} {m.unit}</td>
                              <td className="px-3 py-2 text-right">
                                <span className={m.available_qty >= m.required_qty ? "text-emerald-700 font-medium" : "text-amber-600 font-medium"}>
                                  {m.available_qty.toLocaleString()}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right">
                                {m.to_purchase > 0 ? (
                                  <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                                    <AlertTriangle className="size-3" />
                                    {m.to_purchase.toLocaleString()} {m.unit}
                                  </span>
                                ) : (
                                  <span className="text-emerald-700 text-xs">Sufficient</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {materials.some((m) => m.to_purchase > 0) && (
                      <div className="border-t bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        Some materials need to be purchased before production can begin.
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {saveError && <p className="text-sm text-destructive">{saveError}</p>}

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={saving} className="flex-1 sm:flex-none">
                {saving ? "Saving…" : "Save Changes"}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.push("/dashboard/production/planning")} disabled={saving}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
