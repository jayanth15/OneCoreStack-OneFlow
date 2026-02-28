"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList,
  BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiFetchJson } from "@/lib/api";
import {
  ArrowLeft, PlusIcon, Pencil, Trash2,
  Search, ChevronLeft, ChevronRight,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface JobCard {
  id: number;
  card_number: string;
  title: string;
  production_plan_id: number | null;
  start_date: string | null;
  end_date: string | null;
  assigned_to: string | null;
  notes: string | null;
  status: string;
  is_active: boolean;
}

interface PaginatedJobs {
  items: JobCard[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

interface ProductionPlan {
  id: number;
  plan_number: string;
  title: string;
}

interface PaginatedPlans {
  items: ProductionPlan[];
}

// ── Status helpers ─────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  open:        "secondary",
  in_progress: "default",
  completed:   "outline",
  cancelled:   "destructive",
};

const STATUS_LABELS: Record<string, string> = {
  open:        "Open",
  in_progress: "In Progress",
  completed:   "Completed",
  cancelled:   "Cancelled",
};

const FILTER_TABS = [
  { id: "all",         label: "All" },
  { id: "open",        label: "Open" },
  { id: "in_progress", label: "In Progress" },
  { id: "completed",   label: "Completed" },
  { id: "cancelled",   label: "Cancelled" },
];

// ── Inner component ────────────────────────────────────────────────────────────

function ProcessingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tab          = searchParams.get("tab") ?? "all";
  const page         = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const showInactive = searchParams.get("inactive") === "1";
  const search       = searchParams.get("search") ?? "";

  const [data, setData]         = useState<PaginatedJobs | null>(null);
  const [plans, setPlans]       = useState<ProductionPlan[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState(search);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const planMap = Object.fromEntries(plans.map((p) => [p.id, p]));

  useEffect(() => { setSearchDraft(search); }, [search]);

  // Load plans once for plan lookup
  useEffect(() => {
    apiFetchJson<PaginatedPlans>("/api/v1/production/plans?include_inactive=true&page_size=500")
      .then((d) => setPlans(d.items))
      .catch(() => setPlans([]));
  }, []);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page:             String(page),
      page_size:        "20",
      include_inactive: String(showInactive),
    });
    if (tab !== "all") params.set("status_filter", tab);
    if (search)        params.set("search", search);

    apiFetchJson<PaginatedJobs>(`/api/v1/production/jobs?${params}`)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [tab, page, showInactive, search]);

  // ── Navigation helpers ─────────────────────────────────────────────────────
  function nav(updates: Record<string, string>) {
    const p = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([k, v]) => {
      if (v === "") p.delete(k); else p.set(k, v);
    });
    router.push(`?${p.toString()}`);
  }

  function setTab(t: string)          { nav({ tab: t, page: "1" }); }
  function setPage(n: number)         { nav({ page: String(n) }); }
  function toggleInactive(v: boolean) { nav({ inactive: v ? "1" : "", page: "1" }); }
  function submitSearch()             { nav({ search: searchDraft.trim(), page: "1" }); }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (deleteId === null) return;
    setDeleting(true);
    try {
      await apiFetchJson(`/api/v1/production/jobs/${deleteId}`, { method: "DELETE" });
      setDeleteId(null);
      nav({});
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const jobs       = data?.items ?? [];
  const totalPages = data?.pages ?? 1;
  const total      = data?.total ?? 0;
  const pageStart  = ((page - 1) * 20) + 1;
  const pageEnd    = Math.min(page * 20, total);

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4 md:px-6">
        <Link href="/dashboard/production"
          className="p-1.5 rounded-md hover:bg-muted transition-colors" aria-label="Back">
          <ArrowLeft className="size-4" />
        </Link>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href="/dashboard/production">Production</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem><BreadcrumbPage>Processing</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Production Processing</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Job cards track production work from open to completion.
            </p>
          </div>
          <Button size="sm" onClick={() => router.push("/dashboard/production/processing/new")}>
            <PlusIcon className="size-4 mr-1" />
            New Job Card
          </Button>
        </div>

        {/* Filter tabs + Search */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex items-center gap-1 border-b overflow-x-auto flex-1">
            {FILTER_TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={["px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap",
                  tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                ].join(" ")}>
                {t.label}
              </button>
            ))}
            <div className="ml-auto pb-1 shrink-0 pl-2">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input type="checkbox" checked={showInactive}
                  onChange={(e) => toggleInactive(e.target.checked)} className="size-3 rounded" />
                Show inactive
              </label>
            </div>
          </div>
          {/* Search */}
          <form onSubmit={(e) => { e.preventDefault(); submitSearch(); }} className="flex gap-1.5 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text" value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder="Search title / card #…"
                className="pl-8 pr-3 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring w-44"
              />
            </div>
            <Button type="submit" size="sm" variant="secondary">Search</Button>
            {search && (
              <Button type="button" size="sm" variant="ghost"
                onClick={() => nav({ search: "", page: "1" })}>
                Clear
              </Button>
            )}
          </form>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Table */}
        <div className="rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-3 text-left font-medium">Card #</th>
                  <th className="px-4 py-3 text-left font-medium">Title</th>
                  <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Plan</th>
                  <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Dates</th>
                  <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Assigned</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : jobs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      {search
                        ? `No job cards matching "${search}".`
                        : `No job cards found. Click "New Job Card" to get started.`}
                    </td>
                  </tr>
                ) : jobs.map((job) => (
                  <tr key={job.id}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-medium">{job.card_number}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{job.title}</div>
                      {!job.is_active && <span className="text-xs text-muted-foreground">(inactive)</span>}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-xs text-muted-foreground">
                      {job.production_plan_id && planMap[job.production_plan_id]
                        ? <span className="font-mono">{planMap[job.production_plan_id].plan_number}</span>
                        : "—"}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">
                      {job.start_date ? job.start_date : "—"}
                      {job.end_date   ? ` → ${job.end_date}` : ""}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">
                      {job.assigned_to ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_BADGE[job.status] ?? "outline"} className="text-xs">
                        {STATUS_LABELS[job.status] ?? job.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <Button variant="ghost" size="icon" className="size-8"
                          onClick={() => router.push(`/dashboard/production/processing/${job.id}/edit`)}
                          title="Edit">
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteId(job.id)} title="Deactivate">
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              {!loading && jobs.length > 0 && (
                <tfoot>
                  <tr className="border-t bg-muted/20">
                    <td colSpan={7} className="px-4 py-2 text-xs text-muted-foreground">
                      Showing {pageStart}–{pageEnd} of {total}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-sm text-muted-foreground">
              Page {page} of {totalPages} &mdash; {total} card{total !== 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="size-8"
                disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="size-4" />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("…");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === "…" ? (
                    <span key={`e${i}`} className="px-1 text-muted-foreground text-sm">…</span>
                  ) : (
                    <Button key={p} variant={p === page ? "default" : "outline"} size="icon"
                      className="size-8" onClick={() => setPage(p as number)}>{p}</Button>
                  )
                )}
              <Button variant="outline" size="icon" className="size-8"
                disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate job card?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the job card as inactive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deactivating…" : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Page export ────────────────────────────────────────────────────────────────

export default function JobCardsPage() {
  return (
    <Suspense fallback={
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    }>
      <ProcessingPageInner />
    </Suspense>
  );
}
