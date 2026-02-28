"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiFetchJson } from "@/lib/api";
import { PlusIcon, Pencil, Trash2, AlertTriangle, ChevronLeft, ChevronRight, Search } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScheduleItem {
  id: number;
  schedule_number: string;
  customer_name: string;
  description: string;
  scheduled_date: string;
  scheduled_qty: number;
  backlog_qty: number;
  total_qty: number;
  notes: string | null;
  status: string;
  is_active: boolean;
  created_at: string | null;
}

interface PaginatedSchedules {
  items: ScheduleItem[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  pending:       "bg-amber-100 text-amber-800",
  confirmed:     "bg-blue-100 text-blue-800",
  in_production: "bg-emerald-100 text-emerald-800",
  delivered:     "bg-slate-100 text-slate-600",
  cancelled:     "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  in_production: "In Production",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const TABS = [
  { id: "all",           label: "All" },
  { id: "pending",       label: "Pending" },
  { id: "confirmed",     label: "Confirmed" },
  { id: "in_production", label: "In Production" },
  { id: "delivered",     label: "Delivered" },
  { id: "cancelled",     label: "Cancelled" },
];

function fmt(n: number) {
  return n % 1 === 0 ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateTime(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Inner component (reads searchParams) ──────────────────────────────────────

function SchedulePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tab            = searchParams.get("tab") ?? "all";
  const page           = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const showInactive   = searchParams.get("inactive") === "1";
  const search         = searchParams.get("search") ?? "";

  const [data, setData]     = useState<PaginatedSchedules | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [searchDraft, setSearchDraft] = useState(search);

  // Keep search draft in sync with URL
  useEffect(() => { setSearchDraft(search); }, [search]);

  // ── Fetch — triggered every time URL params change ──────────────────────────
  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page: String(page),
      page_size: "20",
      include_inactive: String(showInactive),
    });
    if (tab !== "all") params.set("status_filter", tab);
    if (search)        params.set("search", search);

    apiFetchJson<PaginatedSchedules>(`/api/v1/schedules?${params}`)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [tab, page, showInactive, search]);

  // ── Navigation helpers ──────────────────────────────────────────────────────
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

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (deleteId === null) return;
    setDeleting(true);
    try {
      await apiFetchJson(`/api/v1/schedules/${deleteId}`, { method: "DELETE" });
      setDeleteId(null);
      // Refresh current page
      nav({});
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), page_size: "20", include_inactive: String(showInactive) });
      if (tab !== "all") params.set("status_filter", tab);
      if (search)        params.set("search", search);
      const fresh = await apiFetchJson<PaginatedSchedules>(`/api/v1/schedules?${params}`);
      setData(fresh);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
      setLoading(false);
    }
  }

  const schedules = data?.items ?? [];
  const totalPages = data?.pages ?? 1;
  const total = data?.total ?? 0;
  const pageStart = ((page - 1) * 20) + 1;
  const pageEnd = Math.min(page * 20, total);

  return (
    <>
      <header className="flex h-16 shrink-0 items-center border-b px-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbPage>Schedule</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="p-4 md:p-6 space-y-4">
        {/* Heading */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Schedule</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Customer / OEM delivery schedules — the starting point for production planning.
            </p>
          </div>
          <Button size="sm" onClick={() => router.push("/dashboard/schedule/new")}>
            <PlusIcon className="size-4 mr-1" />
            New Schedule
          </Button>
        </div>

        {/* Status tabs + Search */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex items-center gap-1 border-b overflow-x-auto flex-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={[
                  "px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px",
                  tab === t.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {t.label}
              </button>
            ))}
            <div className="ml-auto pb-1 shrink-0 pl-2">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => toggleInactive(e.target.checked)}
                  className="size-3 rounded"
                />
                Show inactive
              </label>
            </div>
          </div>
          {/* Search */}
          <form onSubmit={(e) => { e.preventDefault(); submitSearch(); }} className="flex gap-1.5 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder="Search customer / product…"
                className="pl-8 pr-3 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring w-48"
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
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-3 text-left font-medium">Sch #</th>
                  <th className="px-4 py-3 text-left font-medium">Customer</th>
                  <th className="px-4 py-3 text-left font-medium">Product</th>
                  <th className="px-4 py-3 text-left font-medium hidden lg:table-cell">Created</th>
                  <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Delivery</th>
                  <th className="px-4 py-3 text-right font-medium">Sch. Qty</th>
                  <th className="px-4 py-3 text-right font-medium hidden md:table-cell">Backlog</th>
                  <th className="px-4 py-3 text-right font-medium">Total Qty</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 10 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : schedules.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                      No schedules found. Click &quot;New Schedule&quot; to add one.
                    </td>
                  </tr>
                ) : (
                  schedules.map((s) => (
                    <tr key={s.id} className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${!s.is_active ? "opacity-60" : ""}`}>
                      <td className="px-4 py-3 font-mono text-xs font-medium">{s.schedule_number}</td>
                      <td className="px-4 py-3 font-medium max-w-[140px] truncate" title={s.customer_name}>
                        {s.customer_name}
                        {!s.is_active && <span className="ml-1 text-xs text-muted-foreground">(inactive)</span>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[180px] truncate" title={s.description}>
                        {s.description}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell whitespace-nowrap">
                        {fmtDateTime(s.created_at)}
                      </td>
                      <td className="px-4 py-3 text-xs hidden sm:table-cell whitespace-nowrap">
                        {fmtDate(s.scheduled_date)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmt(s.scheduled_qty)}</td>
                      <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                        {s.backlog_qty > 0 ? (
                          <span className="flex items-center justify-end gap-1 text-amber-600">
                            <AlertTriangle className="size-3" />
                            {fmt(s.backlog_qty)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">
                        {fmt(s.total_qty)}
                        {s.backlog_qty > 0 && (
                          <div className="text-xs font-normal text-amber-600">incl. backlog</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[s.status] ?? "bg-muted"}`}>
                          {STATUS_LABELS[s.status] ?? s.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-1">
                          <Button
                            variant="ghost" size="icon" className="size-8"
                            onClick={() => router.push(`/dashboard/schedule/${s.id}/edit`)}
                            title="Edit"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="size-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteId(s.id)}
                            title="Deactivate"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {/* Summary footer */}
              {!loading && schedules.length > 0 && (
                <tfoot>
                  <tr className="border-t bg-muted/20">
                    <td colSpan={5} className="px-4 py-2 text-xs text-muted-foreground">
                      Showing {pageStart}–{pageEnd} of {total}
                    </td>
                    <td className="px-4 py-2 text-right text-xs font-semibold tabular-nums">
                      {fmt(schedules.reduce((a, s) => a + s.scheduled_qty, 0))}
                    </td>
                    <td className="px-4 py-2 text-right text-xs font-semibold tabular-nums hidden md:table-cell">
                      {(() => { const b = schedules.reduce((a, s) => a + s.backlog_qty, 0); return b > 0 ? <span className="text-amber-600">{fmt(b)}</span> : "—"; })()}
                    </td>
                    <td className="px-4 py-2 text-right text-xs font-semibold tabular-nums">
                      {fmt(schedules.reduce((a, s) => a + s.total_qty, 0))}
                    </td>
                    <td colSpan={2} />
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
              Page {page} of {totalPages} &mdash; {total} record{total !== 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                title="Previous page"
              >
                <ChevronLeft className="size-4" />
              </Button>

              {/* Page number buttons (show up to 5 around current) */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("…");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === "…" ? (
                    <span key={`ellipsis-${i}`} className="px-1 text-muted-foreground text-sm">…</span>
                  ) : (
                    <Button
                      key={p}
                      variant={p === page ? "default" : "outline"}
                      size="icon"
                      className="size-8"
                      onClick={() => setPage(p as number)}
                    >
                      {p}
                    </Button>
                  )
                )}

              <Button
                variant="outline"
                size="icon"
                className="size-8"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                title="Next page"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Delete / Deactivate dialog */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the schedule as inactive. It can be re-activated via Edit.
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

// ── Page export — wraps inner in Suspense so useSearchParams works in SSR ──────

export default function SchedulePage() {
  return (
    <Suspense fallback={
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    }>
      <SchedulePageInner />
    </Suspense>
  );
}
