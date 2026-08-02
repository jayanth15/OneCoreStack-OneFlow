"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { apiFetchJson } from "@/lib/api";
import { isAdminOrAbove } from "@/lib/user";
import {
  ArrowLeft, Phone, Mail, MapPin, Plus, Pencil, Trash2,
  Wrench,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SupplierJob {
  id: number;
  job_name: string;
  description: string | null;
  rate: number | null;
  unit: string | null;
  notes: string | null;
  is_active: boolean;
}


interface SupplierDetail {
  id: number;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  jobs: SupplierJob[];
}

// ── Blank forms ───────────────────────────────────────────────────────────────

const BLANK_JOB = { job_name: "", description: "", rate: "", unit: "", notes: "" };

// ── Helpers ───────────────────────────────────────────────────────────────────

function avatarColor(name: string) {
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return `hsl(${hue},55%,40%)`;
}

function fmt(n: number | null) {
  if (n === null || n === undefined) return "—";
  return n % 1 === 0 ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

function SectionHeader({ icon: Icon, title, action }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className="size-4 text-muted-foreground" />
      <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground flex-1">{title}</h2>
      {action}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const adminUser = isAdminOrAbove();

  const [data, setData] = useState<SupplierDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Job dialog state ──
  const [jobDialogOpen, setJobDialogOpen] = useState(false);
  const [editJobTarget, setEditJobTarget] = useState<SupplierJob | null>(null);
  const [jobForm, setJobForm] = useState(BLANK_JOB);
  const [jobSaving, setJobSaving] = useState(false);
  const [jobError, setJobError] = useState<string | null>(null);
  const [deletingJobId, setDeletingJobId] = useState<number | null>(null);


  useEffect(() => {
    if (!isAdminOrAbove()) { router.replace("/dashboard"); }
  }, [router]);

  function load() {
    setLoading(true);
    apiFetchJson<SupplierDetail>(`/api/v1/suppliers/${id}`)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Not found"))
      .finally(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Job handlers ──────────────────────────────────────────────────────────

  function openAddJob() {
    setEditJobTarget(null);
    setJobForm(BLANK_JOB);
    setJobError(null);
    setJobDialogOpen(true);
  }

  function openEditJob(j: SupplierJob) {
    setEditJobTarget(j);
    setJobForm({
      job_name: j.job_name,
      description: j.description ?? "",
      rate: j.rate !== null ? String(j.rate) : "",
      unit: j.unit ?? "",
      notes: j.notes ?? "",
    });
    setJobError(null);
    setJobDialogOpen(true);
  }

  async function handleJobSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!jobForm.job_name.trim()) { setJobError("Job name is required"); return; }
    setJobSaving(true);
    setJobError(null);
    try {
      const body = {
        job_name: jobForm.job_name.trim(),
        description: jobForm.description.trim() || null,
        rate: jobForm.rate ? parseFloat(jobForm.rate) : null,
        unit: jobForm.unit.trim() || null,
        notes: jobForm.notes.trim() || null,
      };
      if (editJobTarget) {
        await apiFetchJson(`/api/v1/suppliers/${id}/jobs/${editJobTarget.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      } else {
        await apiFetchJson(`/api/v1/suppliers/${id}/jobs`, {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      setJobDialogOpen(false);
      load();
    } catch (err: unknown) {
      setJobError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setJobSaving(false);
    }
  }

  async function deleteJob(jobId: number) {
    setDeletingJobId(jobId);
    try {
      await apiFetchJson(`/api/v1/suppliers/${id}/jobs/${jobId}`, { method: "DELETE" });
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete job");
    } finally {
      setDeletingJobId(null);
    }
  }


  const initials = data ? (
    (() => {
      const words = data.name.trim().split(/\s+/);
      return (words.length >= 2 ? words[0][0] + words[1][0] : data.name.slice(0, 2)).toUpperCase();
    })()
  ) : "";

  return (
    <>
      {/* ── Header ── */}
      <PageHeader
        title={loading ? "Loading…" : (data?.name ?? "Supplier")}
        breadcrumbs={[
          { label: "Suppliers", href: "/dashboard/suppliers" },
          { label: loading ? "Loading…" : (data?.name ?? "Supplier") },
        ]}
        actions={
          <Link href="/dashboard/suppliers" className="p-1.5 rounded-md hover:bg-muted transition-colors" aria-label="Back">
            <ArrowLeft className="size-4" />
          </Link>
        }
      />

      {/* ── Job Dialog ── */}
      <Dialog open={jobDialogOpen} onOpenChange={setJobDialogOpen}>
        <DialogContent className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editJobTarget ? "Edit Job / Service" : "Add Job / Service"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleJobSubmit} className="px-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="j-name">Job Name <span className="text-destructive">*</span></Label>
              <Input
                id="j-name"
                autoFocus
                placeholder="e.g. Laser Cutting, Powder Coating"
                value={jobForm.job_name}
                onChange={(e) => setJobForm({ ...jobForm, job_name: e.target.value })}
                disabled={jobSaving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="j-desc">Description</Label>
              <Input
                id="j-desc"
                placeholder="Brief description of the service"
                value={jobForm.description}
                onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })}
                disabled={jobSaving}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="j-rate">Rate</Label>
                <Input
                  id="j-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={jobForm.rate}
                  onChange={(e) => setJobForm({ ...jobForm, rate: e.target.value })}
                  disabled={jobSaving}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="j-unit">Unit</Label>
                <Input
                  id="j-unit"
                  placeholder="e.g. per piece, per kg"
                  value={jobForm.unit}
                  onChange={(e) => setJobForm({ ...jobForm, unit: e.target.value })}
                  disabled={jobSaving}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="j-notes">Notes</Label>
              <textarea
                id="j-notes"
                rows={2}
                placeholder="Any additional notes…"
                value={jobForm.notes}
                onChange={(e) => setJobForm({ ...jobForm, notes: e.target.value })}
                disabled={jobSaving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 resize-none"
              />
            </div>
            {jobError && <p className="text-sm text-destructive">{jobError}</p>}
          </form>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setJobDialogOpen(false)} disabled={jobSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={jobSaving} onClick={handleJobSubmit}>
              {jobSaving ? "Saving…" : editJobTarget ? "Save Changes" : "Add Job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
        {loading && (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {!loading && data && (
          <>
            {/* ── Supplier hero ── */}
            <div className="rounded-xl border bg-card p-5 flex items-start gap-5">
              <div
                className="size-16 rounded-full flex items-center justify-center text-white text-xl font-bold shrink-0"
                style={{ backgroundColor: avatarColor(data.name) }}
              >
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-semibold">{data.name}</h1>
                  {!data.is_active && (
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">Inactive</span>
                  )}
                </div>
                {data.contact_person && (
                  <p className="text-sm text-muted-foreground mt-0.5">{data.contact_person}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {data.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="size-3" />{data.phone}
                    </span>
                  )}
                  {data.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="size-3" />{data.email}
                    </span>
                  )}
                  {data.address && (
                    <span className="flex items-center gap-1">
                      <MapPin className="size-3" />{data.address}
                    </span>
                  )}
                </div>
                {data.notes && (
                  <p className="mt-2 text-xs text-muted-foreground">{data.notes}</p>
                )}
              </div>
            </div>


            {/* ── Jobs / Services ── */}
            <div className="rounded-xl border bg-card p-5">
              <SectionHeader
                icon={Wrench}
                title="Jobs / Services"
                action={adminUser ? (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={openAddJob}>
                    <Plus className="size-3" /> Add Job
                  </Button>
                ) : undefined}
              />

              {data.jobs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Wrench className="size-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No jobs recorded yet.</p>
                  {adminUser && (
                    <Button size="sm" variant="outline" className="mt-3 gap-1" onClick={openAddJob}>
                      <Plus className="size-3" /> Add First Job
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {data.jobs.map((j) => (
                    <div key={j.id} className="rounded-lg border p-3 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{j.job_name}</span>
                          {j.rate !== null && (
                            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                              ₹{fmt(j.rate)}{j.unit ? ` / ${j.unit}` : ""}
                            </span>
                          )}
                        </div>
                        {j.description && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{j.description}</p>
                        )}
                        {j.notes && (
                          <p className="mt-0.5 text-xs text-muted-foreground italic">{j.notes}</p>
                        )}
                      </div>
                      {adminUser && (
                        <div className="flex items-center gap-1 shrink-0">
                          <Button size="icon" variant="ghost" className="size-7" onClick={() => openEditJob(j)}>
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7 text-destructive hover:text-destructive"
                            disabled={deletingJobId === j.id}
                            onClick={() => deleteJob(j.id)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </>
        )}
      </div>
    </>
  );
}
