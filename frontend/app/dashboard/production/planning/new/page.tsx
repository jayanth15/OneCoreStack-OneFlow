"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList,
  BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetchJson } from "@/lib/api";
import { ArrowLeft, Info, Plus, Trash2, AlertTriangle, Package } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

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

interface PlanCreatedResponse {
  id: number;
  plan_number: string;
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

interface LocalProcess {
  key: number;
  name: string;
  notes: string;
}

const BLANK = {
  title: "",
  schedule_id: "",
  planned_qty: "",
  start_date: "",
  end_date: "",
  notes: "",
  status: "draft",
  is_active: true,
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NewPlanPage() {
  const router = useRouter();
  const [form, setForm] = useState(BLANK);
  const [schedules, setSchedules] = useState<ScheduleOption[]>([]);
  const [schedLoading, setSchedLoading] = useState(true);
  const [selectedSched, setSelectedSched] = useState<ScheduleOption | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Processes (local state — batch POSTed after plan is created) ──────────
  const [processes, setProcesses] = useState<LocalProcess[]>([]);
  const [processInput, setProcessInput] = useState("");
  const nextKey = useRef(1);

  // ── Materials BOM preview ─────────────────────────────────────────────────
  const [materials, setMaterials] = useState<MaterialRequirement[]>([]);
  const [matsLoading, setMatsLoading] = useState(false);
  const [matsError, setMatsError] = useState<string | null>(null);

  useEffect(() => {
    apiFetchJson<PaginatedSchedules>("/api/v1/schedules?page_size=200&include_inactive=false&status_filter=pending")
      .then((r) => setSchedules(r.items))
      .catch(() => setSchedules([]))
      .finally(() => setSchedLoading(false));
  }, []);

  useEffect(() => {
    const qty = parseFloat(form.planned_qty);
    if (!selectedSched || !qty || qty <= 0) {
      setMaterials([]);
      setMatsError(null);
      return;
    }
    setMatsLoading(true);
    setMatsError(null);
    const params = new URLSearchParams({
      product_name: selectedSched.description,
      planned_qty: String(qty),
    });
    apiFetchJson<MaterialRequirement[]>(`/api/v1/production/bom-preview?${params}`)
      .then(setMaterials)
      .catch((e: unknown) => {
        setMaterials([]);
        setMatsError(e instanceof Error ? e.message : "Failed to load materials");
      })
      .finally(() => setMatsLoading(false));
  }, [selectedSched, form.planned_qty]);

  function set(key: string, val: unknown) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function handleScheduleChange(id: string) {
    set("schedule_id", id);
    const found = id ? schedules.find((s) => String(s.id) === id) ?? null : null;
    setSelectedSched(found);
    if (found) {
      if (!form.title.trim()) {
        set("title", `${found.schedule_number} \u2013 ${found.customer_name}`);
      }
      set("planned_qty", String(found.scheduled_qty + found.backlog_qty));
    }
  }

  function addProcess() {
    const name = processInput.trim();
    if (!name) return;
    setProcesses((p) => [...p, { key: nextKey.current++, name, notes: "" }]);
    setProcessInput("");
  }

  function removeProcess(key: number) {
    setProcesses((p) => p.filter((x) => x.key !== key));
  }

  function updateProcess(key: number, field: "name" | "notes", val: string) {
    setProcesses((p) => p.map((x) => x.key === key ? { ...x, [field]: val } : x));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError("Title is required"); return; }
    setSaving(true);
    setError(null);
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
      const created = await apiFetchJson<PlanCreatedResponse>(
        "/api/v1/production/plans",
        { method: "POST", body: JSON.stringify(body) },
      );
      if (processes.length > 0) {
        await Promise.all(
          processes.map((p, idx) =>
            apiFetchJson(`/api/v1/production/plans/${created.id}/processes`, {
              method: "POST",
              body: JSON.stringify({ name: p.name, sequence: idx, notes: p.notes || null }),
            }),
          ),
        );
      }
      router.push("/dashboard/production/planning");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
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
            <BreadcrumbItem><BreadcrumbPage>New Plan</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="p-4 md:p-8 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">New Production Plan</h1>
          <p className="text-sm text-muted-foreground mt-1">Link a customer schedule, define process steps, and review required materials.</p>
        </div>

        <form onSubmit={handleSave} className="space-y-8">

          {/* ── Schedule ─────────────────────────────────────────────────── */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Schedule</h2>
            <div className="space-y-1.5">
              <Label htmlFor="schedule_id">Customer Schedule</Label>
              <select id="schedule_id" value={form.schedule_id}
                onChange={(e) => handleScheduleChange(e.target.value)} disabled={saving || schedLoading}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
                <option value="">— Select a schedule —</option>
                {schedules.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.schedule_number} · {s.customer_name} — {s.description}
                    {" "}(qty: {(s.scheduled_qty + s.backlog_qty).toLocaleString()}
                    {s.scheduled_date ? `, delivery: ${s.scheduled_date}` : ""})
                  </option>
                ))}
              </select>
              {schedLoading && <p className="text-xs text-muted-foreground">Loading schedules…</p>}
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

          {/* ── Plan Details ──────────────────────────────────────────────── */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Plan Details</h2>

            <div className="space-y-1.5">
              <Label htmlFor="title">Plan Title <span className="text-destructive">*</span></Label>
              <Input id="title" placeholder="e.g. Batch Run – March W1"
                value={form.title} onChange={(e) => set("title", e.target.value)} disabled={saving} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="planned_qty">Planned Quantity</Label>
              <Input id="planned_qty" type="number" min={0} step="any"
                placeholder="Units to produce in this run"
                value={form.planned_qty} onChange={(e) => set("planned_qty", e.target.value)} disabled={saving} />
              {selectedSched && (
                <p className="text-xs text-muted-foreground">
                  Defaulted to total (sched + backlog) = {(selectedSched.scheduled_qty + selectedSched.backlog_qty).toLocaleString()}
                </p>
              )}
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
              <Label htmlFor="notes">Notes</Label>
              <textarea id="notes" rows={3} placeholder="Any additional remarks…"
                value={form.notes} onChange={(e) => set("notes", e.target.value)} disabled={saving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 resize-none" />
            </div>
          </section>

          {/* ── Process Steps ─────────────────────────────────────────────── */}
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
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addProcess(); } }}
                disabled={saving}
                className="flex-1"
              />
              <Button type="button" size="sm" variant="secondary" onClick={addProcess} disabled={saving || !processInput.trim()}>
                <Plus className="size-4 mr-1" />
                Add
              </Button>
            </div>

            {processes.length > 0 ? (
              <div className="rounded-lg border divide-y">
                {processes.map((proc, idx) => (
                  <div key={proc.key} className="flex items-start gap-3 px-3 py-2.5">
                    <span className="mt-2 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                      {idx + 1}
                    </span>
                    <div className="flex-1 space-y-1.5">
                      <Input
                        value={proc.name}
                        onChange={(e) => updateProcess(proc.key, "name", e.target.value)}
                        disabled={saving}
                        className="h-8 text-sm font-medium"
                      />
                      <Input
                        value={proc.notes}
                        onChange={(e) => updateProcess(proc.key, "notes", e.target.value)}
                        placeholder="Notes (optional)"
                        disabled={saving}
                        className="h-7 text-xs text-muted-foreground"
                      />
                    </div>
                    <Button
                      type="button" variant="ghost" size="icon"
                      className="mt-1 size-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeProcess(proc.key)} disabled={saving}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No process steps yet. Add steps like "Blanking", "Numbering", "Assembly"…
              </div>
            )}
          </section>

          {/* ── Materials Panel ───────────────────────────────────────────── */}
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

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={saving} className="flex-1 sm:flex-none">
              {saving ? "Creating…" : "Create Plan"}
            </Button>
            <Button type="button" variant="outline"
              onClick={() => router.push("/dashboard/production/planning")} disabled={saving}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
