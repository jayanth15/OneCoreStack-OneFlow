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
import { ArrowLeft } from "lucide-react";

interface JobForm {
  title: string;
  production_plan_id: string;
  start_date: string;
  end_date: string;
  assigned_to: string;
  notes: string;
  status: string;
  is_active: boolean;
}

interface ProductionPlan {
  id: number;
  plan_number: string;
  title: string;
}

export default function EditJobCardPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [form, setForm] = useState<JobForm>({
    title: "", production_plan_id: "", start_date: "", end_date: "",
    assigned_to: "", notes: "", status: "open", is_active: true,
  });
  const [cardNumber, setCardNumber] = useState("");
  const [plans, setPlans] = useState<ProductionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      apiFetchJson<JobForm & { id: number; card_number: string; production_plan_id: number | null }>(`/api/v1/production/jobs/${id}`),
      apiFetchJson<ProductionPlan[]>("/api/v1/production/plans?include_inactive=true"),
    ])
      .then(([d, planList]) => {
        setCardNumber(d.card_number);
        setForm({
          title: d.title,
          production_plan_id: d.production_plan_id !== null ? String(d.production_plan_id) : "",
          start_date: d.start_date ?? "",
          end_date: d.end_date ?? "",
          assigned_to: (d as unknown as { assigned_to: string | null }).assigned_to ?? "",
          notes: (d as unknown as { notes: string | null }).notes ?? "",
          status: d.status,
          is_active: d.is_active,
        });
        setPlans(planList);
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "Not found"))
      .finally(() => setLoading(false));
  }, [id]);

  function set(key: string, val: unknown) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setSaveError("Title is required"); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const body = {
        title: form.title,
        production_plan_id: form.production_plan_id ? parseInt(form.production_plan_id) : null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        assigned_to: form.assigned_to || null,
        notes: form.notes || null,
        status: form.status,
        is_active: form.is_active,
      };
      await apiFetchJson(`/api/v1/production/jobs/${id}`, { method: "PUT", body: JSON.stringify(body) });
      router.push("/dashboard/production/processing");
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
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
              Editing <span className="font-mono font-medium">{cardNumber}</span> — {form.title}
            </p>
          )}
        </div>

        {loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : loading ? (
          <div className="space-y-5">{Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : (
          <form onSubmit={handleSave} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title <span className="text-destructive">*</span></Label>
              <Input id="title" value={form.title} onChange={(e) => set("title", e.target.value)} disabled={saving} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="plan">Linked Production Plan</Label>
              <select id="plan" value={form.production_plan_id}
                onChange={(e) => set("production_plan_id", e.target.value)} disabled={saving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
                <option value="">— None —</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.plan_number} — {p.title}</option>
                ))}
              </select>
            </div>

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

            <div className="space-y-1.5">
              <Label htmlFor="assigned_to">Assigned To</Label>
              <Input id="assigned_to" value={form.assigned_to}
                onChange={(e) => set("assigned_to", e.target.value)} disabled={saving} />
            </div>

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

            <div className="space-y-1.5">
              <Label htmlFor="is_active">Active</Label>
              <select id="is_active" value={form.is_active ? "true" : "false"}
                onChange={(e) => set("is_active", e.target.value === "true")} disabled={saving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <textarea id="notes" rows={3} value={form.notes}
                onChange={(e) => set("notes", e.target.value)} disabled={saving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 resize-none" />
            </div>

            {saveError && <p className="text-sm text-destructive">{saveError}</p>}

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={saving} className="flex-1 sm:flex-none">
                {saving ? "Saving…" : "Save Changes"}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.push("/dashboard/production/processing")} disabled={saving}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
