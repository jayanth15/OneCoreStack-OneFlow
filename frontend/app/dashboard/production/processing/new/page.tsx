"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { apiFetchJson } from "@/lib/api";
import { isAdminOrAbove } from "@/lib/user";
import { ArrowLeft, Info } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProcessItem {
  id: number;
  name: string;
  sequence: number;
  notes: string | null;
}

interface ProductionPlan {
  id: number;
  plan_number: string;
  title: string;
  planned_qty: number;
  status: string;
  start_date: string | null;
  end_date: string | null;
  schedule_number: string | null;
  customer_name: string | null;
  product_description: string | null;
  processes: ProcessItem[];
}

interface PaginatedPlans {
  items: ProductionPlan[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function NewProductionOrderPage() {
  const router = useRouter();

  // Guard: only admins can access this page
  useEffect(() => {
    if (!isAdminOrAbove()) router.replace("/dashboard/production/processing");
  }, [router]);
  const [plans, setPlans] = useState<ProductionPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load only approved plans that don't already have an active production order
    apiFetchJson<PaginatedPlans>("/api/v1/production/plans?page_size=200&available_for_orders=true")
      .then((r) => setPlans(r.items))
      .catch(() => setPlans([]));
  }, []);

  const selectedPlan = plans.find((p) => String(p.id) === selectedPlanId) ?? null;

  // Auto-fill dates from selected plan
  useEffect(() => {
    if (selectedPlan) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStartDate(selectedPlan.start_date ?? "");
      setEndDate(selectedPlan.end_date ?? "");
    } else {
      setStartDate("");
      setEndDate("");
    }
  }, [selectedPlan]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPlanId) { setError("Select a production plan"); return; }
    setSaving(true);
    setError(null);
    try {
      const body = {
        production_plan_id: parseInt(selectedPlanId),
        start_date: startDate || null,
        end_date: endDate || null,
        notes: notes || null,
        status: "open",
      };
      const created = await apiFetchJson<{ id: number }>("/api/v1/production/orders", {
        method: "POST",
        body: JSON.stringify(body),
      });
      router.push(`/dashboard/production/processing/${created.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Start Production"
        description="Create a production order linked to a plan. You can then add job cards for each process step."
        breadcrumbs={[
          { label: "Production", href: "/dashboard/production" },
          { label: "Processing", href: "/dashboard/production/processing" },
          { label: "Start Production" },
        ]}
        actions={
          <Link href="/dashboard/production/processing"
            className="p-1.5 rounded-md hover:bg-muted transition-colors" aria-label="Back">
            <ArrowLeft className="size-4" />
          </Link>
        }
      />

      <div className="p-4 md:p-8 max-w-lg mx-auto">
        <form onSubmit={handleSave} className="space-y-5">
          {/* Plan selector */}
          <div className="space-y-1.5">
            <Label htmlFor="plan">Production Plan <span className="text-destructive">*</span></Label>
            <select id="plan" value={selectedPlanId}
              onChange={(e) => setSelectedPlanId(e.target.value)} disabled={saving}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
              <option value="">— Select a plan —</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.plan_number} — {p.title} ({p.status})
                </option>
              ))}
            </select>
            {plans.length === 0 && (
              <p className="text-xs text-warning mt-1">No plans available — all approved plans already have active production orders.</p>
            )}
          </div>

          {/* Plan preview */}
          {selectedPlan && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Info className="size-4 text-primary" />
                Plan Details
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Customer:</span>{" "}
                  <span className="font-medium">{selectedPlan.customer_name ?? "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Product:</span>{" "}
                  <span className="font-medium">{selectedPlan.product_description ?? "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Planned Qty:</span>{" "}
                  <span className="font-medium">{selectedPlan.planned_qty}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Schedule:</span>{" "}
                  <span className="font-mono font-medium">{selectedPlan.schedule_number ?? "—"}</span>
                </div>
              </div>

              {selectedPlan.processes.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Process steps (will be available for job cards):</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedPlan.processes.map((p) => (
                      <span key={p.id} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                        {p.sequence}. {p.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Dates — auto-filled from selected plan, read-only */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              {selectedPlan ? (
                <p className="text-sm font-medium py-2 px-1">{startDate || "—"}</p>
              ) : (
                <p className="text-sm text-muted-foreground py-2 px-1">Select a plan first</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>End Date</Label>
              {selectedPlan ? (
                <p className="text-sm font-medium py-2 px-1">{endDate || "—"}</p>
              ) : (
                <p className="text-sm text-muted-foreground py-2 px-1">Select a plan first</p>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <textarea id="notes" rows={3} placeholder="Production remarks…" value={notes}
              onChange={(e) => setNotes(e.target.value)} disabled={saving}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 resize-none" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={saving} className="flex-1 sm:flex-none">
              {saving ? "Starting…" : "Start Production"}
            </Button>
            <Button type="button" variant="outline"
              onClick={() => router.push("/dashboard/production/processing")} disabled={saving}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
