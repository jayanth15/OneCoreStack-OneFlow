"use client";

import { useEffect, useState } from "react";
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
import { ArrowLeft } from "lucide-react";

interface ProductionPlan {
  id: number;
  plan_number: string;
  title: string;
}

interface PaginatedPlans {
  items: ProductionPlan[];
}

const BLANK = {
  title: "",
  production_plan_id: "",
  start_date: "",
  end_date: "",
  assigned_to: "",
  notes: "",
  status: "open",
  is_active: true,
};

export default function NewJobCardPage() {
  const router = useRouter();
  const [form, setForm] = useState(BLANK);
  const [plans, setPlans] = useState<ProductionPlan[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetchJson<PaginatedPlans>("/api/v1/production/plans?page_size=200")
      .then((r) => setPlans(r.items))
      .catch(() => { /* non-critical */ });
    document.getElementById("title")?.focus();
  }, []);

  function set(key: string, val: unknown) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError("Title is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const body = {
        title: form.title,
        production_plan_id: form.production_plan_id ? parseInt(form.production_plan_id as string) : null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        assigned_to: form.assigned_to || null,
        notes: form.notes || null,
        status: form.status,
        is_active: form.is_active,
      };
      await apiFetchJson("/api/v1/production/jobs", { method: "POST", body: JSON.stringify(body) });
      router.push("/dashboard/production/processing");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4 md:px-6">
        <Link href="/dashboard/production/processing" className="p-1.5 rounded-md hover:bg-muted transition-colors" aria-label="Back">
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
            <BreadcrumbItem><BreadcrumbPage>New Job Card</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="p-4 md:p-8 max-w-lg mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">New Job Card</h1>
          <p className="text-sm text-muted-foreground mt-1">Create a production processing job card to track work execution.</p>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="title">Title <span className="text-destructive">*</span></Label>
            <Input id="title" placeholder="e.g. Welding – Job Lot 45" value={form.title}
              onChange={(e) => set("title", e.target.value)} disabled={saving} />
          </div>

          {/* Linked plan */}
          <div className="space-y-1.5">
            <Label htmlFor="plan">Link to Production Plan</Label>
            <select id="plan" value={form.production_plan_id}
              onChange={(e) => set("production_plan_id", e.target.value)} disabled={saving}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
              <option value="">— None —</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{p.plan_number} — {p.title}</option>
              ))}
            </select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="start_date">Start Date</Label>
              <Input id="start_date" type="date" value={form.start_date}
                onChange={(e) => set("start_date", e.target.value)} disabled={saving} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end_date">End Date</Label>
              <Input id="end_date" type="date" value={form.end_date}
                onChange={(e) => set("end_date", e.target.value)} disabled={saving} />
            </div>
          </div>

          {/* Assigned to */}
          <div className="space-y-1.5">
            <Label htmlFor="assigned_to">Assigned To</Label>
            <Input id="assigned_to" placeholder="Worker / team name" value={form.assigned_to}
              onChange={(e) => set("assigned_to", e.target.value)} disabled={saving} />
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label htmlFor="status">Status</Label>
            <select id="status" value={form.status}
              onChange={(e) => set("status", e.target.value)} disabled={saving}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <textarea id="notes" rows={3} placeholder="Work instructions or remarks…" value={form.notes}
              onChange={(e) => set("notes", e.target.value)} disabled={saving}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 resize-none" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={saving} className="flex-1 sm:flex-none">
              {saving ? "Creating…" : "Create Job Card"}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push("/dashboard/production/processing")} disabled={saving}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
