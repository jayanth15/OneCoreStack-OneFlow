"use client";

import { useEffect, useState } from "react";
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
import { ArrowLeft, Clock, User } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface WorkerOption {
  id: number;
  username: string;
}

interface WorkerTimeSummary {
  user_id: number | null;
  username: string;
  total_hours: number;
  job_card_count: number;
  process_names: string[];
  order_numbers: string[];
  work_dates: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function currentMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TimeReportPage() {
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState<number | null>(null);
  const [workersLoading, setWorkersLoading] = useState(true);

  const [data, setData] = useState<WorkerTimeSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState(currentMonthStart);
  const [dateTo, setDateTo] = useState(today);

  // Load worker list on mount
  useEffect(() => {
    setWorkersLoading(true);
    apiFetchJson<WorkerOption[]>("/api/v1/production/workers")
      .then(setWorkers)
      .catch(() => {})
      .finally(() => setWorkersLoading(false));
  }, []);

  function fetchReport(workerId: number | null, from?: string, to?: string) {
    if (workerId === null) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    const f = from ?? dateFrom;
    const t = to ?? dateTo;
    if (f) params.set("date_from", f);
    if (t) params.set("date_to", t);
    params.set("user_id", String(workerId));
    apiFetchJson<WorkerTimeSummary[]>(`/api/v1/production/time-report?${params}`)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }

  function handleFilter(e: React.FormEvent) {
    e.preventDefault();
    fetchReport(selectedWorkerId, dateFrom || undefined, dateTo || undefined);
  }

  function handleWorkerChange(id: number | null) {
    setSelectedWorkerId(id);
    setData([]);
    if (id !== null) fetchReport(id, dateFrom || undefined, dateTo || undefined);
  }

  const grandTotal = data.reduce((s, w) => s + w.total_hours, 0);

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4 md:px-6">
        <Link href="/dashboard/production" className="p-1.5 rounded-md hover:bg-muted transition-colors" aria-label="Back">
          <ArrowLeft className="size-4" />
        </Link>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href="/dashboard/production">Production</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>Worker Time Report</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="p-4 md:p-8 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">Worker Time Report</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Aggregated work hours per worker, broken down by work type.
          </p>
        </div>

        {/* Worker selector */}
        <div className="rounded-lg border p-4 mb-6 space-y-2">
          <Label className="flex items-center gap-1.5 text-sm font-medium"><User className="size-3.5" />Select Worker</Label>
          {workersLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <select
              value={selectedWorkerId ?? ""}
              onChange={e => handleWorkerChange(e.target.value ? Number(e.target.value) : null)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">— Select a worker to view their report —</option>
              {workers.map(w => <option key={w.id} value={w.id}>{w.username}</option>)}
            </select>
          )}
        </div>

        {selectedWorkerId === null ? (
          <div className="text-center py-16 text-muted-foreground border rounded-lg bg-muted/20">
            <User className="size-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Select a worker above to view their time report.</p>
          </div>
        ) : (
          <>
            {/* Date filter */}
            <form onSubmit={handleFilter} className="flex flex-wrap items-end gap-3 mb-6">
              <div className="space-y-1">
                <Label htmlFor="df" className="text-xs">From</Label>
                <Input id="df" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                  className="w-40" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dt" className="text-xs">To</Label>
                <Input id="dt" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                  className="w-40" />
              </div>
              <Button type="submit" size="sm" variant="outline">Apply</Button>
              {(dateFrom || dateTo) && (
                <Button type="button" size="sm" variant="ghost"
                  onClick={() => { setDateFrom(""); setDateTo(""); fetchReport(selectedWorkerId, "", ""); }}>
                  Clear
                </Button>
              )}
            </form>

            {error && <p className="text-sm text-destructive mb-4">{error}</p>}

            {loading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
              </div>
            ) : data.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Clock className="size-8 mx-auto mb-2 opacity-40" />
                <p>No work logs found for the selected period.</p>
              </div>
            ) : (
              <>
                {/* Grand total */}
                <div className="rounded-lg border bg-muted/30 p-4 mb-6 flex items-center justify-between">
                  <span className="text-sm font-medium">Total</span>
                  <span className="text-lg font-bold">{grandTotal.toFixed(1)}h</span>
                </div>

                {/* Per-worker cards */}
                <div className="space-y-4">
                  {data.map((w) => (
                    <div key={w.user_id ?? w.username} className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-semibold">{w.username}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {w.job_card_count} job card{w.job_card_count !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <span className="text-base font-bold">{w.total_hours.toFixed(1)}h</span>
                      </div>
                      {w.process_names.length > 0 && (
                        <div className="text-xs">
                          <span className="text-muted-foreground mr-1">Processes:</span>
                          <span className="font-medium">{w.process_names.join(", ")}</span>
                        </div>
                      )}
                      {w.order_numbers.length > 0 && (
                        <div className="text-xs">
                          <span className="text-muted-foreground mr-1">Orders:</span>
                          <span className="font-mono">{w.order_numbers.join(", ")}</span>
                        </div>
                      )}
                      {w.work_dates.length > 0 && (
                        <div className="text-xs text-muted-foreground flex flex-wrap gap-1">
                          {w.work_dates.map(d => (
                            <span key={d} className="bg-muted px-1.5 py-0.5 rounded">{d}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
